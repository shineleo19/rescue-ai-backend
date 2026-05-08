require('dotenv').config();
const http = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg');
const app = require('./app');

const PORT = process.env.PORT || 3000;

// 1. Initialize Database Connection
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

pool.connect()
  .then(() => console.log('✅ PostgreSQL Connected successfully'))
  .catch(err => console.error('❌ Database connection error:', err.message));

// Export pool so we can use it in our controllers later
module.exports.pool = pool;

// 2. Create HTTP Server
const server = http.createServer(app);

// 3. Initialize Socket.io for Real-Time Tracking
const io = new Server(server, {
  cors: {
    origin: '*', // Allow all origins for the hackathon
    methods: ['GET', 'POST', 'PUT']
  }
});

// Make io available inside our Express routes
app.set('io', io);

io.on('connection', (socket) => {
  console.log(`🔌 New mobile app/dashboard connected: ${socket.id}`);

  // 1. When a user (Victim or Volunteer) opens the map for a specific emergency
  socket.on('join_incident', (incidentId) => {
    socket.join(incidentId);
    console.log(`📍 Device joined Incident Room: ${incidentId}`);
  });

  // 2. When the Volunteer's phone sends a new GPS coordinate
  socket.on('update_location', (data) => {

    console.log(`🚀 RELAYING GPS DATA FOR INCIDENT ${data.incidentId}: ${data.latitude}, ${data.longitude}`);
    // Instantly forward this to the Victim's phone in the same room!
    // data should look like: { incidentId: '7', latitude: 8.188, longitude: 77.433 }
    socket.to(data.incidentId).emit('live_location_update', data);
  });

  socket.on('disconnect', () => {
    console.log(`🔌 Client disconnected: ${socket.id}`);
  });
});

// 4. Start Server
server.listen(PORT, '0.0.0.0', () => {
  console.log(`=================================`);
  console.log(`🚀 RescueAI Server started on port ${PORT}`);
  console.log(`🌍 Health Check: http://localhost:${PORT}/health`);
  console.log(`=================================`);
});