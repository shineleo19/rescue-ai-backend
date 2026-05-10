const express = require('express');
const router = express.Router();

const authController = require('../controllers/authController');
const { verifyToken } = require('../middleware/auth');

router.post('/verify-firebase', authController.verifyFirebaseToken);
router.post('/firebase-login', authController.firebaseLogin);

router.put('/fcm-token', verifyToken, authController.updateFCMToken);

router.get('/me', verifyToken, authController.getMe);

module.exports = router;