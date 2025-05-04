document.addEventListener('DOMContentLoaded', function() {
    const loginForm = document.getElementById('loginForm');
    const messageDiv = document.getElementById('message');

    loginForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        
        // Admin girişi için basit doğrulama (geçici)
        // NOT: Gerçek projede bu bilgileri veritabanından almalısınız
        if (username === 'admin' && password === 'password123') {
            messageDiv.textContent = 'Giriş başarılı! Yönlendiriliyorsunuz...';
            messageDiv.className = 'success';
            
            // Burada normalde token oluşturma ve yönlendirme yapılır
            setTimeout(() => {
                window.location.href = '/admin/dashboard.html';
            }, 1000);
        } else {
            messageDiv.textContent = 'Kullanıcı adı veya şifre hatalı!';
            messageDiv.className = 'error';
        }
    });
});