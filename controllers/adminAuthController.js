const db = require('../config/database');
const jwt = require('jsonwebtoken');

exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;

        // 1. Safety Check
        if (!email || !password) {
            return res.status(400).json({ success: false, message: "Email and password are required." });
        }

        // 2. 🚨 The Hackathon Shortcut: Hardcoded Password
        if (password !== 'admin123') {
            return res.status(401).json({ success: false, message: "Invalid credentials." });
        }

        // 3. Verify they exist in the DB and are actually an Admin
        const { rows } = await db.query(
            `SELECT id, email, user_type FROM users WHERE email = $1 AND user_type = 'admin'`,
            [email]
        );

        if (rows.length === 0) {
            return res.status(401).json({ success: false, message: "Unauthorized. Admin account not found." });
        }

        const adminUser = rows[0];

        // 4. Sign the JWT Token
        // Ensure you have JWT_SECRET in your .env file!
        const token = jwt.sign(
            { 
                id: adminUser.id, 
                email: adminUser.email, 
                user_type: adminUser.user_type 
            }, 
            process.env.JWT_SECRET, 
            { expiresIn: '24h' }
        );

        console.log(`✅ Admin ${email} logged in successfully.`);

        res.status(200).json({
            success: true,
            message: "Login successful",
            token: token
        });

    } catch (error) {
        console.error("❌ Admin Login Error:", error);
        res.status(500).json({ success: false, message: "Server error during login" });
    }
};