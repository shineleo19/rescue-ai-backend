const express = require('express');
const router = express.Router();
const resourceController = require('../controllers/resourceController');
const { verifyToken } = require('../middleware/auth');

// Ambulance app hits this every 10 seconds while driving
router.put('/:id/location', verifyToken, resourceController.updateLocation);

module.exports = router;