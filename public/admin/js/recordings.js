document.addEventListener('DOMContentLoaded', function() {
    const recordingsTable = document.getElementById('recordingsTable');
    const noRecordings = document.getElementById('noRecordings');
    const playerContainer = document.getElementById('playerContainer');
    const videoPlayer = document.getElementById('videoPlayer');
    const recordingTitle = document.getElementById('recordingTitle');
    
    // Kayıtları getir
    fetchRecordings();
    
    async function fetchRecordings() {
        try {
            const response = await fetch('/api/recordings');
            const data = await response.json();
            
            if (data.success && data.recordings.length > 0) {
                displayRecordings(data.recordings);
            } else {
                recordingsTable.innerHTML = '';
                noRecordings.style.display = 'block';
            }
        } catch (error) {
            console.error('Kayıtlar alınamadı:', error);
            recordingsTable.innerHTML = '<tr><td colspan="4">Kayıt yüklenirken bir hata oluştu.</td></tr>';
        }
    }
    
    function displayRecordings(recordings) {
        noRecordings.style.display = 'none';
        recordingsTable.innerHTML = '';
        
        recordings.forEach(recording => {
            const row = document.createElement('tr');
            
            // Tarih formatla
            const startDate = new Date(recording.startTime);
            const formattedDate = `${startDate.toLocaleDateString()} ${startDate.toLocaleTimeString()}`;
            
            // Süre formatla
            const duration = recording.duration || 0;
            const minutes = Math.floor(duration / 60);
            const seconds = duration % 60;
            const formattedDuration = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
            
            // Katılımcılar
            const participants = recording.participants.length > 0 
                ? recording.participants.join(', ') 
                : 'Bilinmeyen';
            
            row.innerHTML = `
                <td>${formattedDate}</td>
                <td>${formattedDuration}</td>
                <td>${participants}</td>
                <td class="recording-actions">
                    <a href="#" class="play" data-id="${recording._id}" data-url="${recording.recordingUrl}">İzle</a>
                    <a href="#" class="download" data-url="${recording.recordingUrl}">İndir</a>
                    <a href="#" class="delete" data-id="${recording._id}">Sil</a>
                </td>
            `;
            
            recordingsTable.appendChild(row);
        });
        
        // Oynatma butonlarına tıklama olayı ekle
        document.querySelectorAll('.play').forEach(button => {
            button.addEventListener('click', function(e) {
                e.preventDefault();
                const url = this.getAttribute('data-url');
                const id = this.getAttribute('data-id');
                playRecording(url, id);
            });
        });
        
        // İndirme butonlarına tıklama olayı ekle
        document.querySelectorAll('.download').forEach(button => {
            button.addEventListener('click', function(e) {
                e.preventDefault();
                const url = this.getAttribute('data-url');
                window.open(url, '_blank');
            });
        });
        
        // Silme butonlarına tıklama olayı ekle
        document.querySelectorAll('.delete').forEach(button => {
            button.addEventListener('click', function(e) {
                e.preventDefault();
                const id = this.getAttribute('data-id');
                if (confirm('Bu kaydı silmek istediğinizden emin misiniz?')) {
                    deleteRecording(id);
                }
            });
        });
    }
    
    function playRecording(url, id) {
        videoPlayer.src = url;
        playerContainer.style.display = 'block';
        videoPlayer.play();
        
        // Görüntüleme alanına otomatik kaydırma
        playerContainer.scrollIntoView({ behavior: 'smooth' });
    }
    
    async function deleteRecording(id) {
        try {
            const response = await fetch(`/api/recordings/${id}`, {
                method: 'DELETE'
            });
            
            const data = await response.json();
            
            if (data.success) {
                fetchRecordings(); // Listeyi yenile
            } else {
                alert('Kayıt silinemedi: ' + (data.error || 'Bilinmeyen hata'));
            }
        } catch (error) {
            console.error('Kayıt silme hatası:', error);
            alert('Kayıt silinemedi. Lütfen tekrar deneyin.');
        }
    }
});