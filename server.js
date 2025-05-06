const express = require('express');
const http = require('http');
const path = require('path');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const multer = require('multer');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const Recording = require('./models/recordingModel');
const User = require('./models/userModel');

// Express uygulaması oluşturma
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

// JWT ayarları
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key';
const JWT_EXPIRE = process.env.JWT_EXPIRE || '30d';

// JWT token oluşturma fonksiyonu
const generateToken = (id) => {
  return jwt.sign({ id }, JWT_SECRET, {
    expiresIn: JWT_EXPIRE
  });
};

// MongoDB bağlantısı
mongoose.connect('mongodb+srv://kaiii:125899852105Ma@cluster0.tlz0pfx.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0', {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('MongoDB bağlantısı başarılı'))
.catch((err) => console.error('MongoDB bağlantı hatası:', err));

// Dosya yükleme için multer yapılandırması
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, `recording-${Date.now()}.webm`);
  }
});

const upload = multer({ storage });

// Express JSON, cookie parser ve URL-encoded middleware'leri
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Statik dosyaları sunma
app.use(express.static(path.join(__dirname, './')));

// CSS, JS ve İmaj dosyaları için rotalar
app.use('/css', express.static(path.join(__dirname, 'css')));
app.use('/js', express.static(path.join(__dirname, 'js')));
app.use('/img', express.static(path.join(__dirname, 'img')));

// Admin panel statik dosyalar için rotalar
app.use('/admin/css', express.static(path.join(__dirname, 'public/admin/css')));
app.use('/admin/js', express.static(path.join(__dirname, 'public/admin/js')));

// Kimlik doğrulama middleware'i
const protect = async (req, res, next) => {
  try {
    let token;
    
    // Token'ı header'dan al
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    } 
    // Token'ı cookie'den al
    else if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }
    
    // Token yoksa
    if (!token) {
      return res.status(401).json({ 
        success: false, 
        message: 'Bu işlemi yapmak için lütfen giriş yapın' 
      });
    }
    
    // Token'ı doğrula
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Kullanıcıyı bul
    const user = await User.findById(decoded.id);
    
    if (!user) {
      return res.status(401).json({ 
        success: false, 
        message: 'Bu token ile ilişkilendirilmiş kullanıcı bulunamadı' 
      });
    }
    
    // Kullanıcı askıya alınmış veya yasaklanmışsa
    if (user.accountStatus !== 'active') {
      return res.status(403).json({ 
        success: false, 
        message: 'Hesabınız şu anda aktif değil' 
      });
    }
    
    // Req objesine kullanıcıyı ekle
    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ 
      success: false, 
      message: 'Geçersiz token' 
    });
  }
};

// Admin kontrolü middleware'i
const adminCheck = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    return res.status(403).json({ 
      success: false, 
      message: 'Bu işlemi yapmak için admin yetkisine sahip olmalısınız' 
    });
  }
};

// Premium kontrolü middleware'i
const premiumCheck = (req, res, next) => {
  if (req.user && (req.user.role === 'premium' || req.user.role === 'admin' || 
      (req.user.premiumUntil && new Date(req.user.premiumUntil) > new Date()))) {
    next();
  } else {
    return res.status(403).json({ 
      success: false, 
      message: 'Bu özellik sadece premium üyelere açıktır' 
    });
  }
};

// Ana rotayı tanımlama
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Giriş sayfası
app.get('/login.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

// Kayıt sayfası
app.get('/register.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'register.html'));
});

// Admin giriş sayfası
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'views/admin/login.html'));
});

// Admin dashboard sayfası
app.get('/admin/dashboard.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'views/admin/dashboard.html'));
});

// Admin kullanıcı yönetim sayfası
app.get('/admin/users.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'views/admin/users.html'));
});

// Admin görüşme kayıtları sayfası
app.get('/admin/recordings.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'views/admin/recordings.html'));
});

// Kullanıcı Kayıt API'sı
app.post('/api/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    
    // Kullanıcı adı ve e-posta kontrolü
    const existingUser = await User.findOne({ 
      $or: [{ email }, { username }] 
    });
    
    if (existingUser) {
      return res.status(400).json({ 
        success: false, 
        message: 'Bu kullanıcı adı veya e-posta zaten kullanılıyor' 
      });
    }
    
    // Yeni kullanıcı oluştur
    const user = new User({
      username,
      email,
      password
    });
    
    await user.save();
    
    // Token oluştur
    const token = generateToken(user._id);
    
    res.status(201).json({
      success: true,
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        profileImage: user.profileImage
      }
    });
  } catch (error) {
    console.error('Kayıt hatası:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Sunucu hatası' 
    });
  }
});

// Kullanıcı Giriş API'sı
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // E-posta ile kullanıcıyı bul
    const user = await User.findOne({ email });
    
    if (!user) {
      return res.status(401).json({ 
        success: false, 
        message: 'Geçersiz e-posta veya şifre' 
      });
    }
    
    // Şifre kontrolü
    const isMatch = await bcrypt.compare(password, user.password);
    
    if (!isMatch) {
      return res.status(401).json({ 
        success: false, 
        message: 'Geçersiz e-posta veya şifre' 
      });
    }
    
    // Hesap durumu kontrolü
    if (user.accountStatus !== 'active') {
      return res.status(403).json({ 
        success: false, 
        message: 'Hesabınız şu anda aktif değil' 
      });
    }
    
    // Son giriş zamanını güncelle
    user.lastLogin = Date.now();
    await user.save();
    
    // Token oluştur
    const token = generateToken(user._id);
    
    // Premium durumunu kontrol et
    const isPremium = user.role === 'premium' || user.role === 'admin' || 
                     (user.premiumUntil && new Date(user.premiumUntil) > new Date());
    
    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        profileImage: user.profileImage,
        isPremium
      }
    });
  } catch (error) {
    console.error('Giriş hatası:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Sunucu hatası' 
    });
  }
});

// Mevcut Kullanıcı Bilgisi API'sı
app.get('/api/me', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    
    // Premium durumunu kontrol et
    const isPremium = user.role === 'premium' || user.role === 'admin' || 
                     (user.premiumUntil && new Date(user.premiumUntil) > new Date());
    
    res.json({
      success: true,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        profileImage: user.profileImage,
        bio: user.bio,
        location: user.location,
        interests: user.interests,
        coins: user.coins,
        isPremium,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    console.error('Kullanıcı bilgisi hatası:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Sunucu hatası' 
    });
  }
});

// Şifre Sıfırlama E-postası API'sı
app.post('/api/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    
    const user = await User.findOne({ email });
    
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'Bu e-posta ile kayıtlı kullanıcı bulunamadı' 
      });
    }
    
    // Gerçek uygulamada şifre sıfırlama e-postası gönderme işlemi
    // Şimdilik simüle ediyoruz
    
    res.json({
      success: true,
      message: 'Şifre sıfırlama bağlantısı e-posta adresinize gönderildi'
    });
  } catch (error) {
    console.error('Şifre sıfırlama hatası:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Sunucu hatası' 
    });
  }
});

// Profil Güncelleme API'sı
app.put('/api/profile', protect, async (req, res) => {
  try {
    const updates = req.body;
    const allowedUpdates = ['username', 'bio', 'location', 'interests'];
    
    // İzin verilmeyen güncelleme alanlarını filtrele
    const filteredUpdates = {};
    Object.keys(updates).forEach(key => {
      if (allowedUpdates.includes(key)) {
        filteredUpdates[key] = updates[key];
      }
    });
    
    // Kullanıcıyı güncelle
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: filteredUpdates },
      { new: true, runValidators: true }
    );
    
    res.json({
      success: true,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        profileImage: user.profileImage,
        bio: user.bio,
        location: user.location,
        interests: user.interests,
        isPremium: user.role === 'premium' || user.role === 'admin' || 
                 (user.premiumUntil && new Date(user.premiumUntil) > new Date())
      }
    });
  } catch (error) {
    console.error('Profil güncelleme hatası:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Sunucu hatası' 
    });
  }
});

// Admin istatistik bilgilerini döndüren API
app.get('/api/admin/stats', async (req, res) => {
    try {
        const totalCalls = await Recording.countDocuments();
        const totalUsers = await User.countDocuments();
        const premiumUsers = await User.countDocuments({
            $or: [
                { role: 'premium' },
                { premiumUntil: { $gt: new Date() } }
            ]
        });
        
        res.json({
            activeUsers: connectedUsers.length,
            totalCalls: totalCalls,
            recordedCalls: totalCalls,
            totalUsers: totalUsers,
            premiumUsers: premiumUsers
        });
    } catch (err) {
        console.error('İstatistik alınırken hata oluştu:', err);
        res.json({
            activeUsers: connectedUsers.length,
            totalCalls: 0,
            recordedCalls: 0,
            totalUsers: 0,
            premiumUsers: 0
        });
    }
});

// Admin login API'sı
app.post('/api/admin/login', async (req, res) => {
    const { username, password } = req.body;
    
    try {
        // Kullanıcıyı bul
        const user = await User.findOne({ username });
        
        if (!user || user.role !== 'admin') {
            return res.status(401).json({ success: false, message: 'Yetkisiz erişim' });
        }
        
        // Şifre kontrolü
        const isMatch = await bcrypt.compare(password, user.password);
        
        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Geçersiz kullanıcı adı veya şifre' });
        }
        
        // Token oluştur
        const token = generateToken(user._id);
        
        res.json({
            success: true,
            token,
            user: {
                id: user._id,
                username: user.username,
                role: user.role
            }
        });
    } catch (error) {
        console.error('Admin giriş hatası:', error);
        res.status(500).json({ success: false, message: 'Sunucu hatası' });
    }
});

// Admin kullanıcı listesi API'sı
app.get('/api/admin/users', protect, adminCheck, async (req, res) => {
    try {
        const users = await User.find().select('-password');
        
        res.json({
            success: true,
            count: users.length,
            users
        });
    } catch (error) {
        console.error('Kullanıcı listesi hatası:', error);
        res.status(500).json({ success: false, message: 'Sunucu hatası' });
    }
});

// Coin satın alma API'sı
app.post('/api/purchase/coins', protect, async (req, res) => {
    try {
        const { packageId } = req.body;
        const user = req.user;
        
        // Coin paketleri (gerçek uygulamada veritabanından alınabilir)
        const coinPackages = {
            'small': { coins: 100, price: 5 },
            'medium': { coins: 250, price: 10 },
            'large': { coins: 600, price: 20 }
        };
        
        // Geçerli paket kontrolü
        if (!coinPackages[packageId]) {
            return res.status(400).json({
                success: false,
                message: 'Geçersiz paket'
            });
        }
        
        const package = coinPackages[packageId];
        
        // Gerçek uygulamada ödeme işlemi burada yapılır
        // Şimdilik simüle ediyoruz
        
        // Kullanıcıya coin ekle
        user.coins += package.coins;
        await user.save();
        
        res.json({
            success: true,
            message: `${package.coins} coin başarıyla hesabınıza eklendi`,
            newBalance: user.coins
        });
    } catch (error) {
        console.error('Coin satın alma hatası:', error);
        res.status(500).json({ success: false, message: 'Sunucu hatası' });
    }
});

// Premium abonelik satın alma API'sı
app.post('/api/purchase/premium', protect, async (req, res) => {
    try {
        const { plan } = req.body;
        const user = req.user;
        
        // Premium planlar (gerçek uygulamada veritabanından alınabilir)
        const premiumPlans = {
            'monthly': { duration: 30, price: 9.99 },
            'yearly': { duration: 365, price: 99.99 }
        };
        
        // Geçerli plan kontrolü
        if (!premiumPlans[plan]) {
            return res.status(400).json({
                success: false,
                message: 'Geçersiz plan'
            });
        }
        
        const selectedPlan = premiumPlans[plan];
        
        // Gerçek uygulamada ödeme işlemi burada yapılır
        // Şimdilik simüle ediyoruz
        
        // Premium bitiş tarihini ayarla
        const currentDate = new Date();
        let newExpiryDate;
        
        // Mevcut premium üyelik varsa üzerine ekle
        if (user.premiumUntil && new Date(user.premiumUntil) > currentDate) {
            newExpiryDate = new Date(user.premiumUntil);
        } else {
            newExpiryDate = new Date();
        }
        
        // Gün ekle
        newExpiryDate.setDate(newExpiryDate.getDate() + selectedPlan.duration);
        
        // Kullanıcıyı güncelle
        user.premiumUntil = newExpiryDate;
        await user.save();
        
        res.json({
            success: true,
            message: `Premium üyeliğiniz ${new Date(newExpiryDate).toLocaleDateString()} tarihine kadar aktif`,
            premiumUntil: newExpiryDate
        });
    } catch (error) {
        console.error('Premium satın alma hatası:', error);
        res.status(500).json({ success: false, message: 'Sunucu hatası' });
    }
});

// Kayıt yükleme API'si
app.post('/api/recordings/upload', protect, upload.single('recording'), async (req, res) => {
  try {
    const { duration, startTime, endTime } = req.body;
    
    // Sunucuda dosya yolu
    const filePath = `/uploads/${req.file.filename}`;
    
    // Veritabanına kaydet
    const recording = new Recording({
      startTime: new Date(startTime),
      endTime: new Date(endTime),
      duration: parseInt(duration, 10),
      participants: [req.user._id],
      recordingUrl: filePath,
      messages: []
    });
    
    await recording.save();
    
    res.json({ success: true, recordingId: recording._id, url: filePath });
  } catch (err) {
    console.error('Kayıt yükleme hatası:', err);
    res.status(500).json({ success: false, error: 'Sunucu hatası' });
  }
});

// Kayıtları listeleme API'si
app.get('/api/recordings', protect, async (req, res) => {
  try {
    // Admin tüm kayıtları görebilir, normal kullanıcı sadece kendine ait kayıtları
    let recordings;
    
    if (req.user.role === 'admin') {
      recordings = await Recording.find().sort({ startTime: -1 });
    } else {
      recordings = await Recording.find({ 
        participants: req.user._id 
      }).sort({ startTime: -1 });
    }
    
    res.json({ success: true, recordings });
  } catch (err) {
    console.error('Kayıt listeleme hatası:', err);
    res.status(500).json({ success: false, error: 'Sunucu hatası' });
  }
});

// Kayıt silme API'si
app.delete('/api/recordings/:id', protect, async (req, res) => {
  try {
    const recording = await Recording.findById(req.params.id);
    
    if (!recording) {
      return res.status(404).json({ success: false, error: 'Kayıt bulunamadı' });
    }
    
    // İzin kontrolü - sadece admin veya kaydın sahibi silebilir
    if (req.user.role !== 'admin' && !recording.participants.includes(req.user._id)) {
      return res.status(403).json({ 
        success: false, 
        error: 'Bu kaydı silme yetkiniz yok' 
      });
    }
    
    // Dosyayı sil
    if (recording.recordingUrl) {
      const filePath = path.join(__dirname, recording.recordingUrl);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
    
    await Recording.findByIdAndDelete(req.params.id);
    
    res.json({ success: true });
  } catch (err) {
    console.error('Kayıt silme hatası:', err);
    res.status(500).json({ success: false, error: 'Sunucu hatası' });
  }
});

// Eşleşme isteme API'sı
app.post('/api/match', protect, async (req, res) => {
  try {
    // Eşleşme kriterleri (opsiyonel)
    const { gender, minAge, maxAge, interests } = req.body;
    
    // Premium kullanıcılar filtreleme yapabilir
    const isPremium = req.user.role === 'premium' || req.user.role === 'admin' || 
                    (req.user.premiumUntil && new Date(req.user.premiumUntil) > new Date());
    
    // Eşleşme sağlanacak
    res.json({
      success: true,
      message: 'Eşleşme bekleniyor...',
      canFilter: isPremium
    });
  } catch (error) {
    console.error('Eşleşme hatası:', error);
    res.status(500).json({ success: false, message: 'Sunucu hatası' });
  }
});

// Kayıt dosyalarını sunma
app.use('/uploads', protect, express.static(path.join(__dirname, 'uploads')));

// Bağlı istemcileri tutacak dizi
const connectedUsers = [];

// Socket.io olaylarını ayarlama

const waitingQueue = [];
const userStatus = {}; // socket.id -> 'available' | 'busy'

io.on('connection', (socket) => {
    console.log('Yeni kullanıcı bağlandı:', socket.id);
    userStatus[socket.id] = 'available';

    let userId = null;
    let room = null;

    socket.on('authenticate', (token) => {
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            userId = decoded.id;
            socket.join(`user:${userId}`);
            console.log(`Kullanıcı doğrulandı: ${userId}`);
        } catch (error) {
            console.error('Socket kimlik doğrulama hatası:', error);
        }
    });

    socket.on('request_match', async () => {
        try {
            if (waitingQueue.length > 0) {
                const matchedSocketId = waitingQueue.shift();

                if (io.sockets.sockets.get(matchedSocketId)) {
                    room = `chat:${Date.now()}`;

                    socket.join(room);
                    io.sockets.sockets.get(matchedSocketId).join(room);

                    userStatus[socket.id] = 'busy';
                    userStatus[matchedSocketId] = 'busy';

                    io.to(room).emit('match_found', { room });
                    console.log(`Eşleşme oluşturuldu: ${room}`);
                } else {
                    waitingQueue.push(socket.id);
                    userStatus[socket.id] = 'available';
                    socket.emit('waiting_for_match');
                }
            } else {
                waitingQueue.push(socket.id);
                userStatus[socket.id] = 'available';
                socket.emit('waiting_for_match');
            }
        } catch (error) {
            console.error('Eşleşme hatası:', error);
            socket.emit('match_error', 'Eşleşme sırasında bir hata oluştu');
        }
    });

    socket.on('offer', (offer, roomId) => {
        socket.to(roomId || room).emit('offer', offer);
    });

    socket.on('answer', (answer, roomId) => {
        socket.to(roomId || room).emit('answer', answer);
    });

    socket.on('candidate', (candidate, roomId) => {
        socket.to(roomId || room).emit('candidate', candidate);
    });

    socket.on('disconnect', () => {
        console.log('Kullanıcı ayrıldı:', socket.id);
        if (waitingQueue.includes(socket.id)) {
            const index = waitingQueue.indexOf(socket.id);
            waitingQueue.splice(index, 1);
        }
        delete userStatus[socket.id];
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Sunucu ${PORT} portunda çalışıyor`);
});