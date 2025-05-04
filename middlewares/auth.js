const jwt = require('jsonwebtoken');
const User = require('../models/userModel');

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key';

exports.protect = async (req, res, next) => {
  try {
    let token;
    
    // Token'ı header'dan al
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    } 
    // Token'ı cookie'den al
    else if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }
    
    // Token yoksa
    if (!token) {
      return res.status(401).json({ 
        success: false, 
        message: 'Bu işlemi yapmak için lütfen giriş yapın' 
      });
    }
    
    // Token'ı doğrula
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Kullanıcıyı bul
    const user = await User.findById(decoded.id);
    
    if (!user) {
      return res.status(401).json({ 
        success: false, 
        message: 'Bu token ile ilişkilendirilmiş kullanıcı bulunamadı' 
      });
    }
    
    // Kullanıcı askıya alınmış veya yasaklanmışsa
    if (user.accountStatus !== 'active') {
      return res.status(403).json({ 
        success: false, 
        message: 'Hesabınız şu anda aktif değil' 
      });
    }
    
    // Req objesine kullanıcıyı ekle
    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ 
      success: false, 
      message: 'Geçersiz token' 
    });
  }
};

// Admin kontrolü
exports.admin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    return res.status(403).json({ 
      success: false, 
      message: 'Bu işlemi yapmak için admin yetkisine sahip olmalısınız' 
    });
  }
};

// Premium kontrolü
exports.premium = (req, res, next) => {
  if (req.user && (req.user.role === 'premium' || req.user.role === 'admin' ||
                (req.user.premiumUntil && new Date(req.user.premiumUntil) > new Date()))) {
    next();
  } else {
    return res.status(403).json({ 
      success: false, 
      message: 'Bu özellik sadece premium üyelere açıktır' 
    });
  }
};