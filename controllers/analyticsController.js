const db = require('../config/database');

exports.getStats = async (_req, res) => {
  try {
    const incidents = await db.query(`
      SELECT
        COUNT(*)::int AS total_incidents,
        COUNT(*) FILTER (WHERE status = 'resolved')::int AS resolved_incidents,
        COUNT(*) FILTER (WHERE status = 'pending')::int AS pending_incidents,
        COALESCE(AVG(response_time_minutes), 0)::numeric(10,2) AS avg_response_time
      FROM incidents
    `);

    res.status(200).json({ success: true, stats: incidents.rows[0] });
  } catch (error) {
    console.error('Analytics stats error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching stats' });
  }
};

exports.getHotspots = async (_req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT ROUND(latitude::numeric, 3) AS lat_bucket,
             ROUND(longitude::numeric, 3) AS lng_bucket,
             COUNT(*)::int AS incident_count
      FROM incidents
      GROUP BY lat_bucket, lng_bucket
      ORDER BY incident_count DESC
      LIMIT 20
    `);
    res.status(200).json({ success: true, hotspots: rows });
  } catch (error) {
    console.error('Analytics hotspots error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching hotspots' });
  }
};

exports.getResponseTimes = async (_req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT id, created_at, resolved_at, response_time_minutes
      FROM incidents
      WHERE response_time_minutes IS NOT NULL
      ORDER BY created_at DESC
      LIMIT 100
    `);
    res.status(200).json({ success: true, response_times: rows });
  } catch (error) {
    console.error('Analytics response-times error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching response times' });
  }
};
