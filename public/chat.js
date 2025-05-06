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

// Auth servisi
const authService = {
  isAuthenticated: () => !!localStorage.getItem('auth_token'),
  token: localStorage.getItem('auth_token')
};

// STUN ve TURN sunucuları
const iceServers = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    }
  ]
};

// Hata gösterme fonksiyonu
function showError(message) {
  const errorDiv = document.createElement('div');
  errorDiv.className = 'error';
  errorDiv.style.cssText = 'position: fixed; top: 10px; right: 10px; background: red; color: white; padding: 10px; z-index: 1000;';
  errorDiv.textContent = message;
  document.body.appendChild(errorDiv);
  setTimeout(() => errorDiv.remove(), 5000);
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
  if (startButton) startButton.addEventListener('click', startVideo);
  if (callButton) callButton.addEventListener('click', startCall);
  if (hangupButton) hangupButton.addEventListener('click', hangup);
  if (nextButton) nextButton.addEventListener('click', findNextMatch);
  if (sendButton) sendButton.addEventListener('click', sendMessage);

  if (messageInput) {
    messageInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') sendMessage();
    });
  }

  if (authService.isAuthenticated()) {
    console.log('Kullanıcı giriş yapmış');
  } else {
    console.log('Kullanıcı giriş yapmamış');
    showError('Lütfen giriş yapın.');
  }

  startButton.disabled = false;
  callButton.disabled = true;
  hangupButton.disabled = true;
});

// Kamera ve mikrofonu başlatma
async function startVideo() {
  try {
    if (!localVideo) throw new Error('localVideo elementi bulunamadı');
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;
    startButton.disabled = true;
    callButton.disabled = false;
    initializeSocketConnection();
  } catch (error) {
    console.error('Kamera ve mikrofona erişim hatası:', error);
    showError('Kamera ve mikrofona erişim sağlanamadı. Lütfen izinleri kontrol ediniz.');
  }
}

// Soket bağlantısını başlatma
function initializeSocketConnection() {
  socket = io({
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    timeout: 20000
  });

  if (authService.isAuthenticated()) {
    socket.emit('authenticate', authService.token);
  } else {
    showError('Kimlik doğrulama için token gerekli.');
    return;
  }

  socket.on('connect', () => {
    console.log('Sunucuya bağlandı');
    socketConnected = true;
    showError('Sunucuya bağlandı.');
  });

  socket.on('connect_error', (error) => {
    console.error('Bağlantı hatası:', error);
    showError('Sunucuya bağlanılamadı. Lütfen daha sonra tekrar deneyin.');
  });

  socket.on('reconnect', (attempt) => {
    console.log(`Yeniden bağlandı, deneme: ${attempt}`);
    showError('Sunucuya yeniden bağlanıldı.');
  });

  socket.on('reconnect_error', (error) => {
    console.error('Yeniden bağlanma hatası:', error);
    showError('Sunucuya yeniden bağlanılamadı.');
  });

  socket.on('disconnect', () => {
    console.log('Sunucu bağlantısı koptu');
    showError('Sunucu bağlantısı koptu. Lütfen sayfayı yenileyin.');
    hangup();
  });

  socket.on('auth_error', (message) => {
    console.error('Kimlik doğrulama hatası:', message);
    showError(message);
  });

  socket.on('match_found', (data) => {
    console.log('Eşleşme bulundu:', data);
    currentRoom = data.room;
    startCall(currentRoom);
  });

  socket.on('waiting_for_match', () => {
    console.log('Eşleşme bekleniyor...');
    showError('Eşleşme bekleniyor...');
  });

  socket.on('match_error', (message) => {
    console.error('Eşleşme hatası:', message);
    showError(message);
  });

  socket.on('offer', async (offer) => {
    console.log('Teklif alındı:', offer);
    if (!peerConnection) createPeerConnection();

    try {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      socket.emit('answer', answer, currentRoom);
    } catch (error) {
      console.error('Teklif işleme hatası:', error);
      showError('Teklif işlenirken bir hata oluştu.');
    }
  });

  socket.on('answer', async (answer) => {
    console.log('Cevap alındı:', answer);
    try {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    } catch (error) {
      console.error('Cevap işleme hatası:', error);
      showError('Cevap işlenirken bir hata oluştu.');
    }
  });

  socket.on('ice-candidate', async (candidate) => {
    console.log('ICE adayı alındı:', candidate);
    if (candidate && peerConnection) {
      try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      } MARCH (error) {
        console.error('ICE adayı ekleme hatası:', error);
      }
    }
  });

  socket.on('message', (message) => {
    displayMessage(message, 'received');
  });

  socket.on('hang-up', () => {
    console.log('Karşı taraf aramayı sonlandırdı');
    showError('Karşı taraf aramayı sonlandırdı.');
    hangup();
  });
}

// WebRTC bağlantısını oluşturma
function createPeerConnection() {
  console.log('Peer bağlantısı oluşturuluyor...');
  peerConnection = new RTCPeerConnection(iceServers);

  if (localStream) {
    localStream.getTracks().forEach((track) => peerConnection.addTrack(track, localStream));
  } else {
    console.error('Yerel akış bulunamadı!');
    showError('Yerel medya akışı bulunamadı.');
    return;
  }

  peerConnection.ontrack = (event) => {
    console.log('Uzak akış alındı:', event.streams);
    remoteStream = event.streams[0];
    if (remoteVideo) {
      remoteVideo.srcObject = remoteStream;
    } else {
      console.error('remoteVideo elementi bulunamadı!');
      showError('Uzak video elementi bulunamadı.');
    }
  };

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      console.log('ICE adayı gönderiliyor:', event.candidate);
      socket.emit('ice-candidate', event.candidate, currentRoom);
    }
  };

  peerConnection.onconnectionstatechange = () => {
    console.log('Bağlantı durumu:', peerConnection.connectionState);
    if (peerConnection.connectionState === 'connected') {
      callStartTime = new Date();
      startRecording();
      showError('Eşler bağlandı!');
    }
    if (peerConnection.connectionState === 'disconnected' || peerConnection.connectionState === 'failed') {
      showError('Bağlantı koptu veya başarısız oldu.');
      hangup();
    }
  };

  peerConnection.oniceconnectionstatechange = () => {
    console.log('ICE bağlantı durumu:', peerConnection.iceConnectionState);
  };
}

// Arama başlatma
async function startCall(roomId = null) {
  console.log('Arama başlatılıyor, Oda ID:', roomId);
  if (!socketConnected) {
    showError('Sunucuya bağlı değilsiniz.');
    return;
  }

  if (!roomId) {
    socket.emit('request_match');
    return;
  }

  createPeerConnection();

  try {
    const offer = await peerConnection.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true
    });
    await peerConnection.setLocalDescription(offer);
    socket.emit('offer', offer, roomId);
    callButton.disabled = true;
    hangupButton.disabled = false;
  } catch (error) {
    console.error('Arama başlatma hatası:', error);
    showError('Arama başlatılırken bir hata oluştu.');
  }
}

// Aramayı sonlandırma
function hangup() {
  console.log('Arama sonlandırılıyor...');
  if (isRecording) stopRecording();

  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }

  if (remoteVideo && remoteVideo.srcObject) {
    remoteVideo.srcObject.getTracks().forEach((track) => track.stop());
    remoteVideo.srcObject = null;
  }

  if (socketConnected && currentRoom) {
    socket.emit('hang-up', currentRoom);
    currentRoom = null;
  }

  callButton.disabled = false;
  hangupButton.disabled = true;
}

// Sonraki eşleşmeyi bulma
function findNextMatch() {
  console.log('Sonraki eşleşme aranıyor...');
  hangup();
  if (socketConnected) {
    socket.emit('request_match');
  } else {
    showError('Soket bağlantısı yok, eşleşme istenemedi.');
  }
}

// Mesaj gönderme
function sendMessage() {
  if (!messageInput) return;

  const message = messageInput.value.trim();
  if (message && socketConnected && currentRoom) {
    socket.emit('message', message, currentRoom);
    displayMessage(message, 'sent');
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

// Kayıt başlatma
function startRecording() {
  if (!localStream) return;

  recordedChunks = [];
  const mimeType = MediaRecorder.isTypeSupported('video/webm') ? 'video/webm' : 'video/mp4';

  try {
    mediaRecorder = new MediaRecorder(localStream, { mimeType });
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunks.push(e.data);
    };
    mediaRecorder.onstop = () => {
      const blob = new Blob(recordedChunks, { type: mimeType });
      uploadRecording(blob);
    };
    mediaRecorder.start(1000);
    isRecording = true;
    console.log('Kayıt başladı');
  } catch (error) {
    console.error('Kayıt başlatma hatası:', error);
    showError('Kayıt başlatılamadı.');
  }
}

// Kayıt durdurma
function stopRecording() {
  if (mediaRecorder && isRecording) {
    mediaRecorder.stop();
    isRecording = false;
    console.log('Kayıt durduruldu');
  }
}

// Kaydı sunucuya yükleme
async function uploadRecording(blob) {
  if (!authService.isAuthenticated()) {
    console.log('Kayıt yükleme atlandı: Kullanıcı giriş yapmamış');
    return;
  }

  const endTime = new Date();
  const duration = Math.round((endTime - callStartTime) / 1000);

  const formData = new FormData();
  formData.append('recording', blob, 'recording.webm');
  formData.append('duration', duration);
  formData.append('startTime', callStartTime.toISOString());
  formData.append('endTime', endTime.toISOString());

  try {
    const response = await fetch('/api/recordings/upload', {
      method: 'POST',
      headers: { Authorization: `Bearer ${authService.token}` },
      body: formData
    });

    if (!response.ok) {
      throw new Error(`Kayıt yükleme başarısız: ${response.status}`);
    }

    const result = await response.json();
    console.log('Kayıt yüklendi:', result);
  } catch (error) {
    console.error('Kayıt yükleme hatası:', error);
    showError('Kayıt yüklenirken bir hata oluştu.');
  }
}