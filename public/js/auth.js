// Auth işlemleri için yardımcı fonksiyonlar
const authService = {
  isAuthenticated: () => !!localStorage.getItem('auth_token'),
  token: localStorage.getItem('auth_token'),
  login: async (email, password) => {
    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await response.json();
      if (data.success) {
        localStorage.setItem('auth_token', data.token);
        return true;
      } else {
        throw new Error(data.message);
      }
    } catch (error) {
      console.error('Giriş hatası:', error);
      alert(error.message);
      return false;
    }
  },
  register: async (username, email, password) => {
    try {
      const response = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password })
      });
      const data = await response.json();
      if (data.success) {
        localStorage.setItem('auth_token', data.token);
        return true;
      } else {
        throw new Error(data.message);
      }
    } catch (error) {
      console.error('Kayıt hatası:', error);
      alert(error.message);
      return false;
    }
  },
  logout: () => {
    localStorage.removeItem('auth_token');
    window.location.reload();
  }
};

// Giriş formu işlemleri
document.getElementById('login-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  const success = await authService.login(email, password);
  if (success) {
    document.getElementById('login-modal').style.display = 'none';
    window.location.reload();
  }
});

// Kayıt formu işlemleri
document.getElementById('register-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('register-username').value;
  const email = document.getElementById('register-email').value;
  const password = document.getElementById('register-password').value;
  const success = await authService.register(username, email, password);
  if (success) {
    document.getElementById('register-modal').style.display = 'none';
    window.location.reload();
  }
});