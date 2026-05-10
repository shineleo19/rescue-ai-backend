const db = require('../config/database');
const { calculateDistance } = require('../utils/helpers');

// update ambulance/resource location in db and broadcast
exports.updateLocation = async (req, res) => {
  try {
    const { id } = req.params;
    const { latitude, longitude, incident_id } = req.body;
    await db.query(
      `UPDATE resources SET latitude = $1, longitude = $2, last_updated = NOW() WHERE id = $3 RETURNING *`,
      [latitude, longitude, id]
    );
    // add to location history
    await db.query(
      `INSERT INTO location_history (resource_id, latitude, longitude) VALUES ($1, $2, $3)`,
      [id, latitude, longitude]
    );

    // broadcast live location via WebSockets
    const io = req.app.get('io');
    
    const payload = {
      resource_id: id,
      latitude,
      longitude,
      timestamp: new Date()
    };

    // if tied to an incident, target that room
    if (incident_id) {
      io.to(`incident_${incident_id}`).emit('resource_location_update', payload);
    } else {
      // broadcast to global map
      io.emit('global_resource_movement', payload);
    }

    res.status(200).json({ success: true, message: 'Location updated and broadcasted' });

  } catch (error) {
    console.error('Update Location Error:', error);
    res.status(500).json({ success: false, message: 'Failed to update location' });
  }
};


exports.getAllResources = async (req, res) => {
  try {
    // We fetch everything so the map knows where every unit is
    const { rows } = await db.query(`SELECT * FROM resources ORDER BY id ASC`);
    
    res.status(200).json({ 
      success: true, 
      count: rows.length,
      resources: rows 
    });
  } catch (error) {
    console.error("Error fetching resources:", error);
    res.status(500).json({ 
      success: false, 
      message: "Error fetching resources from database" 
    });
  }
};