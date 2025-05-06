const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const startButton = document.getElementById('startButton');
const callButton = document.getElementById('callButton');
const hangupButton = document.getElementById('hangupButton');
const nextButton = document.getElementById('nextButton');
const messageInput = document.getElementById('messageInput');
const sendButton = document.getElementById('sendButton');
const messagesContainer = document.getElementById('messages');

let localStream, peerConnection, socket, currentRoom;
let mediaRecorder, recordedChunks = [], isRecording = false, callStartTime;

const iceServers = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'turn:turn-udp.telnyx.com:3478', username: 'telnyx', credential: 'telnyx123' },
    { urls: 'turn:turn-tcp.telnyx.com:443', username: 'telnyx', credential: 'telnyx123' }
  ]
};

function showError(message) {
  alert(message);
  console.log('Hata:', message);
}

function initializeEventListeners() {
  console.log('Olay dinleyicileri ekleniyor...');
  if (startButton) {
    startButton.addEventListener('click', startVideo);
    startButton.disabled = false;
    console.log('startButton dinleyicisi eklendi');
  } else console.log('startButton bulunamadı');
  if (callButton) {
    callButton.addEventListener('click', startCall);
    callButton.disabled = true;
    console.log('callButton dinleyicisi eklendi');
  } else console.log('callButton bulunamadı');
  if (hangupButton) {
    hangupButton.addEventListener('click', hangup);
    hangupButton.disabled = true;
    console.log('hangupButton dinleyicisi eklendi');
  } else console.log('hangupButton bulunamadı');
  if (nextButton) {
    nextButton.addEventListener('click', findNextMatch);
    console.log('nextButton dinleyicisi eklendi');
  }
  if (sendButton) {
    sendButton.addEventListener('click', sendMessage);
    console.log('sendButton dinleyicisi eklendi');
  }
  if (messageInput) {
    messageInput.addEventListener('keypress', (e) => { 
      if (e.key === 'Enter') sendMessage(); 
      console.log('messageInput keypress dinleyicisi eklendi');
    });
  }
}

document.getElementById('chat-modal').addEventListener('click', () => {
  console.log('Chat modal açıldı, dinleyiciler ekleniyor');
  initializeEventListeners();
});

async function startVideo() {
  console.log('startVideo fonksiyonu çağrıldı');
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    console.log('Kamera ve mikrofon erişimi sağlandı');
    localVideo.srcObject = localStream;
    startButton.disabled = true;
    callButton.disabled = false;
    initializeSocketConnection();
  } catch (error) {
    showError('Kamera/mikrofon erişim hatası. İzinleri kontrol edin.');
  }
}

function initializeSocketConnection() {
  console.log('Socket bağlantısı başlatılıyor');
  socket = io();
  if (authService.isAuthenticated()) {
    console.log('Kimlik doğrulama yapılıyor, token:', authService.token);
    socket.emit('authenticate', authService.token);
  } else {
    showError('Giriş yapmalısınız.');
    return;
  }

  socket.on('connect', () => console.log('Sunucuya bağlandı'));
  socket.on('connect_error', (error) => showError('Sunucuya bağlanılamadı: ' + error.message));
  socket.on('auth_error', (message) => showError('Kimlik doğrulama hatası: ' + message));
  socket.on('match_found', (data) => {
    console.log('Eşleşme bulundu:', data);
    currentRoom = data.room;
    startCall(currentRoom);
  });
  socket.on('waiting_for_match', () => showError('Eşleşme bekleniyor...'));
  socket.on('match_error', (message) => showError('Eşleşme hatası: ' + message));
  socket.on('offer', async (offer) => {
    console.log('Teklif alındı:', offer);
    if (!peerConnection) createPeerConnection();
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    socket.emit('answer', answer, currentRoom);
    console.log('Cevap gönderildi');
  });
  socket.on('answer', async (answer) => {
    console.log('Cevap alındı:', answer);
    await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
  });
  socket.on('ice-candidate', async (candidate) => {
    console.log('ICE adayı alındı:', candidate);
    if (candidate && peerConnection) await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
  });
  socket.on('message', (message) => displayMessage(message, 'received'));
  socket.on('hang-up', () => {
    showError('Karşı taraf aramayı sonlandırdı.');
    hangup();
  });
}

function createPeerConnection() {
  console.log('PeerConnection oluşturuluyor');
  peerConnection = new RTCPeerConnection(iceServers);
  localStream.getTracks().forEach((track) => peerConnection.addTrack(track, localStream));
  peerConnection.ontrack = (event) => {
    console.log('Uzak video akışı alındı');
    remoteVideo.srcObject = event.streams[0];
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
      showError('Bağlantı koptu.');
      hangup();
    }
  };
}

async function startCall(roomId) {
  console.log('startCall çağrıldı, roomId:', roomId);
  if (!socket) return showError('Sunucuya bağlı değilsiniz.');
  if (!roomId) return socket.emit('request_match');

  createPeerConnection();
  const offer = await peerConnection.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
  await peerConnection.setLocalDescription(offer);
  socket.emit('offer', offer, roomId);
  callButton.disabled = true;
  hangupButton.disabled = false;
}

function hangup() {
  console.log('hangup çağrıldı');
  if (isRecording) stopRecording();
  if (peerConnection) peerConnection.close();
  peerConnection = null;
  if (remoteVideo.srcObject) remoteVideo.srcObject = null;
  if (socket && currentRoom) socket.emit('hang-up', currentRoom);
  currentRoom = null;
  callButton.disabled = false;
  hangupButton.disabled = true;
}

function findNextMatch() {
  console.log('findNextMatch çağrıldı');
  hangup();
  if (socket) socket.emit('request_match');
}

function sendMessage() {
  console.log('sendMessage çağrıldı');
  const message = messageInput.value.trim();
  if (message && socket && currentRoom) {
    socket.emit('message', message, currentRoom);
    displayMessage(message, 'sent');
    messageInput.value = '';
  }
}

function displayMessage(message, type) {
  console.log('displayMessage çağrıldı, mesaj:', message, 'tip:', type);
  const messageElement = document.createElement('div');
  messageElement.className = `message ${type}`;
  messageElement.textContent = message;
  messagesContainer.appendChild(messageElement);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function startRecording() {
  console.log('startRecording çağrıldı');
  if (!localStream) return;
  recordedChunks = [];
  mediaRecorder = new MediaRecorder(localStream, { mimeType: 'video/webm' });
  mediaRecorder.ondataavailable = (e) => recordedChunks.push(e.data);
  mediaRecorder.onstop = () => uploadRecording(new Blob(recordedChunks, { type: 'video/webm' }));
  mediaRecorder.start(1000);
  isRecording = true;
}

function stopRecording() {
  console.log('stopRecording çağrıldı');
  if (mediaRecorder && isRecording) mediaRecorder.stop();
  isRecording = false;
}

async function uploadRecording(blob) {
  console.log('uploadRecording çağrıldı');
  if (!authService.isAuthenticated()) return;
  const endTime = new Date();
  const formData = new FormData();
  formData.append('recording', blob, 'recording.webm');
  formData.append('duration', Math.round((endTime - callStartTime) / 1000));
  formData.append('startTime', callStartTime.toISOString());
  formData.append('endTime', endTime.toISOString());

  await fetch('/api/recordings/upload', {
    method: 'POST',
    headers: { Authorization: `Bearer ${authService.token}` },
    body: formData
  });
}