const db = require('../config/database');
const admin = require('../config/firebase'); // Ensure your Firebase admin is imported!

// 1. Create Request & Broadcast to District
exports.createRequest = async (req, res) => {
  try {
    const requesterId = req.user.id ? req.user.id : 99;
    const { patient_name, blood_group, hospital_name, district, contact_number, units_required } = req.body;

    // Insert into database
    const { rows: newRequest } = await db.query(
      `INSERT INTO blood_requests 
        (requester_id, patient_name, blood_group, hospital_name, district, contact_number, units_required) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) 
       RETURNING id`,
      [requesterId, patient_name, blood_group, hospital_name, district, contact_number, units_required]
    );

    const requestId = newRequest[0].id;

    // Fetch FCM tokens of everyone in that district (except the requester)
    const { rows: districtUsers } = await db.query(
      `SELECT fcm_token FROM users WHERE district = $1 AND id != $2 AND fcm_token IS NOT NULL`,
      [district, requesterId]
    );

    // Blast the Firebase Push Notifications
    // Blast the Firebase Push Notifications
    if (districtUsers.length > 0) {
      const tokens = districtUsers.map(user => user.fcm_token);
      
      const message = {
        notification: {
          title: `🩸 URGENT: ${blood_group} Blood Needed!`,
          body: `${patient_name} needs ${units_required} units at ${hospital_name}.`,
        },
        data: {
          type: 'blood_emergency',
          requestId: requestId.toString()
        },
        tokens: tokens 
      };

      // 🚨 UPGRADE: Wait for Firebase's specific response report!
      const response = await admin.messaging().sendEachForMulticast(message);
      
      console.log(`📢 Firebase Report: Success: ${response.successCount}, Failed: ${response.failureCount}`);
      
      // If Firebase failed to deliver it, print the exact reason!
      if (response.failureCount > 0) {
        response.responses.forEach((res, idx) => {
          if (!res.success) {
            console.error(`❌ Token ${idx} Failed:`, res.error.message);
          }
        });
      }
    }

    res.status(200).json({ success: true, message: "Request broadcasted successfully!" });

  } catch (error) {
    console.error("Blood Request Error:", error);
    res.status(500).json({ success: false, message: "Server error creating broadcast" });
  }
};

// 2. Mark Request as Solved (Secured to the creator)
exports.markSolved = async (req, res) => {
  try {
    const requesterId = req.user.id;
    const requestId = req.params.id;

    const result = await db.query(
      `UPDATE blood_requests SET status = 'solved' WHERE id = $1 AND requester_id = $2 RETURNING id`,
      [requestId, requesterId]
    );

    if (result.rowCount === 0) {
      return res.status(403).json({ success: false, message: "Unauthorized or request not found." });
    }

    res.status(200).json({ success: true, message: "Request marked as solved!" });

  } catch (error) {
    console.error("Solve Blood Request Error:", error);
    res.status(500).json({ success: false, message: "Server error updating request" });
  }
};

// 3. Fetch Active Requests (For the Flutter Feed)
exports.getActiveRequests = async (req, res) => {
  try {
    // Optionally, you can filter this by req.query.district so users only see local requests!
    const { district } = req.query;
    
    let query = `SELECT * FROM blood_requests WHERE status = 'active'`;
    let params = [];

    if (district) {
      query += ` AND district = $1`;
      params.push(district);
    }

    query += ` ORDER BY created_at DESC`;

    const { rows } = await db.query(query, params);
    res.status(200).json({ success: true, requests: rows });

  } catch (error) {
    console.error("Fetch Blood Requests Error:", error);
    res.status(500).json({ success: false, message: "Server error fetching feed" });
  }
};