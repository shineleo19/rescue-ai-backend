const express = require('express');
const router = express.Router();
const webhookController = require('../controllers/webhookController');

// POST /webhook/sms-gateway
// Notice there is NO verifyToken middleware here, because MacroDroid doesn't have a JWT!
router.post('/sms-gateway', webhookController.handleSmsSos);

module.exports = router;