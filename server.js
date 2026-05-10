require('dotenv').config();
const http = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg');
const app = require('./app');

const PORT = process.env.PORT || 3000;

// initialize DB connection
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

// export DB pool
module.exports.pool = pool;

// create HTTP server
const server = http.createServer(app);

// init socket.io
const io = new Server(server, {
  cors: {
    origin: '*', // Allow all origins for the hackathon
    methods: ['GET', 'POST', 'PUT']
  }
});

// attach io to app
app.set('io', io);

io.on('connection', (socket) => {
  console.log(`🔌 New mobile app/dashboard connected: ${socket.id}`);

  // when a client joins an incident room
  socket.on('join_incident', (incidentId) => {
    socket.join(incidentId);
    console.log(`📍 Device joined Incident Room: ${incidentId}`);
  });

  // relay volunteer GPS updates
  socket.on('update_location', (data) => {

    console.log(`🚀 RELAYING GPS DATA FOR INCIDENT ${data.incidentId}: ${data.latitude}, ${data.longitude}`);
    // forward to room members
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
