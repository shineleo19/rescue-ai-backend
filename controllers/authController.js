const jwt = require('jsonwebtoken');
const admin = require('../config/firebase');


// verify firebase token and return backend jwt
exports.verifyFirebaseToken = async (req, res) => {
  try {
    const { firebaseToken } = req.body;
    let phone;
    if (firebaseToken === 'TEST_MODE_123') {
      console.log('Mock login detected. Bypassing Firebase...');
      phone = '+919876543210';
    } else {
      if (!firebaseToken) {
        return res.status(400).json({ success: false, message: 'Firebase token is required' });
      }
      const decodedToken = await admin.auth().verifyIdToken(firebaseToken);
      phone = decodedToken.phone_number;
    }

    if (!phone) {
      return res.status(400).json({ success: false, message: 'Phone number not found' });
    }

    // check or create user in postgres
    let result = await db.query('SELECT * FROM users WHERE phone = $1', [phone]);
    let user = result.rows[0];

    // insert new user if missing
    if (!user) {
      const insertResult = await db.query(
        'INSERT INTO users (phone, user_type) VALUES ($1, $2) RETURNING *',
        [phone, 'citizen']
      );
      user = insertResult.rows[0];
    }

    // generate backend jwt
    const payload = { id: user.id, phone: user.phone, user_type: user.user_type };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRY });

    res.status(200).json({ success: true, token, user });
  } catch (error) {
    console.error('Auth Error:', error.message);
    res.status(401).json({ success: false, message: 'Invalid or expired Firebase token' });
  }
};

// return current authenticated user
exports.getMe = async (req, res) => {
  try {
    const result = await db.query('SELECT id, phone, name, email, user_type, blood_type, allergies FROM users WHERE id = $1', [req.user.id]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'User not found' });
    
    res.status(200).json({ success: true, user: result.rows[0] });
  } catch (error) {
    console.error('Get Me Error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const db = require('../config/database');

// update user's fcm token in db
exports.updateFCMToken = async (req, res) => {
  try {
    const { fcm_token } = req.body;
    const user_id = req.user.id; // This comes from your JWT auth middleware

    if (!fcm_token) {
      return res.status(400).json({ success: false, message: "FCM token is required" });
    }

    await db.query(
      `UPDATE users SET fcm_token = $1 WHERE id = $2`,
      [fcm_token, user_id]
    );

    res.status(200).json({ success: true, message: "FCM Token saved successfully!" });
  } catch (error) {
    console.error('Error saving FCM token:', error);
    res.status(500).json({ success: false, message: "Server error saving token" });
  }
};


// firebase login: find/create user and return token
exports.firebaseLogin = async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({ success: false, message: 'Missing phone number' });
    }

    // upsert user by phone
    const result = await db.query(
      `INSERT INTO users (phone) 
       VALUES ($1) 
       ON CONFLICT (phone) 
       DO UPDATE SET updated_at = NOW() 
       RETURNING *`,
      [phone]
    );

    const user = result.rows[0];

    // generate jwt (ensure JWT_SECRET present)
    const token = jwt.sign(
      { 
        id: user.id, // Give the token your PostgreSQL database ID
        phone: user.phone,
        user_type: user.user_type // Helpful for Flutter to know if they are a volunteer
      }, 
      process.env.JWT_SECRET || 'your_super_secret_key_here', 
      { expiresIn: '30d' }
    );

    // return token and user
    res.status(200).json({
      success: true,
      token: token, // Flutter saves this and uses it for everything else!
      message: "Handshake complete",
      is_new_user: user.name === null // Tells Flutter to send them to the Profile Setup screen!
    });

  } catch (error) {
    console.error("Firebase Handshake Error:", error);
    res.status(500).json({ success: false, message: 'Server error during handshake' });
  }
};

// return user profile by id
exports.getUserProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const { rows } = await db.query(
      `SELECT id, name, phone, user_type, is_available, 
              blood_type, allergies, medical_conditions, 
              emergency_contact_1, emergency_contact_1_phone, 
              emergency_contact_2, emergency_contact_2_phone 
       FROM users WHERE id = $1`,
      [userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    res.status(200).json({
      success: true,
      user: rows[0]
    });

  } catch (error) {
    console.error("Fetch Profile Error:", error);
    res.status(500).json({ success: false, message: 'Server error fetching profile' });
  }
};