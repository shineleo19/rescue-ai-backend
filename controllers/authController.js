const jwt = require('jsonwebtoken');
const admin = require('../config/firebase');


exports.verifyFirebaseToken = async (req, res) => {
  try {
    const { firebaseToken } = req.body;
    let phone;

    // Check for the mock bypass first
    if (firebaseToken === 'TEST_MODE_123') {
      console.log('Mock login detected. Bypassing Firebase...');
      phone = '+919876543210';
    } else {
      if (!firebaseToken) {
        return res.status(400).json({ success: false, message: 'Firebase token is required' });
      }

      // Verify the token with Firebase Admin SDK
      const decodedToken = await admin.auth().verifyIdToken(firebaseToken);
      phone = decodedToken.phone_number;
    }

    if (!phone) {
      return res.status(400).json({ success: false, message: 'Phone number not found' });
    }

    // Check if user exists in our PostgreSQL database
    let result = await db.query('SELECT * FROM users WHERE phone = $1', [phone]);
    let user = result.rows[0];

    // If new user, insert them into PostgreSQL
    if (!user) {
      const insertResult = await db.query(
        'INSERT INTO users (phone, user_type) VALUES ($1, $2) RETURNING *',
        [phone, 'citizen']
      );
      user = insertResult.rows[0];
    }

    // Generate our backend's JWT Token
    const payload = { id: user.id, phone: user.phone, user_type: user.user_type };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRY });

    res.status(200).json({ success: true, token, user });
  } catch (error) {
    console.error('Auth Error:', error.message);
    res.status(401).json({ success: false, message: 'Invalid or expired Firebase token' });
  }
};

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

exports.updateFCMToken = async (req, res) => {
  try {
    const { fcm_token } = req.body;
    const user_id = req.user.id; // This comes from your JWT auth middleware

    if (!fcm_token) {
      return res.status(400).json({ success: false, message: "FCM token is required" });
    }

    // Update the user's row with their new phone token
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


exports.firebaseLogin = async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({ success: false, message: 'Missing phone number' });
    }

    // 1. FIND OR CREATE THE USER IN POSTGRESQL (The UPSERT Magic)
    // If the phone exists, it just updates the timestamp and returns the user.
    // If the phone is new, it creates a blank row and returns the user.
    const result = await db.query(
      `INSERT INTO users (phone) 
       VALUES ($1) 
       ON CONFLICT (phone) 
       DO UPDATE SET updated_at = NOW() 
       RETURNING *`,
      [phone]
    );

    const user = result.rows[0];

    // 2. GENERATE THE MASSIVE SECURE NODE.JS JWT
    // Make sure you have a JWT_SECRET in your backend .env file!
    const token = jwt.sign(
      { 
        id: user.id, // Give the token your PostgreSQL database ID
        phone: user.phone,
        user_type: user.user_type // Helpful for Flutter to know if they are a volunteer
      }, 
      process.env.JWT_SECRET || 'your_super_secret_key_here', 
      { expiresIn: '30d' }
    );

    // 3. SEND IT BACK TO FLUTTER!
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

exports.getUserProfile = async (req, res) => {
  try {
    // 1. Get the user ID from the token (from your verifyToken middleware)
    const userId = req.user.id; 

    // 2. Find the user in PostgreSQL
    const { rows } = await db.query(
      `SELECT id, name, phone, user_type, is_available, 
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