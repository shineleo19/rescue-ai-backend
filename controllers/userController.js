const db = require('../config/database');

// get user profile
exports.getUserProfile = async (req, res) => {
  try {
    const userId = req.user.id;

    const { rows } = await db.query(
      `SELECT id, name, phone,email, user_type, is_available, 
              blood_type, allergies, medical_conditions, 
              emergency_contact_1, emergency_contact_1_phone, 
              emergency_contact_2, emergency_contact_2_phone 
       FROM users WHERE id = $1`,
      [userId]
    );

    if (rows.length === 0) return res.status(404).json({ success: false, message: 'User not found' });

    res.status(200).json({ success: true, user: rows[0] });

  } catch (error) {
    console.error('Fetch Profile Error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching profile' });
  }
};

// update user profile in database
exports.updateProfile = async (req, res) => {
  try {
    const userId = req.user.id;

    // destructure allowed profile fields
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

    res.status(200).json({ success: true, message: 'Profile updated' });

  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ success: false, message: 'Server error updating profile' });
  }
};


// update user's availability and location
exports.updateAvailability = async (req, res) => {
  try {
    const userId = req.user.id;
    const { is_available, latitude, longitude } = req.body;

    if (typeof is_available !== 'boolean') return res.status(400).json({ success: false, message: 'is_available must be boolean' });

    const newRole = is_available ? 'volunteer' : 'citizen';

    await db.query(
      `UPDATE users SET is_available = $1, user_type = $2, latitude = $3, longitude = $4 
      WHERE id = $5 
      RETURNING is_available, user_type`,
      [is_available, newRole, latitude, longitude, userId]
    );

    res.status(200).json({ success: true, message: is_available ? 'Now On-Duty' : 'Now Off-Duty' });

  } catch (error) {
    console.error('Error updating availability:', error);
    res.status(500).json({ success: false, message: 'Server error updating availability' });
  }
};
