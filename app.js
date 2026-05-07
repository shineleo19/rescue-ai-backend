const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const app = express();

// Global Middleware
app.use(helmet()); // Security headers
app.use(cors()); // Allow requests from your mobile app
app.use(express.json({ limit: '10mb' })); // Allow large payloads for base64 images
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev')); // Log API requests to terminal

// Health Check Route (To test if API is alive)
app.get('/health', (req, res) => {
  res.status(200).json({ 
    success: true, 
    message: 'RescueAI API is running seamlessly! 🚀' 
  });
});

// ✅ THIS IS THE MAGIC LINE: It connects app.js to routes/auth.js
app.use('/api/auth', require('./routes/auth'));
app.use('/api/incidents', require('./routes/incidents')); // <-- ADD THIS LINE
app.use('/api/resources', require('./routes/resources'));
app.use('/api/users', require('./routes/users'));

// Global Error Handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || 'Internal Server Error'
  });
});

// Export ONLY the app here
module.exports = app;