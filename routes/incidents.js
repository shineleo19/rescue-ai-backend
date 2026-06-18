const express = require('express');
const router = express.Router();
const multer = require('multer'); // Import multer here
const incidentController = require('../controllers/incidentController');
const { verifyToken } = require('../middleware/auth');

const upload = multer({ storage: multer.memoryStorage() });

router.get('/history', verifyToken, incidentController.getIncidentHistory);
router.post('/', verifyToken, incidentController.createIncident);
router.get('/', verifyToken, incidentController.getIncidents);

// get details for a single incident
router.get('/:id', verifyToken, incidentController.getIncidentById);

// volunteer accepts an incident
router.put('/:id/accept', verifyToken, incidentController.acceptIncident);

// update status (generic)
router.put('/:id/status', verifyToken, incidentController.updateStatus);

// mark resolved
router.put('/:id/resolve', verifyToken, incidentController.resolveIncident);

// generic update (keeps backward compatibility)
router.put('/:id', verifyToken, upload.single('image'), incidentController.updateIncidentDetails);

module.exports = router;