class AuthService {
  constructor() {
    this.token = localStorage.getItem('auth_token');
    this.user = JSON.parse(localStorage.getItem('user') || 'null');
    this._listeners = [];
  }
  
  isAuthenticated() {
    return !!this.token;
  }
  
  isPremium() {
    return this.user && (this.user.isPremium || this.user.role === 'premium' || this.user.role === 'admin');
  }
  
  async login(email, password, remember = false) {
    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, password, remember })
      });
      
      const data = await response.json();
      
      if (data.success) {
        this.token = data.token;
        this.user = data.user;
        
        localStorage.setItem('auth_token', this.token);
        localStorage.setItem('user', JSON.stringify(this.user));
        
        this._notifyListeners();
        return { success: true };
      } else {
        return { success: false, message: data.message };
      }
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, message: 'Bağlantı hatası' };
    }
  }
  
  async register(username, email, password) {
    try {
      const response = await fetch('/api/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, email, password })
      });
      
      const data = await response.json();
      
      if (data.success) {
        this.token = data.token;
        this.user = data.user;
        
        localStorage.setItem('auth_token', this.token);
        localStorage.setItem('user', JSON.stringify(this.user));
        
        this._notifyListeners();
        return { success: true };
      } else {
        return { success: false, message: data.message };
      }
    } catch (error) {
      console.error('Register error:', error);
      return { success: false, message: 'Bağlantı hatası' };
    }
  }
  
  logout() {
    this.token = null;
    this.user = null;
    
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user');
    
    this._notifyListeners();
  }
  
  async getCurrentUser() {
    if (!this.token) {
      return null;
    }
    
    try {
      const response = await fetch('/api/me', {
        headers: {
          'Authorization': `Bearer ${this.token}`
        }
      });
      
      const data = await response.json();
      
      if (data.success) {
        this.user = data.user;
        localStorage.setItem('user', JSON.stringify(this.user));
        return this.user;
      } else {
        this.logout();
        return null;
      }
    } catch (error) {
      console.error('Get user error:', error);
      return null;
    }
  }
  
  getAuthHeader() {
    return {
      'Authorization': `Bearer ${this.token}`
    };
  }
  
  addListener(callback) {
    this._listeners.push(callback);
    return () => {
      this._listeners = this._listeners.filter(listener => listener !== callback);
    };
  }
  
  _notifyListeners() {
    this._listeners.forEach(listener => listener(this.isAuthenticated()));
  }
}

// Singleton instance
const authService = new AuthService();

// İlk yükleme anında kullanıcı bilgilerini yenile
if (authService.isAuthenticated()) {
  authService.getCurrentUser();
}