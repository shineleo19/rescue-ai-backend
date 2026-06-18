const db = require('../config/database');
const cloudinary = require('../config/cloudinary');

// get user profile
exports.getUserProfile = async (req, res) => {
  try {
    const userId = req.user.id;

    const { rows } = await db.query(
      `SELECT id, name, phone,email, user_type, is_available, 
              blood_type, allergies, medical_conditions, 
              emergency_contact_1, emergency_contact_1_phone, 
              emergency_contact_2, emergency_contact_2_phone, 
              profile_image_url
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
      district, 
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
         district = COALESCE($5, district),
         emergency_contact_1 = COALESCE($6, emergency_contact_1),
         emergency_contact_1_phone = COALESCE($7, emergency_contact_1_phone),
         emergency_contact_2 = COALESCE($8, emergency_contact_2),
         emergency_contact_2_phone = COALESCE($9, emergency_contact_2_phone),
         updated_at = NOW() 
       WHERE id = $10`,
      [
        name, email, blood_type, allergies, medical_conditions,district, 
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

// save FCM token for a specific user (only the user themselves or admin can set)
exports.saveFCMToken = async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const callerId = req.user && req.user.id;

    if (!callerId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    // only allow the user themselves or admins to set another user's token
    if (callerId !== userId && req.user.user_type !== 'admin') {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const { fcm_token } = req.body;
    if (!fcm_token) return res.status(400).json({ success: false, message: 'fcm_token is required' });

    await db.query(`UPDATE users SET fcm_token = $1, updated_at = NOW() WHERE id = $2`, [fcm_token, userId]);

    res.status(200).json({ success: true, message: 'FCM token saved' });
  } catch (error) {
    console.error('Error saving FCM token (user):', error);
    res.status(500).json({ success: false, message: 'Server error saving FCM token' });
  }
};

exports.uploadProfileImage = async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Safety check: Did Multer actually catch a file?
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No image file provided." });
    }

    console.log(`📸 Processing profile picture for User ${userId}...`);

    // 1. STREAM TO CLOUDINARY WITH AI FACE CROPPING
    const uploadPromise = new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { 
          folder: 'rescueai_profiles',
          width: 400, 
          height: 400, 
          crop: 'fill',     // Force it into a perfect square
          gravity: 'face'   // 🚨 Cloudinary AI: Automatically center on their face!
        }, 
        (error, result) => {
          if (result) resolve(result.secure_url);
          else reject(error);
        }
      );
      stream.end(req.file.buffer); // Push the RAM buffer to the cloud
    });

    const imageUrl = await uploadPromise;
    console.log(`✅ Profile Image hosted at: ${imageUrl}`);

    // 2. UPDATE POSTGRESQL DATABASE
    await db.query(
      `UPDATE users SET profile_image_url = $1, updated_at = NOW() WHERE id = $2`,
      [imageUrl, userId]
    );

    res.status(200).json({ 
      success: true, 
      message: "Profile picture updated successfully!",
      imageUrl: imageUrl 
    });

  } catch (error) {
    console.error("Profile Image Upload Error:", error);
    res.status(500).json({ success: false, message: "Server error during upload" });
  }
};
