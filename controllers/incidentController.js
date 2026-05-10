const db = require('../config/database');
const admin = require('../config/firebase'); // Make sure this points to your initialized firebase-admin
const { calculateDistance } = require('../utils/helpers');

// dispatch alerts to nearby volunteers
async function dispatchToNearbyVolunteers(incidentId, victimLat, victimLng, incidentType) {
  try {
    const nearbyQuery = `
      SELECT * FROM (
        SELECT id, fcm_token, name,
        ( 6371 * acos( cos( radians($1) ) * cos( radians( latitude ) ) * cos( radians( longitude ) - radians($2) ) + 
          sin( radians($1) ) * sin( radians( latitude ) ) ) 
        ) AS distance
        FROM users
        WHERE user_type = 'volunteer' -- Matches your schema!
        AND is_available = true 
        AND fcm_token IS NOT NULL
      ) AS nearby_volunteers
      WHERE distance <= 2.0 
      ORDER BY distance ASC;
    `;

    const { rows: volunteers } = await db.query(nearbyQuery, [victimLat, victimLng]);

    console.log(`📍 Found ${volunteers.length} volunteers within 2km!`);

    if (volunteers.length === 0) {
      console.log("⚠️ No volunteers nearby.");
      return;
    }

    const tokens = volunteers.map(v => v.fcm_token);
    // build push payload
    const message = {
      notification: {
        title: '🚨 Emergency Nearby!',
        body: `A ${incidentType} was reported near your location. Tap to respond.`,
      },
      data: {
        type: 'volunteer_alert',
        incident_id: incidentId.toString(),
        incident_type: incidentType,
        distance: `${volunteers[0].distance.toFixed(1)} km`, 
      },
      tokens: tokens, 
    };

    const response = await admin.messaging().sendMulticast(message);
    console.log(`🔔 Alerts sent! Success: ${response.successCount}, Failed: ${response.failureCount}`);

  } catch (error) {
    console.error("💥 Error dispatching to volunteers:", error);
  }
}


// send silent ping to all on-duty volunteers
async function sendSilentWakeUpPing(incidentId, victimLat, victimLng, incidentType) {
  try {
    const { rows: volunteers } = await db.query(
      `SELECT fcm_token FROM users 
       WHERE user_type = 'volunteer' 
       AND is_available = true 
       AND fcm_token IS NOT NULL`
    );

    console.log(`📡 Found ${volunteers.length} available volunteers on-duty!`);

    if (volunteers.length === 0) {
      console.log("⚠️ No volunteers are currently marked as available.");
      return;
    }

    const tokens = volunteers.map(v => v.fcm_token);

    const message = {
      data: {
        type: 'silent_sos_ping',
        incident_id: String(incidentId),
        victim_lat: String(victimLat),
        victim_lng: String(victimLng),
        incident_type: incidentType || "Emergency"
      },
      tokens: tokens, // Array of all valid FCM tokens
    };

    const response = await admin.messaging().sendEachForMulticast(message);
    console.log(`👻 Silent Wake-up Pings sent! Success: ${response.successCount}, Failed: ${response.failureCount}`);
  } catch (error) {
    console.error("💥 Error sending silent ping:", error);
  }
}

// create a new incident in db and attempt dispatch
exports.createIncident = async (req, res) => {
  try {
    const { latitude, longitude, incident_type, severity, description } = req.body;
    const user_id = req.user.id;

    if (!latitude || !longitude) {
      return res.status(400).json({ success: false, message: "GPS required" });
    }

    // insert incident
    const insertResult = await db.query(
      `INSERT INTO incidents (user_id, latitude, longitude, incident_type, severity, description, status) 
       VALUES ($1, $2, $3, $4, $5, $6, 'pending') RETURNING *`,
      [user_id, latitude, longitude, incident_type, severity, description]
    );
    let incident = insertResult.rows[0];

    sendSilentWakeUpPing(incident.id, latitude, longitude, incident_type)
      .catch(err => console.error("Background Ping Error:", err));

    


    const resources = await db.query(`SELECT * FROM resources WHERE status = 'available'`);
    
    let nearestResource = null;
    let minDistance = Infinity;

    // find nearest resource
    for (let resource of resources.rows) {
      const dist = calculateDistance(latitude, longitude, resource.latitude, resource.longitude);
      if (dist < minDistance) {
        minDistance = dist;
        nearestResource = resource;
      }
    }

    // auto-dispatch nearest resource if available
    if (nearestResource) {
      await db.query(`UPDATE incidents SET status = 'dispatched' WHERE id = $1`, [incident.id]);
      incident.status = 'dispatched';

      await db.query(`UPDATE resources SET status = 'busy' WHERE id = $1`, [nearestResource.id]);

      await db.query(
        `INSERT INTO dispatches (incident_id, resource_id) VALUES ($1, $2)`,
        [incident.id, nearestResource.id]
      );

      // socket.io notifications
      const io = req.app.get('io');
      if (io) {
        io.emit('new_incident', { incident, resource: nearestResource });
        io.to(`incident_${incident.id}`).emit('dispatch_confirmed', {
          message: "Ambulance assigned and en route!",
          resource: nearestResource,
          eta_minutes: Math.round((minDistance / 40) * 60)
        });
      }
      
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

    // if no resources, alert volunteers
    res.status(201).json({
      success: true,
      message: "SOS Logged. Alerting nearby volunteers and searching for units...",
      incident
    });

  } catch (error) {
    console.error('Create Incident Error:', error);
    res.status(500).json({ success: false, message: 'Failed to create emergency SOS' });
  }
};

// list recent incidents
exports.getIncidents = async (req, res) => {
  try {
    const result = await db.query(`SELECT * FROM incidents ORDER BY created_at DESC LIMIT 50`);
    res.status(200).json({ success: true, count: result.rowCount, data: result.rows });
  } catch (error) {
    console.error('Get Incidents Error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch incidents' });
  }
};


// fetch incident history
exports.getIncidentHistory = async (req, res) => {
  try {
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


// update incident status and free resources
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