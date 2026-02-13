const express = require('express');
const pool = require('./db');

const router = express.Router();

// GET /api/instructors/:userid/dashboard
// Returns dashboard stats + instructor's courses (pending + approved)
router.get('/:userid/dashboard', async (req, res) => {
  try {
    const { userid } = req.params;

    const statsResult = await pool.query(
      `
      SELECT
        COUNT(c.id)::int AS "totalCourses",
        COALESCE(SUM(e.cnt), 0)::int AS "totalStudents",
        0::int AS "totalEarnings"
      FROM courses c
      LEFT JOIN (
        SELECT course_id, COUNT(*)::int AS cnt
        FROM enrollments
        GROUP BY course_id
      ) e ON e.course_id = c.id
      WHERE c.instructor_userid = $1
      `,
      [userid]
    );

    const coursesResult = await pool.query(
      `
      SELECT
        id,
        name AS title,
        description,
        status,
        university,
        category,
        fee AS price,
        duration,
        created_at
      FROM courses
      WHERE instructor_userid = $1
      ORDER BY created_at DESC, id DESC
      `,
      [userid]
    );

    res.json({
      stats: statsResult.rows[0] || { totalCourses: 0, totalStudents: 0, totalEarnings: 0 },
      courses: coursesResult.rows || [],
    });
  } catch (err) {
    console.error('Error fetching instructor dashboard:', err);
    res.status(500).json({ message: 'Failed to load instructor dashboard.' });
  }
});

// POST /api/instructors/:userid/courses
// Creates a new pending course for admin approval
router.post('/:userid/courses', async (req, res) => {
  try {
    const { userid } = req.params;
    const { title, description, price, level, university } = req.body || {};

    if (!title || !String(title).trim()) {
      return res.status(400).json({ message: 'Course title is required.' });
    }
    const numericPrice = Number(price);
    if (!Number.isFinite(numericPrice) || numericPrice <= 0) {
      return res.status(400).json({ message: 'Valid positive course price is required.' });
    }
    const normalizedLevel = level ? String(level).trim() : null;
    const normalizedUniversity = university ? String(university).trim() : null;

    const userResult = await pool.query(
      `SELECT userid, name, role FROM users WHERE userid = $1`,
      [userid]
    );
    const user = userResult.rows[0];
    if (!user) return res.status(404).json({ message: 'Instructor not found.' });
    if (user.role !== 'instructor') {
      return res.status(403).json({ message: 'Only instructors can create courses.' });
    }

    const createdAt = new Date().toISOString();
    const insertResult = await pool.query(
      `
      INSERT INTO courses (
        name,
        description,
        instructor,
        instructor_userid,
        category,
        university,
        fee,
        duration,
        created_at,
        original_price,
        rating,
        students,
        icon,
        bestseller,
        featured,
        trending,
        is_new,
        level,
        status
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        NULL,
        $7,
        $6,
        NULL,
        $5,
        $6,
        0,
        0,
        '📘',
        FALSE,
        FALSE,
        FALSE,
        TRUE,
        $8,
        'pending'
      )
      RETURNING id, name AS title, description, status, created_at
      `,
      [
        String(title).trim(),
        description ? String(description).trim() : null,
        user.name,
        user.userid,
        createdAt,
        numericPrice,
        normalizedUniversity,
        normalizedLevel
      ]
    );

    res.status(201).json({
      message: 'Course submitted for approval.',
      course: insertResult.rows[0],
    });
  } catch (err) {
    console.error('Error creating instructor course:', err);
    res.status(500).json({ message: 'Failed to create course.' });
  }
});

// POST /api/instructors/:userid/courses/:courseId/contents
// Adds content and recalculates course duration based on number of items
router.post('/:userid/courses/:courseId/contents', async (req, res) => {
  try {
    const { userid, courseId } = req.params;
    const { title, type, description, link } = req.body || {};

    if (!title || !String(title).trim()) {
      return res.status(400).json({ message: 'Content title is required.' });
    }

    const courseResult = await pool.query(
      `SELECT id, instructor_userid FROM courses WHERE id = $1`,
      [courseId]
    );
    const course = courseResult.rows[0];
    if (!course) {
      return res.status(404).json({ message: 'Course not found.' });
    }
    if (course.instructor_userid !== userid) {
      return res.status(403).json({ message: 'You do not own this course.' });
    }

    const rawType = type ? String(type).trim().toLowerCase() : '';
    const typeVal = rawType === 'video' ? 'video' : 'note';
    const descVal = description ? String(description).trim() : null;
    const urlVal = link ? String(link).trim() : null;

    const orderRes = await pool.query(
      `SELECT COALESCE(MAX(order_index), 0) + 1 AS next FROM course_contents WHERE course_id = $1`,
      [courseId]
    );
    const nextOrder = orderRes.rows[0]?.next || 1;

    const insertRes = await pool.query(
      `
      INSERT INTO course_contents (course_id, title, content_type, url, note_text, order_index)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, course_id, title, content_type, url, note_text, order_index
      `,
      [courseId, String(title).trim(), typeVal, urlVal, descVal, nextOrder]
    );

    const countRes = await pool.query(
      `SELECT COUNT(*)::int AS cnt FROM course_contents WHERE course_id = $1`,
      [courseId]
    );
    const totalItems = countRes.rows[0]?.cnt || 0;
    const durationLabel = `${totalItems} item${totalItems === 1 ? '' : 's'}`;
    await pool.query(
      `UPDATE courses SET duration = $2 WHERE id = $1`,
      [courseId, durationLabel]
    );

    res.status(201).json({
      message: 'Content added and duration updated.',
      content: insertRes.rows[0],
      duration: durationLabel,
    });
  } catch (err) {
    console.error('Error adding course content:', err);
    res.status(500).json({ message: 'Failed to add content.' });
  }
});

// DELETE /api/instructors/:userid/courses/:courseId
// Deletes a course owned by the instructor and unenrolls all students
router.delete('/:userid/courses/:courseId', async (req, res) => {
  const { userid, courseId } = req.params;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const courseRes = await client.query(
      `SELECT id, instructor_userid FROM courses WHERE id = $1`,
      [courseId]
    );
    const course = courseRes.rows[0];
    if (!course) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Course not found.' });
    }
    if (course.instructor_userid !== userid) {
      await client.query('ROLLBACK');
      return res.status(403).json({ message: 'You do not own this course.' });
    }

    // Unenroll all students from this course
    await client.query(`DELETE FROM enrollments WHERE course_id = $1`, [courseId]);

    // Delete the course (topics/contents are removed via ON DELETE CASCADE)
    await client.query(`DELETE FROM courses WHERE id = $1`, [courseId]);

    await client.query('COMMIT');
    res.json({ message: 'Course deleted successfully.' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error deleting instructor course:', err);
    res.status(500).json({ message: 'Failed to delete course.' });
  } finally {
    client.release();
  }
});

module.exports = router;

