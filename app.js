const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const app = express();

// global middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev')); 

// health check
app.get('/health', (req, res) => {
  res.status(200).json({ 
    success: true, 
    message: 'RescueAI API is running seamlessly! 🚀' 
  });
});

// mount routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/incidents', require('./routes/incidents'));
app.use('/api/resources', require('./routes/resources'));
app.use('/api/uploads', require('./routes/uploads'));
app.use('/api/users', require('./routes/users'));
app.use('/api/volunteers', require('./routes/volunteers'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/webhook', require('./routes/webhooks'));
app.use('/api/blood', require('./routes/blood')); // 👈 Mount it here!
app.use('/api/admin', require('./routes/adminRoutes'));

// global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || 'Internal Server Error'
  });
});

// Export ONLY the app here
module.exports = app;