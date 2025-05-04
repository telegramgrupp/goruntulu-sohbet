const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  username: { 
    type: String, 
    required: true, 
    unique: true,
    trim: true
  },
  email: { 
    type: String, 
    required: true, 
    unique: true,
    lowercase: true,
    trim: true
  },
  password: { 
    type: String, 
    required: true 
  },
  profileImage: {
    type: String,
    default: '/img/default-profile.png'
  },
  bio: {
    type: String,
    default: ''
  },
  location: {
    type: String,
    default: ''
  },
  interests: [String],
  role: { 
    type: String, 
    enum: ['user', 'premium', 'admin'], 
    default: 'user' 
  },
  coins: {
    type: Number,
    default: 0
  },
  premiumUntil: {
    type: Date,
    default: null
  },
  accountStatus: {
    type: String,
    enum: ['active', 'suspended', 'banned'],
    default: 'active'
  },
  lastLogin: {
    type: Date,
    default: Date.now
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
});

// Şifre karşılaştırma metodu
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Şifre hashleme pre-save hook
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) {
    return next();
  }
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Premium kontrolü
userSchema.methods.isPremium = function() {
  if (this.role === 'premium' || this.role === 'admin' || 
     (this.premiumUntil && this.premiumUntil > new Date())) {
    return true;
  }
  return false;
};

module.exports = mongoose.model('User', userSchema);