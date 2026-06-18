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

exports.createResource = async (req, res) => {
  try {
    const { resource_type, vehicle_number, driver_name, driver_phone, latitude, longitude, status } = req.body;
    const { rows } = await db.query(
      `INSERT INTO resources (resource_type, vehicle_number, driver_name, driver_phone, latitude, longitude, status)
       VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, 'available'))
       RETURNING *`,
      [resource_type, vehicle_number, driver_name, driver_phone, latitude, longitude, status]
    );

    res.status(201).json({ success: true, resource: rows[0] });
  } catch (error) {
    console.error('Create resource error:', error);
    res.status(500).json({ success: false, message: 'Error creating resource' });
  }
};

exports.getNearbyResources = async (req, res) => {
  try {
    const latitude = Number(req.query.latitude);
    const longitude = Number(req.query.longitude);
    const radiusKm = Number(req.query.radius_km || 5);

    if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
      return res.status(400).json({ success: false, message: 'latitude and longitude are required' });
    }

    const { rows } = await db.query(
      `SELECT *,
        (6371 * acos(
          cos(radians($1)) * cos(radians(latitude)) * cos(radians(longitude) - radians($2)) +
          sin(radians($1)) * sin(radians(latitude))
        )) AS distance_km
       FROM resources
       WHERE latitude IS NOT NULL AND longitude IS NOT NULL
       ORDER BY distance_km ASC`,
      [latitude, longitude]
    );

    const nearby = rows.filter((row) => Number(row.distance_km) <= radiusKm);
    res.status(200).json({ success: true, resources: nearby });
  } catch (error) {
    console.error('Nearby resources error:', error);
    res.status(500).json({ success: false, message: 'Error fetching nearby resources' });
  }
};