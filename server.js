require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const multer = require('multer');
const fs = require('fs').promises;
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
    origin: [process.env.ALLOWED_ORIGIN], // Render.com URL'nizi buraya ekleyin
    methods: ['GET', 'POST']
  }
});

// JWT ayarları
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRE = process.env.JWT_EXPIRE || '30d';

// JWT token oluşturma fonksiyonu
const generateToken = (id) => {
  return jwt.sign({ id }, JWT_SECRET, { expiresIn: JWT_EXPIRE });
};

// MongoDB bağlantısı
mongoose
  .connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  })
  .then(() => console.log('MongoDB bağlantısı başarılı'))
  .catch((err) => {
    console.error('MongoDB bağlantı hatası:', err);
    process.exit(1);
  });

// Dosya yükleme için multer yapılandırması
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const dir = path.join(__dirname, 'uploads');
    try {
      await fs.mkdir(dir, { recursive: true });
      cb(null, dir);
    } catch (err) {
      cb(err);
    }
  },
  filename: (req, file, cb) => {
    cb(null, `recording-${Date.now()}.webm`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB sınır
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'video/webm') {
      cb(null, true);
    } else {
      cb(new Error('Sadece WebM dosyaları kabul edilir'), false);
    }
  }
});

// Express middleware'leri
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Kimlik doğrulama middleware'i
const protect = async (req, res, next) => {
  try {
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    if (!token) {
      return res.status(401).json({ success: false, message: 'Lütfen giriş yapın' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(401).json({ success: false, message: 'Kullanıcı bulunamadı' });
    }

    if (user.accountStatus !== 'active') {
      return res.status(403).json({ success: false, message: 'Hesabınız aktif değil' });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Token doğrulama hatası:', error.message);
    return res.status(401).json({ success: false, message: 'Geçersiz token' });
  }
};

// Admin kontrolü middleware'i
const adminCheck = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    return res.status(403).json({ success: false, message: 'Admin yetkisi gerekli' });
  }
};

// Premium kontrolü middleware'i
const premiumCheck = (req, res, next) => {
  if (
    req.user &&
    (req.user.role === 'premium' ||
      req.user.role === 'admin' ||
      (req.user.premiumUntil && new Date(req.user.premiumUntil) > new Date()))
  ) {
    next();
  } else {
    return res.status(403).json({ success: false, message: 'Premium üyelik gerekli' });
  }
};

// Rotalar
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

app.get('/login.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/login.html'));
});

app.get('/register.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/register.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/views/admin/login.html'));
});

app.get('/admin/dashboard.html', protect, adminCheck, (req, res) => {
  res.sendFile(path.join(__dirname, 'public/views/admin/dashboard.html'));
});

app.get('/admin/users.html', protect, adminCheck, (req, res) => {
  res.sendFile(path.join(__dirname, 'public/views/admin/users.html'));
});

app.get('/admin/recordings.html', protect, adminCheck, (req, res) => {
  res.sendFile(path.join(__dirname, 'public/views/admin/recordings.html'));
});

// API Endpoint'leri
app.post('/api/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    const existingUser = await User.findOne({ $or: [{ email }, { username }] });

    if (existingUser) {
      return res.status(400).json({ success: false, message: 'Kullanıcı adı veya e-posta zaten kullanılıyor' });
    }

    const user = new User({ username, email, password });
    await user.save();

    const token = generateToken(user._id);
    res.status(201).json({
      success: true,
      token,
      user: { id: user._id, username: user.username, email: user.email, role: user.role, profileImage: user.profileImage }
    });
  } catch (error) {
    console.error('Kayıt hatası:', error);
    res.status(500).json({ success: false, message: 'Sunucu hatası' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(401).json({ success: false, message: 'Geçersiz e-posta veya şifre' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Geçersiz e-posta veya şifre' });
    }

    if (user.accountStatus !== 'active') {
      return res.status(403).json({ success: false, message: 'Hesabınız aktif değil' });
    }

    user.lastLogin = Date.now();
    await user.save();

    const token = generateToken(user._id);
    const isPremium =
      user.role === 'premium' || user.role === 'admin' || (user.premiumUntil && new Date(user.premiumUntil) > new Date());

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
    res.status(500).json({ success: false, message: 'Sunucu hatası' });
  }
});

app.get('/api/me', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const isPremium =
      user.role === 'premium' || user.role === 'admin' || (user.premiumUntil && new Date(user.premiumUntil) > new Date());

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
    res.status(500).json({ success: false, message: 'Sunucu hatası' });
  }
});

app.post('/api/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ success: false, message: 'Bu e-posta ile kayıtlı kullanıcı bulunamadı' });
    }

    res.json({ success: true, message: 'Şifre sıfırlama bağlantısı e-posta adresinize gönderildi' });
  } catch (error) {
    console.error('Şifre sıfırlama hatası:', error);
    res.status(500).json({ success: false, message: 'Sunucu hatası' });
  }
});

app.put('/api/profile', protect, async (req, res) => {
  try {
    const updates = req.body;
    const allowedUpdates = ['username', 'bio', 'location', 'interests'];
    const filteredUpdates = {};
    Object.keys(updates).forEach((key) => {
      if (allowedUpdates.includes(key)) {
        filteredUpdates[key] = updates[key];
      }
    });

    const user = await User.findByIdAndUpdate(req.user._id, { $set: filteredUpdates }, { new: true, runValidators: true });

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
        isPremium:
          user.role === 'premium' || user.role === 'admin' || (user.premiumUntil && new Date(user.premiumUntil) > new Date())
      }
    });
  } catch (error) {
    console.error('Profil güncelleme hatası:', error);
    res.status(500).json({ success: false, message: 'Sunucu hatası' });
  }
});

app.get('/api/admin/stats', protect, adminCheck, async (req, res) => {
  try {
    const totalCalls = await Recording.countDocuments();
    const totalUsers = await User.countDocuments();
    const premiumUsers = await User.countDocuments({
      $or: [{ role: 'premium' }, { premiumUntil: { $gt: new Date() } }]
    });

    res.json({
      activeUsers: Object.keys(io.sockets.sockets).length,
      totalCalls,
      recordedCalls: totalCalls,
      totalUsers,
      premiumUsers
    });
  } catch (error) {
    console.error('İstatistik hatası:', error);
    res.status(500).json({ success: false, message: 'Sunucu hatası' });
  }
});

app.post('/api/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });

    if (!user || user.role !== 'admin') {
      return res.status(401).json({ success: false, message: 'Yetkisiz erişim' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Geçersiz kullanıcı adı veya şifre' });
    }

    const token = generateToken(user._id);
    res.json({
      success: true,
      token,
      user: { id: user._id, username: user.username, role: user.role }
    });
  } catch (error) {
    console.error('Admin giriş hatası:', error);
    res.status(500).json({ success: false, message: 'Sunucu hatası' });
  }
});

app.get('/api/admin/users', protect, adminCheck, async (req, res) => {
  try {
    const users = await User.find().select('-password');
    res.json({ success: true, count: users.length, users });
  } catch (error) {
    console.error('Kullanıcı listesi hatası:', error);
    res.status(500).json({ success: false, message: 'Sunucu hatası' });
  }
});

app.post('/api/purchase/coins', protect, async (req, res) => {
  try {
    const { packageId } = req.body;
    const user = req.user;

    const coinPackages = {
      small: { coins: 100, price: 5 },
      medium: { coins: 250, price: 10 },
      large: { coins: 600, price: 20 }
    };

    if (!coinPackages[packageId]) {
      return res.status(400).json({ success: false, message: 'Geçersiz paket' });
    }

    const package = coinPackages[packageId];
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

app.post('/api/purchase/premium', protect, async (req, res) => {
  try {
    const { plan } = req.body;
    const user = req.user;

    const premiumPlans = {
      monthly: { duration: 30, price: 9.99 },
      yearly: { duration: 365, price: 99.99 }
    };

    if (!premiumPlans[plan]) {
      return res.status(400).json({ success: false, message: 'Geçersiz plan' });
    }

    const selectedPlan = premiumPlans[plan];
    const currentDate = new Date();
    let newExpiryDate;

    if (user.premiumUntil && new Date(user.premiumUntil) > currentDate) {
      newExpiryDate = new Date(user.premiumUntil);
    } else {
      newExpiryDate = new Date();
    }

    newExpiryDate.setDate(newExpiryDate.getDate() + selectedPlan.duration);
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

app.post('/api/recordings/upload', protect, upload.single('recording'), async (req, res) => {
  try {
    const { duration, startTime, endTime } = req.body;
    const filePath = `/uploads/${req.file.filename}`;

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
  } catch (error) {
    console.error('Kayıt yükleme hatası:', error);
    res.status(500).json({ success: false, message: 'Sunucu hatası' });
  }
});

app.get('/api/recordings', protect, async (req, res) => {
  try {
    let recordings;
    if (req.user.role === 'admin') {
      recordings = await Recording.find().sort({ startTime: -1 });
    } else {
      recordings = await Recording.find({ participants: req.user._id }).sort({ startTime: -1 });
    }
    res.json({ success: true, recordings });
  } catch (error) {
    console.error('Kayıt listeleme hatası:', error);
    res.status(500).json({ success: false, message: 'Sunucu hatası' });
  }
});

app.delete('/api/recordings/:id', protect, async (req, res) => {
  try {
    const recording = await Recording.findById(req.params.id);
    if (!recording) {
      return res.status(404).json({ success: false, message: 'Kayıt bulunamadı' });
    }

    if (req.user.role !== 'admin' && !recording.participants.includes(req.user._id)) {
      return res.status(403).json({ success: false, message: 'Bu kaydı silme yetkiniz yok' });
    }

    if (recording.recordingUrl) {
      const filePath = path.join(__dirname, recording.recordingUrl);
      try {
        if (await fs.access(filePath).then(() => true).catch(() => false)) {
          await fs.unlink(filePath);
        }
      } catch (error) {
        console.error('Dosya silme hatası:', error);
      }
    }

    await Recording.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Kayıt silme hatası:', error);
    res.status(500).json({ success: false, message: 'Sunucu hatası' });
  }
});

app.post('/api/match', protect, async (req, res) => {
  try {
    const { gender, minAge, maxAge, interests } = req.body;
    const isPremium =
      req.user.role === 'premium' || req.user.role === 'admin' || (user.premiumUntil && new Date(user.premiumUntil) > new Date());

    res.json({ success: true, message: 'Eşleşme bekleniyor...', canFilter: isPremium });
  } catch (error) {
    console.error('Eşleşme hatası:', error);
    res.status(500).json({ success: false, message: 'Sunucu hatası' });
  }
});

app.use('/uploads', protect, express.static(path.join(__dirname, 'uploads')));

// Socket.IO olayları
const waitingQueue = [];
const userStatus = {};

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
      socket.emit('auth_error', 'Kimlik doğrulama başarısız');
    }
  });

  socket.on('request_match', async () => {
    console.log('Eşleşme isteği alındı:', socket.id, 'Kuyruk:', waitingQueue);
    try {
      // Kuyruktaki geçersiz soketleri temizle
      waitingQueue = waitingQueue.filter((id) => io.sockets.sockets.get(id));

      if (waitingQueue.length > 0 && waitingQueue[0] !== socket.id) {
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
    console.log('Teklif alındı:', socket.id, roomId);
    socket.to(roomId || room).emit('offer', offer);
  });

  socket.on('answer', (answer, roomId) => {
    console.log('Cevap alındı:', socket.id, roomId);
    socket.to(roomId || room).emit('answer', answer);
  });

  socket.on('ice-candidate', (candidate, roomId) => {
    console.log('ICE adayı alındı:', socket.id, candidate);
    socket.to(roomId || room).emit('ice-candidate', candidate);
  });

  socket.on('message', (message, roomId) => {
    socket.to(roomId || room).emit('message', message);
  });

  socket.on('hang-up', (roomId) => {
    socket.to(roomId || room).emit('hang-up');
  });

  socket.on('disconnect', () => {
    console.log('Kullanıcı ayrıldı:', socket.id);
    socket.leaveAll();
    if (waitingQueue.includes(socket.id)) {
      waitingQueue.splice(waitingQueue.indexOf(socket.id), 1);
    }
    delete userStatus[socket.id];
  });
});

// Genel hata middleware'i
app.use((err, req, res, next) => {
  console.error('Hata:', err.stack);
  res.status(500).json({ success: false, message: 'Bir şeyler ters gitti' });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Sunucu ${PORT} portunda çalışıyor`);
});