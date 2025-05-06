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

const authService = {
  isAuthenticated: () => !!localStorage.getItem('auth_token'),
  token: localStorage.getItem('auth_token')
};

const iceServers = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' }
  ]
};

function showError(message) {
  alert(message);
}

document.addEventListener('DOMContentLoaded', () => {
  const chatModal = document.getElementById('chat-modal');
  chatModal.addEventListener('click', () => {
    if (startButton) startButton.addEventListener('click', startVideo);
    if (callButton) callButton.addEventListener('click', startCall);
    if (hangupButton) hangupButton.addEventListener('click', hangup);
    if (nextButton) nextButton.addEventListener('click', findNextMatch);
    if (sendButton) sendButton.addEventListener('click', sendMessage);
    if (messageInput) messageInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });

    if (startButton) startButton.disabled = false;
    if (callButton) callButton.disabled = true;
    if (hangupButton) hangupButton.disabled = true;
  });
});

async function startVideo() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;
    startButton.disabled = true;
    callButton.disabled = false;
    initializeSocketConnection();
  } catch (error) {
    showError('Kamera/mikrofon erişim hatası. İzinleri kontrol edin.');
  }
}

function initializeSocketConnection() {
  socket = io();
  if (authService.isAuthenticated()) socket.emit('authenticate', authService.token);
  else showError('Giriş yapmalısınız.');

  socket.on('connect', () => console.log('Sunucuya bağlandı'));
  socket.on('connect_error', (error) => showError('Sunucuya bağlanılamadı.'));
  socket.on('auth_error', (message) => showError(message));
  socket.on('match_found', (data) => {
    currentRoom = data.room;
    startCall(currentRoom);
  });
  socket.on('waiting_for_match', () => showError('Eşleşme bekleniyor...'));
  socket.on('match_error', (message) => showError(message));
  socket.on('offer', async (offer) => {
    if (!peerConnection) createPeerConnection();
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    socket.emit('answer', answer, currentRoom);
  });
  socket.on('answer', async (answer) => {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
  });
  socket.on('ice-candidate', async (candidate) => {
    if (candidate && peerConnection) await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
  });
  socket.on('message', (message) => displayMessage(message, 'received'));
  socket.on('hang-up', () => {
    showError('Karşı taraf aramayı sonlandırdı.');
    hangup();
  });
}

function createPeerConnection() {
  peerConnection = new RTCPeerConnection(iceServers);
  localStream.getTracks().forEach((track) => peerConnection.addTrack(track, localStream));
  peerConnection.ontrack = (event) => {
    remoteVideo.srcObject = event.streams[0];
  };
  peerConnection.onicecandidate = (event) => {
    if (event.candidate) socket.emit('ice-candidate', event.candidate, currentRoom);
  };
  peerConnection.onconnectionstatechange = () => {
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
  hangup();
  if (socket) socket.emit('request_match');
}

function sendMessage() {
  const message = messageInput.value.trim();
  if (message && socket && currentRoom) {
    socket.emit('message', message, currentRoom);
    displayMessage(message, 'sent');
    messageInput.value = '';
  }
}

function displayMessage(message, type) {
  const messageElement = document.createElement('div');
  messageElement.className = `message ${type}`;
  messageElement.textContent = message;
  messagesContainer.appendChild(messageElement);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function startRecording() {
  if (!localStream) return;
  recordedChunks = [];
  mediaRecorder = new MediaRecorder(localStream, { mimeType: 'video/webm' });
  mediaRecorder.ondataavailable = (e) => recordedChunks.push(e.data);
  mediaRecorder.onstop = () => uploadRecording(new Blob(recordChunks, { type: 'video/webm' }));
  mediaRecorder.start(1000);
  isRecording = true;
}

function stopRecording() {
  if (mediaRecorder && isRecording) mediaRecorder.stop();
  isRecording = false;
}

async function uploadRecording(blob) {
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