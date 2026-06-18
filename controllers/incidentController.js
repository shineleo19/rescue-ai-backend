const db = require('../config/database');
const admin = require('../config/firebase'); // Make sure this points to your initialized firebase-admin
const { calculateDistance } = require('../utils/helpers');
const cloudinary = require('../config/cloudinary');

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
// 🚨 FIX 1: Define as a local constant first!
const sendSilentWakeUpPing = async (incidentId, victimLat, victimLng, incidentType) => {
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
      tokens: tokens, 
    };

    const response = await admin.messaging().sendEachForMulticast(message);
    console.log(`👻 Silent Wake-up Pings sent! Success: ${response.successCount}`);
  } catch (error) {
    console.error("💥 Error sending silent ping:", error);
  }
};

// Now export it so your Webhook Controller can still use it!
exports.sendSilentWakeUpPing = sendSilentWakeUpPing;

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
// 🚨 UPGRADED: Fetch Personal Incident History (With Volunteer Details Joined)
exports.getIncidentHistory = async (req, res) => {
  try {
    const userId = req.user.id; // Securely extracted from JWT

    // We use a LEFT JOIN so we still get the incident even if no volunteer accepted it yet!
    const query = `
      SELECT 
          i.*, 
          v.name AS volunteer_name, 
          v.phone AS volunteer_phone,
          v.profile_image_url AS volunteer_image
      FROM incidents i
      LEFT JOIN users v ON i.accepted_by = v.id
      WHERE i.user_id = $1
      ORDER BY i.created_at DESC
    `;

    const { rows, rowCount } = await db.query(query, [userId]);

    res.status(200).json({ 
      success: true, 
      count: rowCount,
      data: rows 
    });

  } catch (error) {
    console.error("❌ History Fetch Error:", error.message);
    res.status(500).json({ success: false, message: "Server error fetching history" });
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

// get a single incident by id
exports.getIncidentById = async (req, res) => {
  try {
    const incidentId = req.params.id;
    const { rows } = await db.query(`SELECT * FROM incidents WHERE id = $1`, [incidentId]);
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Incident not found' });
    res.status(200).json({ success: true, incident: rows[0] });
  } catch (error) {
    console.error('Error fetching incident:', error);
    res.status(500).json({ success: false, message: 'Server error fetching incident' });
  }
};

// volunteer accepts an incident
exports.acceptIncident = async (req, res) => {
  try {
    const incidentId = req.params.id;
    const volunteerId = req.user.id;

    // ensure caller is a volunteer
    if (req.user.user_type !== 'volunteer') return res.status(403).json({ success: false, message: 'Only volunteers can accept incidents' });

    // mark incident accepted
    await db.query(`UPDATE incidents SET status = 'accepted', accepted_by = $1, accepted_at = NOW() WHERE id = $2`, [volunteerId, incidentId]);

    // notify via socket + FCM
    const io = req.app.get('io');
    const payload = { incidentId, volunteerId };
    if (io) {
      io.to(`incident_${incidentId}`).emit('volunteer_accepted', payload);
      io.emit('volunteer_accepted_dashboard', payload);
    }

    res.status(200).json({ success: true, message: 'Incident accepted', volunteer_id: volunteerId });
  } catch (error) {
    console.error('Error accepting incident:', error);
    res.status(500).json({ success: false, message: 'Server error accepting incident' });
  }
};

// update status (dedicated endpoint)
exports.updateStatus = async (req, res) => {
  try {
    const incidentId = req.params.id;
    const { status } = req.body;
    if (!status) return res.status(400).json({ success: false, message: 'status is required' });

    await db.query(`UPDATE incidents SET status = $1 WHERE id = $2`, [status, incidentId]);

    // emit status update
    const io = req.app.get('io');
    if (io) io.emit('status_update', { incidentId, status });

    res.status(200).json({ success: true, message: `Status updated to ${status}` });
  } catch (error) {
    console.error('Error updating status:', error);
    res.status(500).json({ success: false, message: 'Server error updating status' });
  }
};

// mark as resolved and compute response time
// 🚨 FIX 2: Secured Resolver with Socket.io Cleanup
exports.resolveIncident = async (req, res) => {
  try {
    const incidentId = req.params.id;
    const userId = req.user.id; // Securely grabbed from JWT token
    const { resource_id } = req.body; 

    // ONLY allow the victim OR the assigned volunteer to resolve it
    const result = await db.query(
      `UPDATE incidents 
       SET status = 'resolved', resolved_at = NOW() 
       WHERE id = $1 AND (user_id = $2 OR accepted_by = $2)
       RETURNING id`, 
      [incidentId, userId]
    );

    if (result.rowCount === 0) {
      return res.status(403).json({ success: false, message: 'Unauthorized or incident already resolved.' });
    }

    // free up resource if provided
    if (resource_id) {
      await db.query(`UPDATE resources SET status = 'available' WHERE id = $1`, [resource_id]);
    }

    // emit resolved event to close the tracking room!
    const io = req.app.get('io');
    if (io) {
      io.to(`incident_${incidentId}`).emit('status_update', { 
        status: 'resolved', 
        message: 'This emergency has been resolved.' 
      });
      io.emit('incident_resolved', { incidentId });
    }

    res.status(200).json({ success: true, message: 'Incident resolved' });
  } catch (error) {
    console.error('Error resolving incident:', error);
    res.status(500).json({ success: false, message: 'Server error resolving incident' });
  }
};


exports.updateIncidentDetails = async (req, res) => {
  try {
    const incidentId = req.params.id;
    
    // Because we are using FormData (Multer), booleans come in as strings!
    const { incident_type, severity, description } = req.body;
    const needs_volunteer = req.body.needs_volunteer === 'true' || req.body.needs_volunteer === true;
    
    let imageUrl = null;

    // 1. STREAM TO CLOUDINARY (If an image was attached)
    if (req.file) {
      console.log(`📸 Image received for Incident ${incidentId}. Streaming to Cloudinary...`);
      
      const uploadPromise = new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: 'rescueai_incidents' }, 
          (error, result) => {
            if (result) resolve(result.secure_url);
            else reject(error);
          }
        );
        stream.end(req.file.buffer); 
      });

      imageUrl = await uploadPromise;
      console.log(`✅ Image hosted successfully: ${imageUrl}`);
    }

    // 2. UPDATE POSTGRESQL DATABASE
    // We use COALESCE to ensure we don't overwrite existing data with nulls if a field is omitted.
    const result = await db.query(
      `UPDATE incidents 
       SET incident_type = COALESCE($1, incident_type),
           severity = COALESCE($2, severity),
           description = COALESCE($3, description),
           needs_volunteer = COALESCE($4, needs_volunteer),
           image_url = COALESCE($5, image_url),
           status = CASE WHEN $4 = true THEN 'pending' ELSE 'self-routed' END,
           updated_at = NOW()
       WHERE id = $6 RETURNING *`,
      [incident_type, severity, description, needs_volunteer, imageUrl, incidentId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: "Incident not found" });
    }
    const updatedIncident = result.rows[0];

    // 3. ALERT THE LIVE MAP (Admin Dashboard Update)
    const io = req.app.get('io');
    if (io) {
      // Broadcast the update (with the new photo URL!) to all admins
      io.emit('incident_updated', { incident: updatedIncident }); 
    }

    // 4. CONDITIONALLY DISPATCH VOLUNTEERS
    if (needs_volunteer === true) {
      console.log(`🚨 Incident ${incidentId}: Volunteer support requested! Waking up nearby clients...`);
      exports.sendSilentWakeUpPing(
        updatedIncident.id, 
        updatedIncident.latitude, 
        updatedIncident.longitude, 
        updatedIncident.incident_type
      ).catch(err => console.error("Ping Error:", err));
    }

    res.status(200).json({ 
      success: true, 
      message: "Emergency details updated successfully",
      data: updatedIncident
    });

  } catch (error) {
    console.error("Error updating incident:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};