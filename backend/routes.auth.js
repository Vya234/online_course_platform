const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('./db');

const router = express.Router();

// Helper to run a SELECT that returns a single row using PostgreSQL
async function getUserByUserid(userid) {
  const result = await pool.query('SELECT * FROM users WHERE userid = $1', [userid]);
  return result.rows[0] || null;
}

async function getUserByEmail(email) {
  const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
  return result.rows[0] || null;
}

async function createUser({ userid, name, email, passwordHash, role }) {
  const createdAt = new Date().toISOString();
  const sql = `
    INSERT INTO users (userid, name, email, password_hash, role, created_at)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING id, userid, name, email, role, created_at
  `;
  const params = [userid, name, email, passwordHash, role, createdAt];

  const result = await pool.query(sql, params);
  return result.rows[0];
}

// POST /api/auth/signup
router.post('/signup', async (req, res) => {
  try {
    const { userid, name, email, password, role } = req.body || {};

    if (!userid || !name || !email || !password || !role) {
      return res
        .status(400)
        .json({ message: 'userid, name, email, password and role are required.' });
    }

    const normalizedRole = role;
    const allowedRoles = ['student', 'instructor', 'administrator', 'data_analyst'];
    if (!allowedRoles.includes(normalizedRole)) {
      return res.status(400).json({ message: 'Invalid role.' });
    }

    const existingByUserid = await getUserByUserid(userid);
    if (existingByUserid) {
      return res.status(409).json({ message: 'User ID already taken.' });
    }

    const existingByEmail = await getUserByEmail(email);
    if (existingByEmail) {
      return res.status(409).json({ message: 'Email already in use.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const newUser = await createUser({
      userid,
      name,
      email,
      passwordHash,
      role: normalizedRole,
    });

    return res.status(201).json({
      message: 'Signup successful.',
      user: {
        id: newUser.id,
        userid: newUser.userid,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        created_at: newUser.created_at,
      },
    });
  } catch (err) {
    console.error('Error in /api/auth/signup:', err);
    return res.status(500).json({ message: 'Internal server error.' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { userid, password, role } = req.body || {};

    if (!userid || !password || !role) {
      return res
        .status(400)
        .json({ message: 'userid, password and role are required.' });
    }

    const user = await getUserByUserid(userid);
    if (!user) {
      return res
        .status(404)
        .json({ message: 'Account not found. Please sign up first.' });
    }

    const passwordMatches = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatches) {
      return res.status(401).json({ message: 'Incorrect password. Please try again.' });
    }

    if (user.role !== role) {
      return res
        .status(401)
        .json({ message: `Role mismatch. Please select the correct role: ${user.role}` });
    }

    return res.json({
      message: 'Login successful.',
      user: {
        id: user.id,
        userid: user.userid,
        name: user.name,
        email: user.email,
        role: user.role,
        created_at: user.created_at,
      },
    });
  } catch (err) {
    console.error('Error in /api/auth/login:', err);
    return res.status(500).json({ message: 'Internal server error.' });
  }
});

module.exports = router;


