const express = require('express');
const http = require('http');
const path = require('path');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const multer = require('multer');
const fs = require('fs');
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

// Express JSON ve URL-encoded middleware'leri
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Statik dosyaları sunma
app.use(express.static(path.join(__dirname, './')));

// Admin panel statik dosyalar için rotalar
app.use('/admin/css', express.static(path.join(__dirname, 'public/admin/css')));
app.use('/admin/js', express.static(path.join(__dirname, 'public/admin/js')));

// Ana rotayı tanımlama
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Admin giriş sayfası
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'views/admin/login.html'));
});

// Admin dashboard sayfası
app.get('/admin/dashboard.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'views/admin/dashboard.html'));
});

// Admin kullanıcı yönetim sayfası (ileride eklenecek)
app.get('/admin/users.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'views/admin/users.html'));
});

// Admin görüşme kayıtları sayfası (ileride eklenecek)
app.get('/admin/recordings.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'views/admin/recordings.html'));
});

// Geçici admin login API (ileride veritabanı ile değiştirilecek)
app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body;
    
    // Geçici basit kontrol (Gerçek projede veritabanından kontrol edilmeli)
    if (username === 'admin' && password === 'password123') {
        res.json({ success: true, message: 'Giriş başarılı' });
    } else {
        res.status(401).json({ success: false, message: 'Kullanıcı adı veya şifre hatalı' });
    }
});

// Admin istatistik bilgilerini döndüren API (ileride veritabanından alınacak)
app.get('/api/admin/stats', async (req, res) => {
    try {
        const totalCalls = await Recording.countDocuments();
        
        res.json({
            activeUsers: connectedUsers.length,
            totalCalls: totalCalls,
            recordedCalls: totalCalls
        });
    } catch (err) {
        console.error('İstatistik alınırken hata oluştu:', err);
        res.json({
            activeUsers: connectedUsers.length,
            totalCalls: 0,
            recordedCalls: 0
        });
    }
});

// Kayıt yükleme API'si
app.post('/api/recordings/upload', upload.single('recording'), async (req, res) => {
  try {
    const { duration, startTime, endTime } = req.body;
    
    // Sunucuda dosya yolu
    const filePath = `/uploads/${req.file.filename}`;
    
    // Veritabanına kaydet
    const recording = new Recording({
      startTime: new Date(startTime),
      endTime: new Date(endTime),
      duration: parseInt(duration, 10),
      participants: [],
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
app.get('/api/recordings', async (req, res) => {
  try {
    const recordings = await Recording.find().sort({ startTime: -1 });
    res.json({ success: true, recordings });
  } catch (err) {
    console.error('Kayıt listeleme hatası:', err);
    res.status(500).json({ success: false, error: 'Sunucu hatası' });
  }
});

// Kayıt silme API'si
app.delete('/api/recordings/:id', async (req, res) => {
  try {
    const recording = await Recording.findById(req.params.id);
    
    if (!recording) {
      return res.status(404).json({ success: false, error: 'Kayıt bulunamadı' });
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

// Kayıt dosyalarını sunma
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Bağlı istemcileri tutacak dizi
const connectedUsers = [];

// Socket.io olaylarını ayarlama
io.on('connection', (socket) => {
    console.log('Yeni kullanıcı bağlandı:', socket.id);
    connectedUsers.push(socket.id);
    
    // Arama teklifi alma olayı
    socket.on('offer', (offer) => {
        console.log('Teklif alındı:', socket.id);
        socket.broadcast.emit('offer', offer);
    });
    
    // Arama cevabı alma olayı
    socket.on('answer', (answer) => {
        console.log('Cevap alındı:', socket.id);
        socket.broadcast.emit('answer', answer);
    });
    
    // ICE aday alma olayı
    socket.on('ice-candidate', (candidate) => {
        socket.broadcast.emit('ice-candidate', candidate);
    });
    
    // Mesaj alma olayı
    socket.on('message', (message) => {
        console.log('Mesaj alındı:', socket.id, message);
        socket.broadcast.emit('message', message);
    });
    
    // Arama sonlandırma olayı
    socket.on('hang-up', () => {
        console.log('Arama sonlandırıldı:', socket.id);
        socket.broadcast.emit('hang-up');
    });
    
    // Bağlantı kesilme olayı
    socket.on('disconnect', () => {
        console.log('Kullanıcı ayrıldı:', socket.id);
        const index = connectedUsers.indexOf(socket.id);
        if (index !== -1) {
            connectedUsers.splice(index, 1);
        }
        socket.broadcast.emit('hang-up');
    });
});

// Sunucuyu başlatma
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Sunucu çalışıyor: http://localhost:${PORT}`);
});