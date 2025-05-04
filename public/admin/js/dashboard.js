document.addEventListener('DOMContentLoaded', function() {
    const logoutBtn = document.getElementById('logoutBtn');
    
    // İstatistik elementleri
    const activeUsersElement = document.getElementById('activeUsers');
    const totalCallsElement = document.getElementById('totalCalls');
    const recordedCallsElement = document.getElementById('recordedCalls');
    
    // API'den istatistikleri al
    fetchStats();
    
    // Çıkış butonu işlevselliği
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function() {
            window.location.href = '/admin';
        });
    }
    
    // İstatistikleri getiren fonksiyon
    async function fetchStats() {
        try {
            const response = await fetch('/api/admin/stats');
            const data = await response.json();
            
            // İstatistikleri güncelle
            if (activeUsersElement) activeUsersElement.textContent = data.activeUsers || 0;
            if (totalCallsElement) totalCallsElement.textContent = data.totalCalls || 0;
            if (recordedCallsElement) recordedCallsElement.textContent = data.recordedCalls || 0;
        } catch (error) {
            console.error('İstatistikler alınamadı:', error);
        }
    }
    
    // Her 30 saniyede bir istatistikleri güncelle
    setInterval(fetchStats, 30000);
});