// HTML elementlerini seçme
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const startButton = document.getElementById('startButton');
const callButton = document.getElementById('callButton');
const hangupButton = document.getElementById('hangupButton');
const messageInput = document.getElementById('messageInput');
const sendButton = document.getElementById('sendButton');
const messagesContainer = document.getElementById('messages');

// Global değişkenler
let localStream;
let remoteStream;
let peerConnection;
let socketConnected = false;
let socket;
let mediaRecorder; // Kayıt için
let recordedChunks = []; // Kayıt parçaları
let isRecording = false; // Kayıt durumu
let callStartTime; // Görüşme başlangıç zamanı

// STUN sunucuları (NAT geçişi için)
const iceServers = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// Başlat butonuna tıklama olayı
startButton.addEventListener('click', startVideo);

// Arama butonuna tıklama olayı
callButton.addEventListener('click', startCall);

// Kapatma butonuna tıklama olayı
hangupButton.addEventListener('click', hangup);

// Mesaj gönderme butonuna tıklama olayı
sendButton.addEventListener('click', sendMessage);

// Enter tuşuna basıldığında mesaj gönderme
messageInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

// Kamera ve mikrofonu başlatma
async function startVideo() {
    try {
        // Kullanıcının kamera ve mikrofonuna erişim isteme
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        
        // Yerel video elementine stream'i bağlama
        localVideo.srcObject = localStream;
        
        // Başlat butonunu devre dışı bırakma, arama butonunu etkinleştirme
        startButton.disabled = true;
        callButton.disabled = false;
        
        // Soket bağlantısını başlatma
        initializeSocketConnection();
        
    } catch (error) {
        console.error('Kamera ve mikrofona erişim hatası:', error);
        alert('Kamera ve mikrofona erişim sağlanamadı. Lütfen izinleri kontrol ediniz.');
    }
}

// Soket bağlantısını başlatma
function initializeSocketConnection() {
    // Soket.io sunucusuna bağlanma
    socket = io();
    
    // Bağlantı olayı
    socket.on('connect', () => {
        console.log('Sunucuya bağlandı');
        socketConnected = true;
    });
    
    // Bağlantı hatası olayı
    socket.on('connect_error', (error) => {
        console.error('Bağlantı hatası:', error);
        alert('Sunucuya bağlanılamadı. Sunucunun çalıştığından emin olun.');
    });
    
    // Arama teklifi alma olayı
    socket.on('offer', async (offer) => {
        if (!peerConnection) {
            createPeerConnection();
        }
        
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        
        socket.emit('answer', answer);
    });
    
    // Arama cevabı alma olayı
    socket.on('answer', async (answer) => {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    });
    
    // ICE aday alma olayı
    socket.on('ice-candidate', async (candidate) => {
        if (candidate) {
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        }
    });
    
    // Mesaj alma olayı
    socket.on('message', (message) => {
        displayMessage(message, 'received');
    });
    
    // Arama sonlandırma olayı
    socket.on('hang-up', () => {
        hangup();
    });
}

// WebRTC bağlantısını oluşturma
function createPeerConnection() {
    peerConnection = new RTCPeerConnection(iceServers);
    
    // Yerel medya akışını ekleme
    localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
    });
    
    // Uzak taraftan medya akışı alma
    peerConnection.ontrack = (event) => {
        remoteStream = event.streams[0];
        remoteVideo.srcObject = remoteStream;
    };
    
    // ICE aday oluşturma olayı
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('ice-candidate', event.candidate);
        }
    };
    
    // Bağlantı durumu değişim olayı
    peerConnection.onconnectionstatechange = () => {
        if (peerConnection.connectionState === 'connected') {
            console.log('Eşler bağlandı!');
        }
        if (peerConnection.connectionState === 'disconnected' || peerConnection.connectionState === 'failed') {
            hangup();
        }
    };
}

// Arama başlatma
async function startCall() {
    createPeerConnection();
    
    // Teklif oluşturma
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    
    // Teklifi sunucuya gönderme
    socket.emit('offer', offer);
    
    // Buton durumlarını güncelleme
    callButton.disabled = true;
    hangupButton.disabled = false;
    
    // Görüşme başlatıldığında kaydı başlat
    callStartTime = new Date();
    startRecording();
}

// Aramayı sonlandırma
function hangup() {
    // Görüşme sonlandığında kaydı durdur
    if (isRecording) {
        stopRecording();
    }
    
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    
    // Uzak video akışını durdurma
    if (remoteVideo.srcObject) {
        remoteVideo.srcObject.getTracks().forEach(track => track.stop());
        remoteVideo.srcObject = null;
    }
    
    // Sunucuya arama sonlandırma bildirimi gönderme
    if (socketConnected) {
        socket.emit('hang-up');
    }
    
    // Buton durumlarını güncelleme
    callButton.disabled = false;
    hangupButton.disabled = true;
}

// Mesaj gönderme
function sendMessage() {
    const message = messageInput.value.trim();
    
    if (message && socketConnected) {
        // Sunucuya mesaj gönderme
        socket.emit('message', message);
        
        // Kendi mesajımızı görüntüleme
        displayMessage(message, 'sent');
        
        // Mesaj kutusunu temizleme
        messageInput.value = '';
    }
}

// Mesajı görüntüleme
function displayMessage(message, type) {
    const messageElement = document.createElement('div');
    messageElement.className = `message ${type}`;
    messageElement.textContent = message;
    
    messagesContainer.appendChild(messageElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Kayıt başlatma fonksiyonu
function startRecording() {
    if (!localStream) return;
    
    recordedChunks = [];
    
    try {
        mediaRecorder = new MediaRecorder(localStream, { mimeType: 'video/webm' });
        
        mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) {
                recordedChunks.push(e.data);
            }
        };
        
        mediaRecorder.onstop = () => {
            const blob = new Blob(recordedChunks, { type: 'video/webm' });
            uploadRecording(blob);
        };
        
        mediaRecorder.start(1000); // Her saniye chunk oluştur
        isRecording = true;
        console.log('Kayıt başladı');
    } catch (err) {
        console.error('Kayıt başlatma hatası:', err);
    }
}

// Kayıt durdurma fonksiyonu
function stopRecording() {
    if (mediaRecorder && isRecording) {
        mediaRecorder.stop();
        isRecording = false;
        console.log('Kayıt durduruldu');
    }
}

// Kaydı sunucuya yükleme fonksiyonu
async function uploadRecording(blob) {
    const endTime = new Date();
    const duration = Math.round((endTime - callStartTime) / 1000); // Saniye cinsinden süre
    
    const formData = new FormData();
    formData.append('recording', blob, 'recording.webm');
    formData.append('duration', duration);
    formData.append('startTime', callStartTime.toISOString());
    formData.append('endTime', endTime.toISOString());
    
    try {
        const response = await fetch('/api/recordings/upload', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        console.log('Kayıt yüklendi:', result);
    } catch (err) {
        console.error('Kayıt yükleme hatası:', err);
    }
}