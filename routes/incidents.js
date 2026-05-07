const express = require('express');
const router = express.Router();
const incidentController = require('../controllers/incidentController');
const { verifyToken } = require('../middleware/auth');

router.get('/history', verifyToken, incidentController.getIncidentHistory);

// Note: Everything here is protected by the authMiddleware
// Only logged-in users with a valid JWT can report an emergency
router.post('/', verifyToken, incidentController.createIncident);
router.get('/', verifyToken, incidentController.getIncidents);

router.put('/:id', verifyToken, incidentController.updateIncident);

module.exports = router;