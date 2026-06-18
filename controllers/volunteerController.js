const db = require('../config/database');

// 1. UPGRADED: Register Volunteer (Matches your official 'volunteers' table schema!)
exports.register = async (req, res) => {
  try {
    const userId = req.user.id;
    const { certification_level } = req.body;

    if (!req.file) {
      return res.status(400).json({ success: false, message: "Certificate image is required." });
    }

    console.log(`📄 Streaming certificate to Cloudinary for user ${userId}...`);

    const uploadPromise = new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: 'rescueai_certificates' }, 
        (error, result) => {
          if (result) resolve(result.secure_url);
          else reject(error);
        }
      );
      stream.end(req.file.buffer); 
    });

    const certificateUrl = await uploadPromise;
    console.log(`✅ Certificate uploaded: ${certificateUrl}`);

    // 🚨 UPDATED: Using your official 'volunteers' table and exact column names
    await db.query(
      `INSERT INTO volunteers (user_id, certification_level, certification_image_url, approval_status)
       VALUES ($1, $2, $3, 'pending')
       ON CONFLICT (user_id) DO UPDATE SET 
         certification_level = EXCLUDED.certification_level,
         certification_image_url = EXCLUDED.certification_image_url,
         approval_status = 'pending'`,
      [userId, certification_level, certificateUrl]
    );

    // Update the main user table to reflect they are waiting for approval
    // (Since your users table uses 'user_type', we can temporarily set it to pending)
    await db.query(`UPDATE users SET user_type = 'pending_volunteer' WHERE id = $1`, [userId]);
    
    res.status(201).json({ 
      success: true, 
      message: 'Volunteer application submitted successfully with credentials.' 
    });

  } catch (error) {
    console.error('Volunteer register error:', error);
    res.status(500).json({ success: false, message: 'Server error submitting application' });
  }
};

// 2. Fetch all pending applications (Admin Dashboard)
exports.getPending = async (_req, res) => {
  try {
    // JOIN users and volunteers tables so the admin sees Names and Phone numbers!
    const { rows } = await db.query(`
      SELECT v.id AS volunteer_id, v.user_id, u.name, u.phone, 
             v.certification_level, v.certification_image_url, v.created_at
      FROM volunteers v
      JOIN users u ON v.user_id = u.id
      WHERE v.approval_status = 'pending' 
      ORDER BY v.created_at DESC
    `);
    
    res.status(200).json({ success: true, applications: rows });
  } catch (error) {
    console.error('Get pending volunteers error:', error);
    res.status(500).json({ success: false, message: 'Server error loading pending applications' });
  }
};

// 3. Approve an application
exports.approve = async (req, res) => {
  try {
    const volunteerId = req.params.id; // The ID from the volunteers table
    
    const { rows } = await db.query(
      `UPDATE volunteers 
       SET approval_status = 'approved' 
       WHERE id = $1 RETURNING user_id`,
      [volunteerId]
    );

    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Application not found' });

    // Mark them as a full volunteer in the main users table!
    await db.query(`UPDATE users SET user_type = 'volunteer' WHERE id = $1`, [rows[0].user_id]);
    
    res.status(200).json({ success: true, message: 'Volunteer approved successfully' });
  } catch (error) {
    console.error('Approve volunteer error:', error);
    res.status(500).json({ success: false, message: 'Server error approving volunteer' });
  }
};

// 4. Reject an application
exports.reject = async (req, res) => {
  try {
    const volunteerId = req.params.id;
    const { rejection_reason } = req.body; // Allow admins to tell them WHY they were rejected

    const { rows } = await db.query(
      `UPDATE volunteers 
       SET approval_status = 'rejected', rejection_reason = $2 
       WHERE id = $1 RETURNING user_id`,
      [volunteerId, rejection_reason || 'Did not meet requirements']
    );

    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Application not found' });

    // Revert them back to a normal citizen
    await db.query(`UPDATE users SET user_type = 'citizen' WHERE id = $1`, [rows[0].user_id]);
    
    res.status(200).json({ success: true, message: 'Volunteer rejected' });
  } catch (error) {
    console.error('Reject volunteer error:', error);
    res.status(500).json({ success: false, message: 'Server error rejecting volunteer' });
  }
};

// 5. Check personal status (Flutter App UI)
exports.getStatus = async (req, res) => {
  try {
    const userId = req.user.id;
    
    const { rows } = await db.query(`
      SELECT u.user_type, u.is_available, v.approval_status, v.rejection_reason
      FROM users u
      LEFT JOIN volunteers v ON u.id = v.user_id
      WHERE u.id = $1
    `, [userId]);

    if (rows.length === 0) return res.status(404).json({ success: false, message: 'User not found' });
    
    res.status(200).json({ success: true, status: rows[0] });
  } catch (error) {
    console.error('Volunteer status error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching volunteer status' });
  }
};

// 6. Set active availability status ("Go On Duty" / "Go Off Duty")
exports.setAvailability = async (req, res) => {
  try {
    const userId = req.user.id; // Identify them securely via their JWT!
    const { is_available } = req.body; 

    // Safety check: Only approved volunteers can go on duty
    const checkAuth = await db.query(`SELECT user_type FROM users WHERE id = $1`, [userId]);
    if (checkAuth.rows[0].user_type !== 'volunteer') {
      return res.status(403).json({ success: false, message: 'Only approved volunteers can change duty status.' });
    }

    // Sync the availability across both tables!
    await db.query(`UPDATE users SET is_available = $1 WHERE id = $2`, [Boolean(is_available), userId]);
    await db.query(`UPDATE volunteers SET is_available = $1 WHERE user_id = $2`, [Boolean(is_available), userId]);
    
    res.status(200).json({ 
      success: true, 
      message: is_available ? 'You are now On Duty' : 'You are now Off Duty' 
    });
  } catch (error) {
    console.error('Volunteer availability error:', error);
    res.status(500).json({ success: false, message: 'Server error updating availability' });
  }
};
