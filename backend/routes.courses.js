const express = require('express');
const pool = require('./db');

const router = express.Router();

// GET /api/courses - list all courses for catalogs/dashboards
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT
        id,
        name AS title,
        description,
        university,
        instructor,
        category,
        level,
        fee AS price,
        original_price AS "originalPrice",
        rating,
        students,
        icon,
        bestseller,
        featured,
        trending,
        is_new AS "isNew"
      FROM courses
      WHERE status = 'approved' OR status IS NULL
      ORDER BY id
      `
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching courses:', err);
    res.status(500).json({ message: 'Failed to fetch courses.' });
  }
});

// GET /api/courses/:id - single course basic info
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `
      SELECT
        id,
        name AS title,
        university,
        instructor,
        category,
        fee AS price,
        original_price AS "originalPrice",
        rating,
        students,
        icon,
        bestseller,
        featured,
        trending,
        is_new AS "isNew",
        duration
      FROM courses
      WHERE id = $1
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Course not found.' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching course by id:', err);
    res.status(500).json({ message: 'Failed to fetch course.' });
  }
});

// GET /api/courses/:id/contents - list course contents (videos + notes)
router.get('/:id/contents', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `
      SELECT
        id,
        title,
        content_type AS "contentType",
        url,
        note_text AS "noteText",
        order_index AS "orderIndex"
      FROM course_contents
      WHERE course_id = $1
      ORDER BY order_index
      `,
      [id]
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching course contents:', err);
    res.status(500).json({ message: 'Failed to fetch course contents.' });
  }
});

// GET /api/courses/:id/topics - list "What you'll learn" topics
router.get('/:id/topics', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `
      SELECT
        id,
        title,
        description,
        order_index AS "orderIndex"
      FROM course_topics
      WHERE course_id = $1
      ORDER BY order_index
      `,
      [id]
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching course topics:', err);
    res.status(500).json({ message: 'Failed to fetch course topics.' });
  }
});

// POST /api/courses/:id/enroll - enroll a user in a course
router.post('/:id/enroll', async (req, res) => {
  try {
    const { id } = req.params;
    const { userid } = req.body || {};

    if (!userid) {
      return res.status(400).json({ message: 'userid is required.' });
    }

    const createdAt = new Date().toISOString();

    const result = await pool.query(
      `
      INSERT INTO enrollments (userid, course_id, progress, status, created_at)
      VALUES ($1, $2, 0, 'active', $3)
      ON CONFLICT (userid, course_id)
      DO UPDATE SET status = EXCLUDED.status
      RETURNING userid, course_id, progress, status, created_at
      `,
      [userid, id, createdAt]
    );

    // Recompute statistics for this course
    await pool.query(
      `
      INSERT INTO statistics (course_id, total_enrollments, active_enrollments, completion_rate, avg_completion_time)
      SELECT
        $1,
        COUNT(*)::int AS total_enrollments,
        COUNT(*) FILTER (WHERE status = 'active')::int AS active_enrollments,
        CASE
          WHEN COUNT(*) = 0 THEN 0
          ELSE ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'completed') / COUNT(*), 2)
        END AS completion_rate,
        COALESCE(
          ROUND(
            AVG(EXTRACT(EPOCH FROM (NOW() - created_at)) / 2592000.0)
              FILTER (WHERE status = 'completed'),
            2
          ),
          0
        ) AS avg_completion_time
      FROM enrollments
      WHERE course_id = $1
      ON CONFLICT (course_id)
      DO UPDATE SET
        total_enrollments = EXCLUDED.total_enrollments,
        active_enrollments = EXCLUDED.active_enrollments,
        completion_rate = EXCLUDED.completion_rate,
        avg_completion_time = EXCLUDED.avg_completion_time
      `,
      [id]
    );

    res.status(201).json({
      message: 'Enrolled successfully.',
      enrollment: result.rows[0],
    });
  } catch (err) {
    console.error('Error enrolling in course:', err);
    res.status(500).json({ message: 'Failed to enroll in course.' });
  }
});

// GET /api/courses/:id/enrollment?userid=... - enrollment status for a user
router.get('/:id/enrollment', async (req, res) => {
  try {
    const { id } = req.params;
    const { userid } = req.query;

    if (!userid) {
      return res.status(400).json({ message: 'userid is required.' });
    }

    const result = await pool.query(
      `
      SELECT userid, course_id, progress, status, created_at
      FROM enrollments
      WHERE userid = $1 AND course_id = $2
      `,
      [userid, id]
    );

    if (result.rows.length === 0) {
      return res.json(null);
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching enrollment:', err);
    res.status(500).json({ message: 'Failed to fetch enrollment.' });
  }
});

// PATCH /api/courses/:id/enrollment - update enrollment progress/status
router.patch('/:id/enrollment', async (req, res) => {
  try {
    const { id } = req.params;
    const { userid, progress, status } = req.body || {};

    if (!userid) {
      return res.status(400).json({ message: 'userid is required.' });
    }

    const normalizedProgress =
      typeof progress === 'number' && progress >= 0 && progress <= 100
        ? Math.round(progress)
        : 0;
    const normalizedStatus =
      status || (normalizedProgress >= 100 ? 'completed' : 'active');

    const result = await pool.query(
      `
      INSERT INTO enrollments (userid, course_id, progress, status, created_at)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (userid, course_id)
      DO UPDATE SET progress = EXCLUDED.progress, status = EXCLUDED.status
      RETURNING userid, course_id, progress, status, created_at
      `,
      [userid, id, normalizedProgress, normalizedStatus]
    );

    // Recompute statistics for this course
    await pool.query(
      `
      INSERT INTO statistics (course_id, total_enrollments, active_enrollments, completion_rate, avg_completion_time)
      SELECT
        $1,
        COUNT(*)::int AS total_enrollments,
        COUNT(*) FILTER (WHERE status = 'active')::int AS active_enrollments,
        CASE
          WHEN COUNT(*) = 0 THEN 0
          ELSE ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'completed') / COUNT(*), 2)
        END AS completion_rate,
        COALESCE(
          ROUND(
            AVG(EXTRACT(EPOCH FROM (NOW() - created_at)) / 2592000.0)
              FILTER (WHERE status = 'completed'),
            2
          ),
          0
        ) AS avg_completion_time
      FROM enrollments
      WHERE course_id = $1
      ON CONFLICT (course_id)
      DO UPDATE SET
        total_enrollments = EXCLUDED.total_enrollments,
        active_enrollments = EXCLUDED.active_enrollments,
        completion_rate = EXCLUDED.completion_rate,
        avg_completion_time = EXCLUDED.avg_completion_time
      `,
      [id]
    );

    res.json({
      message: 'Enrollment updated.',
      enrollment: result.rows[0],
    });
  } catch (err) {
    console.error('Error updating enrollment:', err);
    res.status(500).json({ message: 'Failed to update enrollment.' });
  }
});

module.exports = router;


