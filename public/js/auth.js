const authService = {
  isAuthenticated: () => !!localStorage.getItem('auth_token'),
  token: localStorage.getItem('auth_token'),
  login: async (email, password) => {
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await response.json();
    if (data.success) {
      localStorage.setItem('auth_token', data.token);
      return true;
    }
    alert(data.message);
    return false;
  },
  register: async (username, email, password) => {
    const response = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password })
    });
    const data = await response.json();
    if (data.success) {
      localStorage.setItem('auth_token', data.token);
      return true;
    }
    alert(data.message);
    return false;
  }
};

document.getElementById('login-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  if (await authService.login(email, password)) {
    document.getElementById('login-modal').style.display = 'none';
    window.location.reload();
  }
});

document.getElementById('register-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('register-username').value;
  const email = document.getElementById('register-email').value;
  const password = document.getElementById('register-password').value;
  if (await authService.register(username, email, password)) {
    document.getElementById('register-modal').style.display = 'none';
    window.location.reload();
  }
});