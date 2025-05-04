const mongoose = require('mongoose');

const recordingSchema = new mongoose.Schema({
  startTime: { type: Date, default: Date.now },
  endTime: { type: Date },
  duration: { type: Number },
  participants: [{ type: String }],
  recordingUrl: { type: String },
  messages: [{
    sender: { type: String },
    text: { type: String },
    timestamp: { type: Date, default: Date.now }
  }]
});

module.exports = mongoose.model('Recording', recordingSchema);