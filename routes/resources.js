const express = require('express');
const router = express.Router();
const resourceController = require('../controllers/resourceController');
const { verifyToken } = require('../middleware/auth');

router.get('/', verifyToken, resourceController.getAllResources);
router.post('/', verifyToken, resourceController.createResource);
router.put('/:id/location', verifyToken, resourceController.updateLocation);
router.get('/nearby', verifyToken, resourceController.getNearbyResources);

module.exports = router;