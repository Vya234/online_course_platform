const express = require('express');
const pool = require('./db');

const router = express.Router();

// GET /api/students/:userid/enrollments - list a student's enrolled courses with progress/status
router.get('/:userid/enrollments', async (req, res) => {
  try {
    const { userid } = req.params;

    const result = await pool.query(
      `
      SELECT
        e.userid,
        e.course_id,
        e.progress,
        e.status,
        e.created_at
      FROM enrollments e
      WHERE e.userid = $1
      ORDER BY e.created_at DESC
      `,
      [userid]
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching student enrollments:', err);
    res.status(500).json({ message: 'Failed to fetch enrollments.' });
  }
});

module.exports = router;





