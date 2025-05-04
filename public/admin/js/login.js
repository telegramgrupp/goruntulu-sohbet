document.addEventListener('DOMContentLoaded', function() {
    const loginForm = document.getElementById('loginForm');
    const messageDiv = document.getElementById('message');

    if (loginForm) {
        loginForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const username = document.getElementById('username').value;
            const password = document.getElementById('password').value;
            
            try {
                const response = await fetch('/api/admin/login', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ username, password })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    messageDiv.textContent = 'Giriş başarılı! Yönlendiriliyorsunuz...';
                    messageDiv.className = 'success';
                    
                    setTimeout(() => {
                        window.location.href = '/admin/dashboard.html';
                    }, 1000);
                } else {
                    messageDiv.textContent = data.message || 'Kullanıcı adı veya şifre hatalı!';
                    messageDiv.className = 'error';
                }
            } catch (error) {
                messageDiv.textContent = 'Bir hata oluştu, lütfen tekrar deneyin.';
                messageDiv.className = 'error';
                console.error('Login hatası:', error);
            }
        });
    }
});