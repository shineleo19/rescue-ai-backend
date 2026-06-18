const express = require('express');
const router = express.Router();
const upload = require('../middleware/upload');
const uploadController = require('../controllers/uploadController');
const { verifyToken } = require('../middleware/auth');

router.post('/image', verifyToken, upload.single('image'), uploadController.uploadImage);

module.exports = router;
