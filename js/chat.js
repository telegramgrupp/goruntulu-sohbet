// HTML elementlerini seçme
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const startButton = document.getElementById('startButton');
const callButton = document.getElementById('callButton');
const hangupButton = document.getElementById('hangupButton');
const nextButton = document.getElementById('nextButton');
const messageInput = document.getElementById('messageInput');
const sendButton = document.getElementById('sendButton');
const messagesContainer = document.getElementById('messages');

// Global değişkenler
let localStream;
let remoteStream;
let peerConnection;
let socketConnected = false;
let socket;
let currentRoom = null;
let mediaRecorder;
let recordedChunks = [];
let isRecording = false;
let callStartTime;

// STUN sunucuları (NAT geçişi için)
const iceServers = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' }
    ]
};

// Event Listeners
document.addEventListener('DOMContentLoaded', function() {
    // Butonlara tıklama olayları
    if (startButton) startButton.addEventListener('click', startVideo);
    if (callButton) callButton.addEventListener('click', startCall);
    if (hangupButton) hangupButton.addEventListener('click', hangup);
    if (nextButton) nextButton.addEventListener('click', findNextMatch);
    if (sendButton) sendButton.addEventListener('click', sendMessage);

    // Enter tuşuna basıldığında mesaj gönderme
    if (messageInput) {
        messageInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                sendMessage();
            }
        });
    }
});

// Kamera ve mikrofonu başlatma
async function startVideo() {
    try {
        console.log('Kamera erişimi isteniyor...');
        // Kullanıcının kamera ve mikrofonuna erişim isteme
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        
        console.log('Kamera erişimi sağlandı:', localStream);
        
        // Yerel video elementine stream'i bağlama
        if (localVideo) {
            localVideo.srcObject = localStream;
            console.log('Yerel video kaynağı ayarlandı');
        } else {
            console.error('localVideo elementi bulunamadı!');
        }
        
        // Buton durumlarını güncelleme
        if (startButton) startButton.disabled = true;
        if (callButton) callButton.disabled = false;
        
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
    socket = io({
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        timeout: 20000
    });
    
    // Kullanıcı doğrulaması
    const token = localStorage.getItem('auth_token');
    if (token) {
        socket.emit('authenticate', token);
    }
    
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
    
    // Eşleşme bulundu olayı
    socket.on('match_found', (data) => {
        console.log('Eşleşme bulundu:', data);
        currentRoom = data.room;
        startCall(currentRoom);
    });
    
    // Eşleşme bulunamadı olayı
    socket.on('no_match_found', () => {
        alert('Şu anda uygun bir eşleşme bulunamadı. Lütfen daha sonra tekrar deneyin.');
    });
    
    // Arama teklifi alma olayı
    socket.on('offer', async (offer) => {
        console.log('Teklif alındı:', offer);
        if (!peerConnection) {
            createPeerConnection();
        }
        
        try {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            
            console.log('Cevap gönderiliyor:', answer);
            socket.emit('answer', answer, currentRoom);
        } catch (error) {
            console.error('Teklif işleme hatası:', error);
        }
    });
    
    // Arama cevabı alma olayı
    socket.on('answer', async (answer) => {
        console.log('Cevap alındı:', answer);
        try {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
            console.log('Uzak açıklama ayarlandı');
        } catch (error) {
            console.error('Cevap işleme hatası:', error);
        }
    });
    
    // ICE aday alma olayı
    socket.on('ice-candidate', async (candidate) => {
        console.log('ICE adayı alındı:', candidate);
        if (candidate && peerConnection) {
            try {
                await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
                console.log('ICE adayı eklendi');
            } catch (error) {
                console.error('ICE adayı ekleme hatası:', error);
            }
        }
    });
    
    // Mesaj alma olayı
    socket.on('message', (message) => {
        displayMessage(message, 'received');
    });
    
    // Arama sonlandırma olayı
    socket.on('hang-up', () => {
        console.log('Karşı taraf aramayı sonlandırdı');
        hangup();
    });
}

// WebRTC bağlantısını oluşturma
function createPeerConnection() {
    console.log('Peer bağlantısı oluşturuluyor...');
    peerConnection = new RTCPeerConnection(iceServers);
    console.log('Peer bağlantısı oluşturuldu:', peerConnection);
    
    // Yerel medya akışını ekleme
    if (localStream) {
        console.log('Yerel akış ekleniyor:', localStream.getTracks().length + ' adet parça');
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
    } else {
        console.error('Yerel akış bulunamadı!');
        return;
    }
    
    // Uzak taraftan medya akışı alma
    peerConnection.ontrack = (event) => {
        console.log('Uzak akış alındı:', event.streams);
        remoteStream = event.streams[0];
        if (remoteVideo) {
            remoteVideo.srcObject = remoteStream;
            console.log('Uzak video kaynağı ayarlandı');
        } else {
            console.error('remoteVideo elementi bulunamadı!');
        }
    };
    
    // ICE aday oluşturma olayı
    peerConnection.onicecandidate = (event) => {
        console.log('ICE adayı oluşturuldu:', event.candidate);
        if (event.candidate) {
            socket.emit('ice-candidate', event.candidate, currentRoom);
            console.log('ICE adayı gönderildi');
        }
    };
    
    // Bağlantı durumu değişim olayı
    peerConnection.onconnectionstatechange = () => {
        console.log('Bağlantı durumu değişti:', peerConnection.connectionState);
        if (peerConnection.connectionState === 'connected') {
            console.log('Eşler bağlandı!');
            // Görüşme başlattığında kaydı başlat
            callStartTime = new Date();
            startRecording();
        }
        if (peerConnection.connectionState === 'disconnected' || peerConnection.connectionState === 'failed') {
            console.log('Bağlantı koptu veya başarısız oldu');
            hangup();
        }
    };
    
    // ICE bağlantı durumu değişim olayı
    peerConnection.oniceconnectionstatechange = () => {
        console.log('ICE bağlantı durumu:', peerConnection.iceConnectionState);
    };
    
    // ICE toplama durumu değişim olayı
    peerConnection.onicegatheringstatechange = () => {
        console.log('ICE toplama durumu:', peerConnection.iceGatheringState);
    };
}

// Arama başlatma
async function startCall(roomId = null) {
    console.log('Arama başlatılıyor, Oda ID:', roomId);
    if (!roomId && socketConnected) {
        // Rastgele eşleşme iste
        console.log('Rastgele eşleşme isteniyor...');
        socket.emit('request_match');
        return;
    }
    
    createPeerConnection();
    
    try {
        // Teklif oluşturma
        console.log('Teklif oluşturuluyor...');
        const offer = await peerConnection.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: true
        });
        console.log('Teklif oluşturuldu:', offer);
        
        await peerConnection.setLocalDescription(offer);
        console.log('Yerel açıklama ayarlandı');
        
        // Teklifi sunucuya gönderme
        console.log('Teklif sunucuya gönderiliyor...');
        socket.emit('offer', offer, roomId);
        
        // Buton durumlarını güncelleme
        if (callButton) callButton.disabled = true;
        if (hangupButton) hangupButton.disabled = false;
    } catch (error) {
        console.error('Arama başlatma hatası:', error);
    }
}

// Aramayı sonlandırma
function hangup() {
    console.log('Arama sonlandırılıyor...');
    // Görüşme sonlandığında kaydı durdur
    if (isRecording) {
        stopRecording();
    }
    
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
        console.log('Peer bağlantısı kapatıldı');
    }
    
    // Uzak video akışını durdurma
    if (remoteVideo && remoteVideo.srcObject) {
        remoteVideo.srcObject.getTracks().forEach(track => track.stop());
        remoteVideo.srcObject = null;
        console.log('Uzak video akışı durduruldu');
    }
    
    // Sunucuya arama sonlandırma bildirimi gönderme
    if (socketConnected && currentRoom) {
        socket.emit('hang-up', currentRoom);
        currentRoom = null;
        console.log('Sunucuya arama sonlandırma bildirimi gönderildi');
    }
    
    // Buton durumlarını güncelleme
    if (callButton) callButton.disabled = false;
    if (hangupButton) hangupButton.disabled = true;
}

// Sonraki eşleşmeyi bulma
function findNextMatch() {
    console.log('Sonraki eşleşme aranıyor...');
    // Mevcut görüşmeyi sonlandır
    hangup();
    
    // Yeni eşleşme iste
    if (socketConnected) {
        socket.emit('request_match');
        console.log('Yeni eşleşme isteği gönderildi');
    } else {
        console.error('Soket bağlantısı yok, eşleşme istenemedi');
    }
}

// Mesaj gönderme
function sendMessage() {
    if (!messageInput) return;
    
    const message = messageInput.value.trim();
    
    if (message && socketConnected && currentRoom) {
        // Sunucuya mesaj gönderme
        socket.emit('message', message, currentRoom);
        console.log('Mesaj gönderildi:', message);
        
        // Kendi mesajımızı görüntüleme
        displayMessage(message, 'sent');
        
        // Mesaj kutusunu temizleme
        messageInput.value = '';
    }
}

// Mesajı görüntüleme
function displayMessage(message, type) {
    if (!messagesContainer) return;
    
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
    // Giriş yapmamış kullanıcılar için kayıt yapılmaz
    if (!authService || !authService.isAuthenticated()) {
        console.log('Kayıt yükleme atlandı: Kullanıcı giriş yapmamış');
        return;
    }
    
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
            headers: {
                'Authorization': `Bearer ${authService.token}`
            },
            body: formData
        });
        
        const result = await response.json();
        console.log('Kayıt yüklendi:', result);
    } catch (err) {
        console.error('Kayıt yükleme hatası:', err);
    }
}

// Sayfa yüklendiğinde otomatik olarak çalışacak kontroller
document.addEventListener('DOMContentLoaded', function() {
    // Kullanıcı giriş durumunu kontrol et
    if (typeof authService !== 'undefined' && authService.isAuthenticated()) {
        console.log('Kullanıcı giriş yapmış');
        // Giriş yapmış kullanıcı için ek işlemler yapılabilir
    } else {
        console.log('Kullanıcı giriş yapmamış');
        // Giriş yapmamış kullanıcılar için ek işlemler yapılabilir
    }
    
    // Chat modali içerisindeki butonların durum kontrolü
    if (startButton) {
        startButton.disabled = false;
    }
    if (callButton) {
        callButton.disabled = true;
    }
    if (hangupButton) {
        hangupButton.disabled = true;
    }
});