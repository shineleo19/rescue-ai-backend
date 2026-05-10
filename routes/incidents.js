const express = require('express');
const router = express.Router();
const incidentController = require('../controllers/incidentController');
const { verifyToken } = require('../middleware/auth');

router.get('/history', verifyToken, incidentController.getIncidentHistory);
router.post('/', verifyToken, incidentController.createIncident);
router.get('/', verifyToken, incidentController.getIncidents);

router.put('/:id', verifyToken, incidentController.updateIncident);

module.exports = router;