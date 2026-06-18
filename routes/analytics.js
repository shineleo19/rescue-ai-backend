const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');
const { verifyToken } = require('../middleware/auth');

router.get('/stats', verifyToken, analyticsController.getStats);
router.get('/hotspots', verifyToken, analyticsController.getHotspots);
router.get('/response-times', verifyToken, analyticsController.getResponseTimes);

module.exports = router;
