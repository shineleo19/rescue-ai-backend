const express = require('express');
const router = express.Router();

const authController = require('../controllers/authController');
const { verifyToken } = require('../middleware/auth');

// We only need one public route now for Firebase!
router.post('/verify-firebase', authController.verifyFirebaseToken);

router.put('/fcm-token', verifyToken, authController.updateFCMToken);

// Protected Route (Requires valid JWT token)
router.get('/me', verifyToken, authController.getMe);

module.exports = router;