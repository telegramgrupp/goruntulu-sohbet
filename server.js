const express = require('express');
const http = require('http');
const path = require('path');
const socketIo = require('socket.io');

// Express uygulaması oluşturma
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

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
app.get('/api/admin/stats', (req, res) => {
    res.json({
        activeUsers: connectedUsers.length,
        totalCalls: 0, // Veritabanından alınacak
        recordedCalls: 0 // Veritabanından alınacak
    });
});

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