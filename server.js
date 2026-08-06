require('dotenv').config();
const http = require('http');
const { Server } = require('socket.io');
const cron = require('node-cron');
const app = require('./app');
const db = require('./config/database');

const PORT = process.env.PORT || 3000;

// sanity-check DB connection using shared pool
db.pool.connect()
  .then(() => console.log('✅ PostgreSQL Connected successfully (shared pool)'))
  .catch(err => console.error('❌ Database connection error:', err.message));

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

  // when a client joins an incident room (use consistent room naming)
  socket.on('join_incident', (incidentId) => {
    const room = `incident_${incidentId}`;
    socket.join(room);
    console.log(`📍 Device joined Incident Room: ${room}`);
  });

  // volunteer emits live GPS updates -> broadcast as `volunteer_location`
  socket.on('volunteer_location_update', (data) => {
    const room = `incident_${data.incidentId}`;
    console.log(`🚀 VOLUNTEER GPS FOR ${room}: ${data.latitude}, ${data.longitude}`);
    socket.to(room).emit('volunteer_location', data);
  });

  // volunteer indicates they have arrived
  socket.on('volunteer_arrived', (data) => {
    const room = `incident_${data.incidentId}`;
    console.log(`📍 Volunteer arrived for ${room}`);
    // notify room and dashboard
    socket.to(room).emit('volunteer_arrived', data);
    io.emit('volunteer_arrived', data);
  });

  // incident resolved broadcast
  socket.on('incident_resolved', (data) => {
    console.log('✅ Incident resolved:', data.incidentId);
    io.emit('incident_resolved', data);
  });

  // volunteer accepted an incident - notify victim and dashboard
  socket.on('volunteer_accepted', (data) => {
    const room = `incident_${data.incidentId}`;
    console.log('👍 Volunteer accepted:', data);
    io.to(room).emit('volunteer_accepted', data);
    io.emit('volunteer_accepted_dashboard', data);
  });

  // generic status update relay
  socket.on('status_update', (data) => {
    const room = data.incidentId ? `incident_${data.incidentId}` : null;
    if (room) io.to(room).emit('status_update', data);
    io.emit('status_update', data);
  });

  socket.on('disconnect', () => {
    console.log(`🔌 Client disconnected: ${socket.id}`);
  });
});

cron.schedule('0 * * * *', async () => {
  console.log("🧹 Running background sweeper: Cleaning up expired SOS incidents...");

  try {
    // Find incidents older than 12 hours that are still 'pending' and mark them 'resolved'
    // (Or 'expired' if you want to add that status to your frontend logic)
    const result = await db.query(
      `UPDATE incidents 
       SET status = 'resolved', 
           resolved_at = NOW(),
           cancelled_reason = 'Auto-expired after 12 hours'
       WHERE status = 'pending' 
       AND created_at < NOW() - INTERVAL '12 hours'`
    );

    if (result.rowCount > 0) {
      console.log(`✅ Sweeper finished: Auto-resolved ${result.rowCount} abandoned emergencies.`);
      
      // If you want, you can also tell the Admin dashboard to clear them:
      if (app.get('io')) {
        app.get('io').emit('admin_sweep_complete'); 
      }
    } else {
      console.log("✅ Sweeper finished: Map is clean.");
    }
  } catch (error) {
    console.error("💥 Sweeper Error:", error);
  }
});

// 4. Start Server
server.listen(PORT, '0.0.0.0', () => {
  console.log(`=================================`);
  console.log(`🚀 RescueAI Server started on port ${PORT}`);
  console.log(`🌍 Health Check: http://localhost:${PORT}/health`);
  console.log(`=================================`);
});
  