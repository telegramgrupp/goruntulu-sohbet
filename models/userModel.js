const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['user', 'premium', 'admin'], default: 'user' },
  profileImage: { type: String },
  bio: { type: String },
  location: { type: String },
  interests: [{ type: String }],
  coins: { type: Number, default: 0 },
  premiumUntil: { type: Date },
  accountStatus: { type: String, enum: ['active', 'suspended', 'banned'], default: 'active' },
  lastLogin: { type: Date },
  createdAt: { type: Date, default: Date.now }
});

userSchema.pre('save', async function (next) {
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, 10);
  }
  next();
});

module.exports = mongoose.model('User', userSchema);