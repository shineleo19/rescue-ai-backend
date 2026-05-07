const db = require('../config/database');
const admin = require('../config/firebase'); // Make sure this points to your initialized firebase-admin
const { calculateDistance } = require('../utils/helpers');

exports.createIncident = async (req, res) => {
  try {
    const { latitude, longitude, incident_type, severity, description } = req.body;
    const user_id = req.user.id; // Comes securely from our JWT auth middleware

    // Bouncer (Safety Check)
    if (!latitude || !longitude) {
      return res.status(400).json({ success: false, message: "GPS required" });
    }

    // 1. Insert the new emergency incident into the database
    const insertResult = await db.query(
      `INSERT INTO incidents (user_id, latitude, longitude, incident_type, severity, description, status) 
       VALUES ($1, $2, $3, $4, $5, $6, 'pending') RETURNING *`,
      [user_id, latitude, longitude, incident_type, severity, description]
    );
    let incident = insertResult.rows[0];

    // ====================================================================
    // 🚨 NEW: 5km SQL Haversine Volunteer Alert Logic
    // ====================================================================
    try {
      // Calculates distance natively in PostgreSQL and filters <= 5.0km
      const nearbyVolunteers = await db.query(
        `SELECT fcm_token FROM users 
         WHERE user_type = 'citizen' 
         AND fcm_token IS NOT NULL
         AND latitude IS NOT NULL 
         AND longitude IS NOT NULL
         AND (
           6371 * acos(
             cos(radians($1)) * cos(radians(latitude)) * 
             cos(radians(longitude) - radians($2)) + 
             sin(radians($1)) * sin(radians(latitude))
           )
         ) <= 5.0`, 
        [latitude, longitude]
      );

      const tokens = nearbyVolunteers.rows.map(user => user.fcm_token);

      if (tokens.length > 0) {
        const message = {
          notification: {
            title: '🚨 EMERGENCY NEARBY!',
            body: `A ${severity} ${incident_type} has been reported within 5km. Can you provide first aid?`,
          },
          data: {
            type: 'volunteer_alert',
            incident_id: String(incident.id),
            incident_type: incident_type || "Emergency",
            latitude: String(latitude),
            longitude: String(longitude)
          },
          tokens: tokens,
        };

        const response = await admin.messaging().sendMulticast(message);
        console.log(`✅ Sent ${response.successCount} push notifications to nearby volunteers.`);
      } else {
        console.log(`ℹ️ No volunteers found within 5km of the incident.`);
      }
    } catch (fcmError) {
      console.error("💥 FCM Alert Error (Continuing with ambulance dispatch):", fcmError);
    }
    // ====================================================================

    // 2. Find ALL 'available' resources (ambulances, police, etc.)
    const resources = await db.query(`SELECT * FROM resources WHERE status = 'available'`);
    
    let nearestResource = null;
    let minDistance = Infinity;

    // 3. Loop through resources to find the closest one
    for (let resource of resources.rows) {
      const dist = calculateDistance(latitude, longitude, resource.latitude, resource.longitude);
      if (dist < minDistance) {
        minDistance = dist;
        nearestResource = resource;
      }
    }

    // 4. If we found an ambulance nearby, AUTO-DISPATCH it!
    if (nearestResource) {
      await db.query(`UPDATE incidents SET status = 'dispatched' WHERE id = $1`, [incident.id]);
      incident.status = 'dispatched';

      await db.query(`UPDATE resources SET status = 'busy' WHERE id = $1`, [nearestResource.id]);

      await db.query(
        `INSERT INTO dispatches (incident_id, resource_id) VALUES ($1, $2)`,
        [incident.id, nearestResource.id]
      );

      // --- SOCKET.IO LOGIC ---
      const io = req.app.get('io');
      io.emit('new_incident', { incident, resource: nearestResource });
      io.to(`incident_${incident.id}`).emit('dispatch_confirmed', {
        message: "Ambulance assigned and en route!",
        resource: nearestResource,
        eta_minutes: Math.round((minDistance / 40) * 60)
      });
      
      return res.status(201).json({
        success: true,
        message: "Help is on the way!",
        incident,
        nearest_resource: {
          ...nearestResource,
          distance_km: parseFloat(minDistance.toFixed(2))
        }
      });
    }

    // 5. If no resources are available
    res.status(201).json({
      success: true,
      message: "SOS Logged. Searching for available units...",
      incident
    });

  } catch (error) {
    console.error('Create Incident Error:', error);
    res.status(500).json({ success: false, message: 'Failed to create emergency SOS' });
  }
};

exports.getIncidents = async (req, res) => {
  try {
    // Fetch all incidents for the dashboard, ordered by newest first
    const result = await db.query(`SELECT * FROM incidents ORDER BY created_at DESC LIMIT 50`);
    res.status(200).json({ success: true, count: result.rowCount, data: result.rows });
  } catch (error) {
    console.error('Get Incidents Error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch incidents' });
  }
};


// Fetch incident history (newest first)
exports.getIncidentHistory = async (req, res) => {
  try {
    // Queries the database for all incidents, sorted by newest ID first
    const history = await db.query(`SELECT * FROM incidents ORDER BY id DESC LIMIT 50`);
    
    res.status(200).json({ 
      success: true, 
      count: history.rowCount,
      data: history.rows 
    });
  } catch (error) {
    console.error('Error fetching history:', error);
    res.status(500).json({ success: false, message: 'Server error fetching history' });
  }
};


// Update incident status (e.g., marking it as 'resolved')
exports.updateIncident = async (req, res) => {
  const incidentId = req.params.id; // Grabs the '45' from the URL
  const { status, resource_id, incident_type, severity, description } = req.body;
  try {
    

    // 1. Update the incident's status
    await db.query(
      `UPDATE incidents 
       SET 
         status = COALESCE($1, status),
         incident_type = COALESCE($2, incident_type),
         severity = COALESCE($3, severity),
         description = COALESCE($4, description)
       WHERE id = $5`,
      [status, incident_type, severity, description, incidentId]
    );

    // 2. If the incident is being resolved, free up the ambulance!
    if (status === 'resolved' && resource_id) {
      await db.query(
        `UPDATE resources SET status = 'available' WHERE id = $1`,
        [resource_id]
      );
    }

    res.status(200).json({ 
      success: true, 
      message: `Incident #${incidentId} successfully updated to '${status}'.` 
    });

  } catch (error) {
    console.error('Error updating incident:', error);
    res.status(500).json({ success: false, message: 'Server error updating incident' });
  }
};