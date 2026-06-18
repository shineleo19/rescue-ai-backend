const express = require('express');
const router = express.Router();
const bloodController = require('../controllers/bloodController');
const { verifyToken } = require('../middleware/auth'); // Check your exact middleware path

// POST /api/blood/request
router.post('/request', verifyToken, bloodController.createRequest);

// GET /api/blood/active?district=Nagercoil
router.get('/active', verifyToken, bloodController.getActiveRequests);

// PUT /api/blood/solve/:id
router.put('/solve/:id', verifyToken, bloodController.markSolved);

module.exports = router;