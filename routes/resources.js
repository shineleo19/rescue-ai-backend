const express = require('express');
const router = express.Router();
const resourceController = require('../controllers/resourceController');
const { verifyToken } = require('../middleware/auth');

router.get('/', verifyToken, resourceController.getAllResources);
router.put('/:id/location', verifyToken, resourceController.updateLocation);

module.exports = router;