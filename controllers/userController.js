const db = require('../config/database');

exports.getUserProfile = async (req, res) => {
  try {
    // 1. Get the user ID from the token (from your verifyToken middleware)
    const userId = req.user.id; 

    // 2. Find the user in PostgreSQL
    const { rows } = await db.query(
      `SELECT id, name, phone,email, user_type, is_available, 
              blood_type, allergies, medical_conditions, 
              emergency_contact_1, emergency_contact_1_phone, 
              emergency_contact_2, emergency_contact_2_phone 
       FROM users WHERE id = $1`,
      [userId]
    );

    // If no user comes back, they don't exist
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // 3. Send the data back to Flutter!
    // We wrap it in a "user" object exactly how your Flutter app expects it.
    res.status(200).json({
      success: true,
      user: rows[0]
    });

  } catch (error) {
    console.error("Fetch Profile Error:", error);
    res.status(500).json({ success: false, message: 'Server error fetching profile' });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const userId = req.user.id; // From your JWT token
    
    // Extracting the EXACT columns from your schema
    const { 
      name, 
      email,
      blood_type, 
      allergies, 
      medical_conditions, 
      emergency_contact_1, 
      emergency_contact_1_phone,
      emergency_contact_2,
      emergency_contact_2_phone
    } = req.body;

    // The COALESCE trick ensures we don't accidentally erase data if the user leaves a field blank
    await db.query(
      `UPDATE users 
       SET 
         name = COALESCE($1, name),
         email = COALESCE($2, email),
         blood_type = COALESCE($3, blood_type),
         allergies = COALESCE($4, allergies),
         medical_conditions = COALESCE($5, medical_conditions),
         emergency_contact_1 = COALESCE($6, emergency_contact_1),
         emergency_contact_1_phone = COALESCE($7, emergency_contact_1_phone),
         emergency_contact_2 = COALESCE($8, emergency_contact_2),
         emergency_contact_2_phone = COALESCE($9, emergency_contact_2_phone),
         updated_at = NOW() 
       WHERE id = $10`,
      [
        name, email, blood_type, allergies, medical_conditions, 
        emergency_contact_1, emergency_contact_1_phone, 
        emergency_contact_2, emergency_contact_2_phone, 
        userId
      ]
    );

    res.status(200).json({ 
      success: true, 
      message: "Profile updated successfully!" 
    });

  } catch (error) {
    console.error("Error updating profile:", error);
    res.status(500).json({ success: false, message: "Server error updating profile" });
  }
};


exports.updateAvailability = async (req, res) => {
  try {
    const userId = req.user.id; // Comes from your JWT auth middleware
    const { is_available } = req.body;

    // Safety check: Ensure the frontend actually sent a boolean
    if (typeof is_available !== 'boolean') {
      return res.status(400).json({ 
        success: false, 
        message: "is_available must be a boolean (true or false)" 
      });
    }

    const newRole = is_available ? 'volunteer' : 'citizen';

    await db.query(
      `UPDATE users SET is_available = $1, user_type = $2 
      WHERE id = $3 
      RETURNING is_available, user_type`,
      [is_available, newRole, userId]
    );    
  
    res.status(200).json({ 
      success: true, 
      message: is_available ? "You are now On-Duty and ready to receive SOS pings!" : "You are now Off-Duty." 
    });

  } catch (error) {
    console.error("Error updating availability:", error);
    res.status(500).json({ success: false, message: "Server error updating availability" });
  }
};