const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const adminAuthController = require('../controllers/adminAuthController'); // 👈 Import new controller
const { verifyToken } = require('../middleware/auth'); // Check your exact middleware path!

router.post('/login', adminAuthController.login);

// --- THE SECURITY LOCK ---
const isAdmin = (req, res, next) => {
    // verifyToken will decode the JWT and attach it to req.user
    if (req.user && req.user.user_type === 'admin') {
        next(); 
    } else {
        res.status(403).json({ success: false, message: "Access Denied: Admins Only." });
    }
};

// Apply BOTH security layers to all routes below
router.use(verifyToken, isAdmin);

// 1. Dashboard Stats
router.get('/stats', adminController.getStats);

// 2. Incident Management
router.get('/incidents', adminController.getAllIncidents);
router.put('/incidents/:id/status', adminController.updateIncidentStatus);
router.put('/incidents/:id/assign', adminController.forceAssignVolunteer);

// 3. User Management
router.get('/users', adminController.getAllUsers);
router.get('/volunteers/dashboard', adminController.getVolunteerDashboard);

// 4. Blood Hub Moderation
router.get('/blood-requests', adminController.getAllBloodRequests);
router.delete('/blood-requests/:id', adminController.deleteBloodRequest);

module.exports = router;