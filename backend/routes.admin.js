const express = require('express');
const pool = require('./db');

const router = express.Router();

// GET /api/admin/stats - basic counts for admin dashboard
router.get('/stats', async (req, res) => {
  try {
    const [users, courses, enrollments, pendingCourses] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS count FROM users`),
      pool.query(`SELECT COUNT(*)::int AS count FROM courses WHERE status = 'approved' OR status IS NULL`),
      pool.query(`SELECT COUNT(*)::int AS count FROM enrollments`),
      pool.query(`SELECT COUNT(*)::int AS count FROM courses WHERE status = 'pending'`),
    ]);

    res.json({
      totalUsers: users.rows[0]?.count ?? 0,
      totalCourses: courses.rows[0]?.count ?? 0,
      totalEnrollments: enrollments.rows[0]?.count ?? 0,
      pendingCourses: pendingCourses.rows[0]?.count ?? 0,
    });
  } catch (err) {
    console.error('Error fetching admin stats:', err);
    res.status(500).json({ message: 'Failed to load admin stats.' });
  }
});

// GET /api/admin/analytics/overview - richer stats for analyst dashboard
router.get('/analytics/overview', async (req, res) => {
  try {
    // Overall enrollment aggregates sourced from statistics table
    const countsResult = await pool.query(
      `
      SELECT
        COALESCE(SUM(total_enrollments), 0)::int AS "totalEnrollments",
        COALESCE(SUM(active_enrollments), 0)::int AS "activeEnrollments",
        COALESCE(
          SUM(total_enrollments * completion_rate / 100.0)
          , 0
        )::int AS "completedEnrollments",
        COALESCE(
          AVG(avg_completion_time),
          0
        ) AS "avgCompletionMonths"
      FROM statistics
      `
    );
    const counts = countsResult.rows[0] || {
      totalEnrollments: 0,
      activeEnrollments: 0,
      completedEnrollments: 0,
      avgCompletionMonths: 0,
    };

    const completionRate =
      counts.totalEnrollments > 0
        ? (counts.completedEnrollments * 100.0) / counts.totalEnrollments
        : 0;

    // For now, approximate monthly trend from statistics totals (no per-month granularity in statistics table)
    const trendResult = await pool.query(
      `
      SELECT
        'All'::text AS month,
        COALESCE(SUM(total_enrollments), 0)::int AS enrollments,
        COALESCE(
          SUM(total_enrollments * completion_rate / 100.0),
          0
        )::int AS completions
      FROM statistics
      `
    );

    // Per-course stats derived from statistics table
    const courseStatsResult = await pool.query(
      `
      SELECT
        c.id,
        c.name,
        c.university,
        COALESCE(s.total_enrollments, 0)::int AS "totalEnrollments",
        COALESCE(s.active_enrollments, 0)::int AS "activeStudents",
        COALESCE(
          (s.total_enrollments * s.completion_rate / 100.0),
          0
        )::int AS "completedStudents",
        COALESCE(s.completion_rate, 0)::numeric(5,2) AS "completionRate",
        COALESCE(s.avg_completion_time, 0)::numeric(6,2) AS "avgTimeMonths",
        COALESCE(c.rating, 0) AS rating
      FROM courses c
      LEFT JOIN statistics s ON s.course_id = c.id
      GROUP BY c.id, s.total_enrollments, s.active_enrollments, s.completion_rate, s.avg_completion_time
      ORDER BY c.id
      `
    );

    res.json({
      totalEnrollments: counts.totalEnrollments,
      activeEnrollments: counts.activeEnrollments,
      completionRate,
      avgCompletionTime: Number(counts.avgCompletionMonths) || 0,
      enrollmentTrend: trendResult.rows,
      courseStats: courseStatsResult.rows,
    });
  } catch (err) {
    console.error('Error fetching analytics overview:', err);
    res.status(500).json({ message: 'Failed to load analytics overview.' });
  }
});

// GET /api/admin/courses/pending
router.get('/courses/pending', async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT
        id,
        name AS title,
        description,
        instructor,
        instructor_userid AS "instructorUserid",
        created_at
      FROM courses
      WHERE status = 'pending'
      ORDER BY created_at DESC, id DESC
      `
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching pending courses:', err);
    res.status(500).json({ message: 'Failed to load pending courses.' });
  }
});

// PATCH /api/admin/courses/:id/approve
router.patch('/courses/:id/approve', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `
      UPDATE courses
      SET status = 'approved'
      WHERE id = $1
      RETURNING id, name AS title, status
      `,
      [id]
    );
    if (result.rowCount === 0) return res.status(404).json({ message: 'Course not found.' });
    res.json({ message: 'Course approved.', course: result.rows[0] });
  } catch (err) {
    console.error('Error approving course:', err);
    res.status(500).json({ message: 'Failed to approve course.' });
  }
});

// GET /api/admin/db/tables - list tables
router.get('/db/tables', async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
      `
    );
    res.json(result.rows.map(r => r.table_name));
  } catch (err) {
    console.error('Error listing tables:', err);
    res.status(500).json({ message: 'Failed to list tables.' });
  }
});

// GET /api/admin/db/:table?limit=50 - view rows from a table (safe allowlist)
router.get('/db/:table', async (req, res) => {
  try {
    const { table } = req.params;
    const limit = Math.max(1, Math.min(Number(req.query.limit) || 50, 200));

    // Basic allowlist to avoid arbitrary SQL
    const allowed = new Set([
      'users',
      'courses',
      'course_topics',
      'course_contents',
      'enrollments',
    ]);
    if (!allowed.has(table)) {
      return res.status(400).json({ message: 'Table not allowed.' });
    }

    const result = await pool.query(`SELECT * FROM ${table} ORDER BY 1 DESC LIMIT $1`, [limit]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching table rows:', err);
    res.status(500).json({ message: 'Failed to fetch table rows.' });
  }
});

// GET /api/admin/users - list all users for management
router.get('/users', async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT
        id,
        userid,
        name,
        email,
        role,
        created_at
      FROM users
      ORDER BY id
      `
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching users:', err);
    res.status(500).json({ message: 'Failed to fetch users.' });
  }
});

// DELETE /api/admin/users/:id - delete a user by id
router.delete('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `DELETE FROM users WHERE id = $1 RETURNING id, userid, name, role`,
      [id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'User not found.' });
    }
    res.json({ message: 'User deleted.', user: result.rows[0] });
  } catch (err) {
    console.error('Error deleting user:', err);
    res.status(500).json({ message: 'Failed to delete user.' });
  }
});

module.exports = router;

