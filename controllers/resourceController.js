const db = require('../config/database');
const { calculateDistance } = require('../utils/helpers');

exports.updateLocation = async (req, res) => {
  try {
    const { id } = req.params; // Ambulance ID
    const { latitude, longitude, incident_id } = req.body;

    // 1. Update the ambulance's current location in the database
    await db.query(
      `UPDATE resources SET latitude = $1, longitude = $2, last_updated = NOW() WHERE id = $3 RETURNING *`,
      [latitude, longitude, id]
    );

    // 2. Add to location history (draws the route on the map later!)
    await db.query(
      `INSERT INTO location_history (resource_id, latitude, longitude) VALUES ($1, $2, $3)`,
      [id, latitude, longitude]
    );

    // 3. Broadcast live location via WebSockets
    const io = req.app.get('io');
    
    const payload = {
      resource_id: id,
      latitude,
      longitude,
      timestamp: new Date()
    };

    // If we know which incident this ambulance is rushing to, alert that specific user
    if (incident_id) {
      io.to(`incident_${incident_id}`).emit('resource_location_update', payload);
    } else {
      // Otherwise, just broadcast to the global map dashboard
      io.emit('global_resource_movement', payload);
    }

    res.status(200).json({ success: true, message: 'Location updated and broadcasted' });

  } catch (error) {
    console.error('Update Location Error:', error);
    res.status(500).json({ success: false, message: 'Failed to update location' });
  }
};