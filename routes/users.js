const express = require('express');
const router = express.Router();
const multer = require('multer'); // 👈 Import multer
const userController = require('../controllers/userController');
const { verifyToken } = require('../middleware/auth');

const upload = multer({ storage: multer.memoryStorage() }); 

router.get('/profile', verifyToken, userController.getUserProfile);
router.put('/availability', verifyToken, userController.updateAvailability);

router.put('/profile', verifyToken, userController.updateProfile);
router.put('/availability', verifyToken, userController.updateAvailability);
router.put('/profile/image', verifyToken, upload.single('image'), userController.uploadProfileImage);

// save FCM token for a user (frontend will POST token to /api/users/:id/fcm-token)
router.post('/:id/fcm-token', verifyToken, userController.saveFCMToken);

module.exports = router;