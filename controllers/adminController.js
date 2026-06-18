const db = require('../config/database');

// --- 1. DASHBOARD ANALYTICS (The Overview) ---
exports.getStats = async (req, res) => {
    try {
        const [users, activeIncidents, resolvedIncidents, bloodRequests] = await Promise.all([
            db.query(`SELECT COUNT(*) FROM users`),
            db.query(`SELECT COUNT(*) FROM incidents WHERE status IN ('pending', 'dispatched')`),
            db.query(`SELECT COUNT(*) FROM incidents WHERE status = 'resolved'`),
            db.query(`SELECT COUNT(*) FROM blood_requests WHERE status = 'active'`)
        ]);

        res.status(200).json({
            success: true,
            data: {
                total_users: parseInt(users.rows[0].count),
                active_incidents: parseInt(activeIncidents.rows[0].count),
                resolved_incidents: parseInt(resolvedIncidents.rows[0].count),
                active_blood_requests: parseInt(bloodRequests.rows[0].count)
            }
        });
    } catch (error) {
        console.error("❌ Admin Stats Error:", error);
        res.status(500).json({ success: false, message: "Failed to fetch stats" });
    }
};

// --- 2. INCIDENT MANAGEMENT (The Dispatch Hub) ---
// --- 2. INCIDENT MANAGEMENT (The Dispatch Hub) ---
exports.getAllIncidents = async (req, res) => {
    try {
        // Grab the search term and status filter from the frontend URL parameters
        const { search, status } = req.query; 

        let query = `
            SELECT 
                i.id,
                i.incident_type,
                i.severity,
                i.status,
                i.description,
                i.latitude,
                i.longitude,
                i.created_at,
                COALESCE(victim.name, 'Unknown Caller') AS reporter_name,
                COALESCE(victim.phone, 'No Contact') AS reporter_phone,
                vol.name AS assigned_volunteer_name
            FROM incidents i
            LEFT JOIN users victim ON i.user_id = victim.id
            LEFT JOIN users vol ON i.accepted_by = vol.id
            WHERE 1=1
        `;

        let queryParams = [];
        let paramCounter = 1;

        // 🟢 1. Handle the "Filter" Dropdown (e.g., show only 'pending')
        if (status) {
            query += ` AND i.status = $${paramCounter}`;
            queryParams.push(status);
            paramCounter++;
        }

        // 🟢 2. Handle the "Search by type or ID" bar
        if (search) {
            query += ` AND (
                i.incident_type ILIKE $${paramCounter} OR 
                i.description ILIKE $${paramCounter} OR 
                CAST(i.id AS TEXT) ILIKE $${paramCounter}
            )`;
            queryParams.push(`%${search}%`); // The % signs allow partial matching!
            paramCounter++;
        }

        // 🟢 3. Smart Sorting: Put 'pending' emergencies at the top, followed by newest
        query += ` 
            ORDER BY 
                CASE WHEN i.status = 'pending' THEN 1 
                     WHEN i.status = 'dispatched' THEN 2 
                     ELSE 3 END, 
                i.created_at DESC
        `;

        const { rows } = await db.query(query, queryParams);

        res.status(200).json({ 
            success: true, 
            count: rows.length,
            data: rows 
        });

    } catch (error) {
        console.error("❌ Admin Fetch Incidents Error:", error);
        res.status(500).json({ success: false, message: "Failed to fetch incidents" });
    }
};

exports.updateIncidentStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body; 

        const { rows } = await db.query(
            `UPDATE incidents SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *`,
            [status, id]
        );

        res.status(200).json({ success: true, message: `Incident marked as ${status}`, incident: rows[0] });
    } catch (error) {
        console.error("❌ Admin Update Incident Error:", error);
        res.status(500).json({ success: false, message: "Failed to update incident" });
    }
};

exports.forceAssignVolunteer = async (req, res) => {
    try {
        const { id } = req.params;
        const { volunteer_id } = req.body; 

        await db.query(
            `UPDATE incidents SET accepted_by = $1, status = 'dispatched' WHERE id = $2`,
            [volunteer_id, id]
        );

        res.status(200).json({ success: true, message: "Volunteer manually assigned." });
    } catch (error) {
        console.error("❌ Admin Assign Error:", error);
        res.status(500).json({ success: false, message: "Failed to assign volunteer" });
    }
};

// --- 3. USER & VOLUNTEER MANAGEMENT ---
exports.getAllUsers = async (req, res) => {
    try {
        const { rows } = await db.query(`SELECT id, name, phone, email, user_type, district, is_available FROM users ORDER BY created_at DESC`);
        res.status(200).json({ success: true, users: rows });
    } catch (error) {
        console.error("❌ Admin Fetch Users Error:", error);
        res.status(500).json({ success: false, message: "Failed to fetch users" });
    }
};

// --- 4. BLOOD HUB MODERATION ---
exports.getAllBloodRequests = async (req, res) => {
    try {
        const { rows } = await db.query(`SELECT * FROM blood_requests ORDER BY created_at DESC`);
        res.status(200).json({ success: true, requests: rows });
    } catch (error) {
        console.error("❌ Admin Fetch Blood Requests Error:", error);
        res.status(500).json({ success: false, message: "Failed to fetch blood requests" });
    }
};

exports.deleteBloodRequest = async (req, res) => {
    try {
        const { id } = req.params;
        await db.query(`DELETE FROM blood_requests WHERE id = $1`, [id]);
        res.status(200).json({ success: true, message: "Spam blood request deleted forever." });
    } catch (error) {
        console.error("❌ Admin Delete Blood Error:", error);
        res.status(500).json({ success: false, message: "Failed to delete request" });
    }
};

// --- 5. VOLUNTEER DASHBOARD (Dedicated Screen) ---
exports.getVolunteerDashboard = async (req, res) => {
    try {
        // 1. Fetch the Top Metric Cards simultaneously for speed
        const [totalVols, availableVols, respondingVols] = await Promise.all([
            db.query(`SELECT COUNT(*) FROM users WHERE user_type = 'volunteer'`),
            db.query(`SELECT COUNT(*) FROM users WHERE user_type = 'volunteer' AND is_available = true`),
            // 'Responding' means they are currently assigned to an active incident
            db.query(`SELECT COUNT(DISTINCT accepted_by) FROM incidents WHERE status IN ('accepted', 'dispatched')`)
        ]);

        // 2. Fetch the detailed list for the Cards and the Map
        const listQuery = `
            SELECT 
                u.id, 
                u.name, 
                u.phone, 
                u.profile_image_url, 
                u.is_available, 
                u.district AS location,
                u.latitude, 
                u.longitude,
                COALESCE(u.certification_level, 'Pending Verification') AS certification,
                (SELECT COUNT(*) FROM incidents WHERE accepted_by = u.id AND status = 'resolved') AS lives_helped,
                '5 min' AS avg_response -- Hardcoded for hackathon UI, or calculate via timestamps if time permits
            FROM users u
            WHERE u.user_type = 'volunteer'
            ORDER BY u.is_available DESC, u.created_at DESC
        `;
        const { rows: volunteerList } = await db.query(listQuery);

        res.status(200).json({
            success: true,
            data: {
                metrics: {
                    total: parseInt(totalVols.rows[0].count),
                    available: parseInt(availableVols.rows[0].count),
                    responding: parseInt(respondingVols.rows[0].count)
                },
                volunteers: volunteerList
            }
        });

    } catch (error) {
        console.error("❌ Volunteer Dashboard Error:", error);
        res.status(500).json({ success: false, message: "Failed to fetch volunteer data" });
    }
};