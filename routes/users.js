const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController'); // <-- This fixes the ReferenceError!
const { verifyToken } = require('../middleware/auth');

router.get('/profile', verifyToken, userController.getUserProfile);

// This handles the PUT /api/users/profile request
router.put('/profile', verifyToken, userController.updateProfile);
// PUT /api/users/availability
router.put('/availability', verifyToken, userController.updateAvailability);

module.exports = router;