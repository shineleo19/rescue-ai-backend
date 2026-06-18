const express = require('express');
const router = express.Router();
const multer = require('multer'); 
const volunteerController = require('../controllers/volunteerController');
const { verifyToken } = require('../middleware/auth');

const upload = multer({ storage: multer.memoryStorage() });


router.post('/register', verifyToken, upload.single('certificate'), volunteerController.register);

router.get('/pending', verifyToken, volunteerController.getPending);

router.put('/:id/approve', verifyToken, volunteerController.approve);
router.put('/:id/reject', verifyToken, volunteerController.reject);

router.get('/status', verifyToken, volunteerController.getStatus);


router.put('/availability', verifyToken, volunteerController.setAvailability);

module.exports = router;