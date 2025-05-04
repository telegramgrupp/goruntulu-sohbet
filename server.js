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

// Statik dosyaları sunma
app.use(express.static(path.join(__dirname, './')));

// Ana rotayı tanımlama
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
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