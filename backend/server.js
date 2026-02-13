const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

// Initialize DB (this will create tables on first run)
require('./db');

const authRoutes = require('./routes.auth');
const coursesRoutes = require('./routes.courses');
const studentRoutes = require('./routes.students');
const instructorRoutes = require('./routes.instructors');
const adminRoutes = require('./routes.admin');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(
  cors({
    origin: '*', // allow all origins for now (frontend is static HTML files)
  })
);
app.use(express.json());

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/courses', coursesRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/instructors', instructorRoutes);
app.use('/api/admin', adminRoutes);

// Optional: serve frontend static files if you later host them via this server
const frontendPath = path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendPath));

app.listen(PORT, () => {
  console.log("fml")
  console.log(`Auth server running on http://localhost:${PORT}`);
  console.log("why??")
});


