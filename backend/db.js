const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv').config();

// Configure PostgreSQL connection using environment variables with sensible defaults
// You can override these by setting PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE
const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: Number(process.env.PGPORT) || 5432,
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || 'postgres',
  database: process.env.PGDATABASE || 'online_course_db',
});

async function initDb() {
  try {
    console.log("Helllo")
    // Core courses table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS courses (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        instructor VARCHAR(255),
        instructor_userid VARCHAR(255),
        category VARCHAR(255),
        university VARCHAR(255),
        fee NUMERIC(10,2),
        duration VARCHAR(100),
        created_at TIMESTAMPTZ NOT NULL,
        description TEXT,
        status VARCHAR(20) NOT NULL DEFAULT 'approved',
        original_price NUMERIC(10,2),
        rating NUMERIC(3,1) DEFAULT 0,
        level VARCHAR(50),
        students INTEGER,
        icon VARCHAR(10),
        bestseller BOOLEAN DEFAULT FALSE,
        featured BOOLEAN DEFAULT FALSE,
        trending BOOLEAN DEFAULT FALSE,
        is_new BOOLEAN DEFAULT FALSE
      )
    `);
    console.log('Courses table is ready in PostgreSQL');

    // Backfill/migrate existing databases safely (older installs)
    await pool.query(`ALTER TABLE courses ADD COLUMN IF NOT EXISTS instructor_userid VARCHAR(255)`);
    await pool.query(`ALTER TABLE courses ADD COLUMN IF NOT EXISTS description TEXT`);
    await pool.query(`ALTER TABLE courses ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'approved'`);
    await pool.query(`ALTER TABLE courses ADD COLUMN IF NOT EXISTS level VARCHAR(50)`);
    await pool.query(`ALTER TABLE courses ALTER COLUMN rating SET DEFAULT 0`);

    // Course topics table (per-course "What you'll learn" points)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS course_topics (
        id SERIAL PRIMARY KEY,
        course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        order_index INTEGER NOT NULL DEFAULT 0
      )
    `);
    console.log('Course topics table is ready in PostgreSQL');

    // Course contents table (videos + notes shown under course contents)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS course_contents (
        id SERIAL PRIMARY KEY,
        course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        content_type VARCHAR(20) NOT NULL, -- 'video' or 'note'
        url TEXT,
        note_text TEXT,
        order_index INTEGER NOT NULL DEFAULT 0
      )
    `);
    console.log('Course contents table is ready in PostgreSQL');
    
    
    // Users table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        userid VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    console.log('Users table is ready in PostgreSQL');
    
    // Seed admin and data analyst users
    const existingAdmin = await pool.query(
      'SELECT 1 FROM users WHERE userid = $1',
      ['admin1']
    );

    if (existingAdmin.rowCount === 0) {
      console.log('Seeding admin and data analyst users...');
      
      const adminPasswordHash = await bcrypt.hash('123', 10);
      const analystPasswordHash = await bcrypt.hash('456', 10);
      const now = new Date().toISOString();

      // Seed 5 admin users
      const adminUsers = [
        { userid: 'admin1', name: 'Admin One', email: 'admin1@learnx.com' },
        { userid: 'admin2', name: 'Admin Two', email: 'admin2@learnx.com' },
        { userid: 'admin3', name: 'Admin Three', email: 'admin3@learnx.com' },
        { userid: 'admin4', name: 'Admin Four', email: 'admin4@learnx.com' },
        { userid: 'admin5', name: 'Admin Five', email: 'admin5@learnx.com' }
      ];

      // Seed 5 data analyst users
      const analystUsers = [
        { userid: 'analyst1', name: 'Data Analyst One', email: 'analyst1@learnx.com' },
        { userid: 'analyst2', name: 'Data Analyst Two', email: 'analyst2@learnx.com' },
        { userid: 'analyst3', name: 'Data Analyst Three', email: 'analyst3@learnx.com' },
        { userid: 'analyst4', name: 'Data Analyst Four', email: 'analyst4@learnx.com' },
        { userid: 'analyst5', name: 'Data Analyst Five', email: 'analyst5@learnx.com' }
      ];

      const insertUserText = `
        INSERT INTO users (userid, name, email, password_hash, role, created_at)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (userid) DO NOTHING
      `;

      // Insert admin users
      for (const admin of adminUsers) {
        await pool.query(insertUserText, [
          admin.userid,
          admin.name,
          admin.email,
          adminPasswordHash,
          'administrator',
          now
        ]);
      }

      // Insert data analyst users
      for (const analyst of analystUsers) {
        await pool.query(insertUserText, [
          analyst.userid,
          analyst.name,
          analyst.email,
          analystPasswordHash,
          'data_analyst',
          now
        ]);
      }

      console.log('Seeded 5 admin users (password: 123) and 5 data analyst users (password: 456)');
    }


    // Enrollments table (student-course relationships)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS enrollments (
        id SERIAL PRIMARY KEY,
        userid VARCHAR(255) NOT NULL REFERENCES users(userid) ON DELETE CASCADE,
        course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
        progress INTEGER NOT NULL DEFAULT 0,
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (userid, course_id)
      )
    `);

    // Statistics table (per-course aggregated metrics)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS statistics (
        course_id INTEGER PRIMARY KEY REFERENCES courses(id) ON DELETE CASCADE,
        total_enrollments INTEGER NOT NULL DEFAULT 0,
        active_enrollments INTEGER NOT NULL DEFAULT 0,
        completion_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
        avg_completion_time NUMERIC(6,2) NOT NULL DEFAULT 0
      )
    `);
    
    // Seed initial data if courses table is empty
    console.log('Checking course count...');
    const countResult = await pool.query(
      'SELECT COUNT(*)::int AS count FROM courses'
    );

    if (countResult.rows[0].count === 0) {
      console.log('Seeding 50 unique courses, topics, contents, and instructor users...');

      const now = new Date().toISOString();

      const seedCourses = [
        {
          name: 'Complete Web Development Bootcamp',
          university: 'Stanford University',
          instructor: 'Dr. Angela Yu',
          category: 'technology',
          fee: 599,
          originalPrice: 3999,
          rating: 4.8,
          students: 245682,
          icon: '💻',
          bestseller: true,
          featured: true,
          trending: true,
          isNew: false,
          duration: '12 weeks',
        },
        {
          name: 'Digital Marketing Masterclass',
          university: 'Harvard Business School',
          instructor: 'Prof. John Smith',
          category: 'marketing',
          fee: 549,
          originalPrice: 3499,
          rating: 4.7,
          students: 189321,
          icon: '📱',
          bestseller: true,
          featured: true,
          trending: false,
          isNew: false,
          duration: '8 weeks',
        },
        {
          name: 'Data Science & Machine Learning',
          university: 'MIT',
          instructor: 'Dr. Andrew Ng',
          category: 'technology',
          fee: 699,
          originalPrice: 4499,
          rating: 4.9,
          students: 312456,
          icon: '🤖',
          bestseller: true,
          featured: true,
          trending: true,
          isNew: false,
          duration: '10 weeks',
        },
        {
          name: 'Python for Data Analysis',
          university: 'UC Berkeley',
          instructor: 'Dr. Sarah Johnson',
          category: 'technology',
          fee: 479,
          originalPrice: 2999,
          rating: 4.6,
          students: 156782,
          icon: '🐍',
          bestseller: false,
          featured: true,
          trending: true,
          isNew: false,
          duration: '8 weeks',
        },
        {
          name: 'UI/UX Design Fundamentals',
          university: 'Rhode Island School of Design',
          instructor: 'Emily Chen',
          category: 'design',
          fee: 529,
          originalPrice: 3199,
          rating: 4.7,
          students: 98456,
          icon: '🎨',
          bestseller: false,
          featured: true,
          trending: false,
          isNew: true,
          duration: '6 weeks',
        },
        {
          name: 'Financial Analysis & Valuation',
          university: 'Wharton Business School',
          instructor: 'Prof. Michael Brown',
          category: 'finance',
          fee: 649,
          originalPrice: 3799,
          rating: 4.8,
          students: 87234,
          icon: '💰',
          bestseller: true,
          featured: false,
          trending: false,
          isNew: false,
          duration: '10 weeks',
        },
        {
          name: 'Mobile App Development with React Native',
          university: 'Stanford University',
          instructor: 'Chris Anderson',
          category: 'technology',
          fee: 579,
          originalPrice: 3599,
          rating: 4.5,
          students: 124567,
          icon: '📱',
          bestseller: false,
          featured: false,
          trending: true,
          isNew: true,
          duration: '9 weeks',
        },
        {
          name: 'Advanced Excel for Business',
          university: 'Harvard Business School',
          instructor: 'Jennifer Lee',
          category: 'business',
          fee: 399,
          originalPrice: 1999,
          rating: 4.6,
          students: 203456,
          icon: '📊',
          bestseller: true,
          featured: false,
          trending: false,
          isNew: false,
          duration: '5 weeks',
        },
        {
          name: 'Photography Masterclass',
          university: 'New York Film Academy',
          instructor: 'David Martinez',
          category: 'photography',
          fee: 449,
          originalPrice: 2499,
          rating: 4.7,
          students: 67890,
          icon: '📸',
          bestseller: false,
          featured: true,
          trending: false,
          isNew: false,
          duration: '7 weeks',
        },
        {
          name: 'Artificial Intelligence & Deep Learning',
          university: 'MIT',
          instructor: 'Dr. Yann LeCun',
          category: 'technology',
          fee: 799,
          originalPrice: 4999,
          rating: 4.9,
          students: 178923,
          icon: '🤖',
          bestseller: true,
          featured: true,
          trending: true,
          isNew: false,
          duration: '14 weeks',
        },
        {
          name: 'Content Marketing Strategy',
          university: 'Northwestern University',
          instructor: 'Rachel Green',
          category: 'marketing',
          fee: 499,
          originalPrice: 2799,
          rating: 4.5,
          students: 92341,
          icon: '📝',
          bestseller: false,
          featured: false,
          trending: true,
          isNew: true,
          duration: '6 weeks',
        },
        {
          name: 'Cybersecurity Essentials',
          university: 'Carnegie Mellon University',
          instructor: 'Dr. Kevin Patel',
          category: 'technology',
          fee: 629,
          originalPrice: 3699,
          rating: 4.7,
          students: 145678,
          icon: '🔒',
          bestseller: false,
          featured: true,
          trending: true,
          isNew: false,
          duration: '8 weeks',
        },
        {
          name: 'Project Management Professional (PMP)',
          university: 'George Washington University',
          instructor: 'Susan Taylor',
          category: 'business',
          fee: 699,
          originalPrice: 4199,
          rating: 4.8,
          students: 134567,
          icon: '📋',
          bestseller: true,
          featured: true,
          trending: false,
          isNew: false,
          duration: '12 weeks',
        },
        {
          name: 'Spanish for Beginners',
          university: 'Instituto Cervantes',
          instructor: 'Carlos Rodriguez',
          category: 'language',
          fee: 349,
          originalPrice: 1799,
          rating: 4.6,
          students: 187654,
          icon: '🇪🇸',
          bestseller: false,
          featured: false,
          trending: false,
          isNew: false,
          duration: '8 weeks',
        },
        {
          name: 'Blockchain Development',
          university: 'Stanford University',
          instructor: 'Dr. Vitalik Chen',
          category: 'technology',
          fee: 749,
          originalPrice: 4399,
          rating: 4.5,
          students: 76543,
          icon: '⛓️',
          bestseller: false,
          featured: true,
          trending: true,
          isNew: true,
          duration: '10 weeks',
        },
        {
          name: 'Graphic Design Bootcamp',
          university: 'Parsons School of Design',
          instructor: 'Amanda White',
          category: 'design',
          fee: 549,
          originalPrice: 3299,
          rating: 4.7,
          students: 112345,
          icon: '🎨',
          bestseller: false,
          featured: false,
          trending: false,
          isNew: false,
          duration: '8 weeks',
        },
        {
          name: 'Leadership & Management Skills',
          university: 'London Business School',
          instructor: 'Prof. James Wilson',
          category: 'business',
          fee: 599,
          originalPrice: 3499,
          rating: 4.8,
          students: 156789,
          icon: '👔',
          bestseller: true,
          featured: true,
          trending: false,
          isNew: false,
          duration: '9 weeks',
        },
        {
          name: 'Cloud Computing with AWS',
          university: 'Georgia Tech',
          instructor: 'Dr. Priya Sharma',
          category: 'technology',
          fee: 679,
          originalPrice: 3999,
          rating: 4.7,
          students: 143210,
          icon: '☁️',
          bestseller: false,
          featured: true,
          trending: true,
          isNew: false,
          duration: '10 weeks',
        },
        {
          name: 'SEO & Google Analytics',
          university: 'University of California',
          instructor: 'Mark Stevens',
          category: 'marketing',
          fee: 429,
          originalPrice: 2299,
          rating: 4.5,
          students: 198765,
          icon: '🔍',
          bestseller: true,
          featured: false,
          trending: true,
          isNew: false,
          duration: '6 weeks',
        },
        {
          name: 'Video Editing with Adobe Premiere',
          university: 'Full Sail University',
          instructor: 'Jake Thompson',
          category: 'design',
          fee: 479,
          originalPrice: 2699,
          rating: 4.6,
          students: 89012,
          icon: '🎬',
          bestseller: false,
          featured: false,
          trending: false,
          isNew: true,
          duration: '7 weeks',
        },
        {
          name: 'Investment Banking Fundamentals',
          university: 'Columbia Business School',
          instructor: 'Prof. Robert Davis',
          category: 'finance',
          fee: 799,
          originalPrice: 4799,
          rating: 4.8,
          students: 67234,
          icon: '💼',
          bestseller: false,
          featured: true,
          trending: false,
          isNew: false,
          duration: '11 weeks',
        },
        {
          name: 'JavaScript: The Complete Guide',
          university: 'UC Berkeley',
          instructor: 'Maximilian Schmidt',
          category: 'technology',
          fee: 549,
          originalPrice: 3199,
          rating: 4.8,
          students: 234567,
          icon: '⚛️',
          bestseller: true,
          featured: true,
          trending: true,
          isNew: false,
          duration: '11 weeks',
        },
        {
          name: 'Social Media Marketing 2026',
          university: 'University of Texas',
          instructor: 'Lisa Anderson',
          category: 'marketing',
          fee: 399,
          originalPrice: 1999,
          rating: 4.4,
          students: 176543,
          icon: '📱',
          bestseller: false,
          featured: false,
          trending: true,
          isNew: true,
          duration: '5 weeks',
        },
        {
          name: 'Mandarin Chinese for Professionals',
          university: 'Peking University',
          instructor: 'Prof. Wei Zhang',
          category: 'language',
          fee: 449,
          originalPrice: 2499,
          rating: 4.7,
          students: 134567,
          icon: '🇨🇳',
          bestseller: false,
          featured: true,
          trending: false,
          isNew: false,
          duration: '10 weeks',
        },
        {
          name: 'DevOps Engineering',
          university: 'MIT',
          instructor: 'Dr. Thomas Lee',
          category: 'technology',
          fee: 699,
          originalPrice: 4199,
          rating: 4.7,
          students: 98765,
          icon: '⚙️',
          bestseller: false,
          featured: true,
          trending: true,
          isNew: false,
          duration: '9 weeks',
        },
        {
          name: 'Nutrition & Wellness Coaching',
          university: 'Cornell University',
          instructor: 'Dr. Maria Garcia',
          category: 'health',
          fee: 429,
          originalPrice: 2399,
          rating: 4.6,
          students: 112890,
          icon: '🥗',
          bestseller: false,
          featured: false,
          trending: false,
          isNew: false,
          duration: '7 weeks',
        },
        {
          name: 'Music Production & Audio Engineering',
          university: 'Berklee College of Music',
          instructor: 'DJ Max Roberts',
          category: 'music',
          fee: 629,
          originalPrice: 3699,
          rating: 4.8,
          students: 87654,
          icon: '🎹',
          bestseller: false,
          featured: true,
          trending: false,
          isNew: false,
          duration: '10 weeks',
        },
        {
          name: 'Cooking Masterclass: Italian Cuisine',
          university: 'Culinary Institute of America',
          instructor: 'Chef Marco Rossi',
          category: 'cooking',
          fee: 349,
          originalPrice: 1799,
          rating: 4.7,
          students: 145678,
          icon: '🍝',
          bestseller: false,
          featured: false,
          trending: false,
          isNew: true,
          duration: '6 weeks',
        },
        {
          name: 'Quantum Computing Fundamentals',
          university: 'Caltech',
          instructor: 'Dr. John Preskill',
          category: 'science',
          fee: 849,
          originalPrice: 5199,
          rating: 4.6,
          students: 43210,
          icon: '⚛️',
          bestseller: false,
          featured: true,
          trending: true,
          isNew: true,
          duration: '12 weeks',
        },
        {
          name: 'Oil Painting Techniques',
          university: 'Florence Academy of Art',
          instructor: 'Isabella Marino',
          category: 'arts',
          fee: 499,
          originalPrice: 2799,
          rating: 4.8,
          students: 56789,
          icon: '🎨',
          bestseller: false,
          featured: false,
          trending: false,
          isNew: false,
          duration: '8 weeks',
        },
        {
          name: 'Real Estate Investing',
          university: 'University of Pennsylvania',
          instructor: 'Robert Kiyosaki Jr.',
          category: 'finance',
          fee: 579,
          originalPrice: 3299,
          rating: 4.5,
          students: 123456,
          icon: '🏠',
          bestseller: true,
          featured: false,
          trending: true,
          isNew: false,
          duration: '8 weeks',
        },
        {
          name: 'Game Development with Unity',
          university: 'DigiPen Institute',
          instructor: 'Alex Turner',
          category: 'technology',
          fee: 649,
          originalPrice: 3799,
          rating: 4.6,
          students: 167890,
          icon: '🎮',
          bestseller: false,
          featured: true,
          trending: true,
          isNew: false,
          duration: '11 weeks',
        },
        {
          name: 'Email Marketing Automation',
          university: 'Boston University',
          instructor: 'Sarah Miller',
          category: 'marketing',
          fee: 379,
          originalPrice: 1899,
          rating: 4.4,
          students: 134567,
          icon: '✉️',
          bestseller: false,
          featured: false,
          trending: false,
          isNew: false,
          duration: '5 weeks',
        },
        {
          name: 'French Language & Culture',
          university: 'Sorbonne University',
          instructor: 'Pierre Dubois',
          category: 'language',
          fee: 399,
          originalPrice: 2099,
          rating: 4.7,
          students: 98765,
          icon: '🇫🇷',
          bestseller: false,
          featured: false,
          trending: false,
          isNew: false,
          duration: '9 weeks',
        },
        {
          name: 'iOS Development with Swift',
          university: 'Stanford University',
          instructor: 'Dr. Paul Hegarty',
          category: 'technology',
          fee: 629,
          originalPrice: 3699,
          rating: 4.8,
          students: 187654,
          icon: '📱',
          bestseller: true,
          featured: true,
          trending: false,
          isNew: false,
          duration: '10 weeks',
        },
        {
          name: 'Business Analytics & Intelligence',
          university: 'NYU Stern',
          instructor: 'Prof. Linda Cohen',
          category: 'business',
          fee: 679,
          originalPrice: 3999,
          rating: 4.7,
          students: 112345,
          icon: '📊',
          bestseller: false,
          featured: true,
          trending: true,
          isNew: false,
          duration: '9 weeks',
        },
        {
          name: 'Portrait Photography',
          university: 'Rhode Island School of Design',
          instructor: 'Annie Leibovitz Jr.',
          category: 'photography',
          fee: 529,
          originalPrice: 2999,
          rating: 4.8,
          students: 76543,
          icon: '📸',
          bestseller: false,
          featured: true,
          trending: false,
          isNew: false,
          duration: '7 weeks',
        },
        {
          name: 'Personal Branding & Career Development',
          university: 'Duke University',
          instructor: 'Gary Vaynerchuk Jr.',
          category: 'personal-dev',
          fee: 449,
          originalPrice: 2399,
          rating: 4.6,
          students: 145678,
          icon: '🌟',
          bestseller: false,
          featured: false,
          trending: true,
          isNew: true,
          duration: '6 weeks',
        },
        {
          name: 'Introduction to Robotics',
          university: 'Carnegie Mellon University',
          instructor: 'Dr. Sebastian Thrun',
          category: 'science',
          fee: 749,
          originalPrice: 4399,
          rating: 4.7,
          students: 67890,
          icon: '🤖',
          bestseller: false,
          featured: true,
          trending: false,
          isNew: false,
          duration: '11 weeks',
        },
        {
          name: 'Mindfulness & Meditation',
          university: 'UCLA',
          instructor: 'Dr. Dan Harris',
          category: 'health',
          fee: 299,
          originalPrice: 1499,
          rating: 4.8,
          students: 234567,
          icon: '🧘',
          bestseller: true,
          featured: false,
          trending: false,
          isNew: false,
          duration: '4 weeks',
        },
        {
          name: 'Documentary Filmmaking',
          university: 'USC School of Cinematic Arts',
          instructor: 'Ken Burns Jr.',
          category: 'arts',
          fee: 599,
          originalPrice: 3499,
          rating: 4.6,
          students: 54321,
          icon: '🎥',
          bestseller: false,
          featured: false,
          trending: false,
          isNew: true,
          duration: '9 weeks',
        },
        {
          name: 'Cryptocurrency Trading',
          university: 'Singapore Management University',
          instructor: 'Michael Saylor Jr.',
          category: 'finance',
          fee: 549,
          originalPrice: 3199,
          rating: 4.3,
          students: 198765,
          icon: '₿',
          bestseller: false,
          featured: false,
          trending: true,
          isNew: true,
          duration: '7 weeks',
        },
        {
          name: 'Angular: The Complete Developer Course',
          university: 'Google Developer Training',
          instructor: 'Maximilian Schmidt',
          category: 'technology',
          fee: 529,
          originalPrice: 3099,
          rating: 4.6,
          students: 134567,
          icon: '🅰️',
          bestseller: false,
          featured: false,
          trending: false,
          isNew: false,
          duration: '10 weeks',
        },
        {
          name: 'Influencer Marketing Strategy',
          university: 'University of Southern California',
          instructor: 'Emma Chamberlain',
          category: 'marketing',
          fee: 479,
          originalPrice: 2699,
          rating: 4.5,
          students: 167890,
          icon: '📸',
          bestseller: false,
          featured: false,
          trending: true,
          isNew: true,
          duration: '6 weeks',
        },
        {
          name: 'German for Business',
          university: 'Goethe-Institut',
          instructor: 'Hans Mueller',
          category: 'language',
          fee: 429,
          originalPrice: 2299,
          rating: 4.6,
          students: 87654,
          icon: '🇩🇪',
          bestseller: false,
          featured: false,
          trending: false,
          isNew: false,
          duration: '8 weeks',
        },
        {
          name: 'Full Stack Web Development',
          university: 'IIT Kharagpur',
          instructor: 'Dr. Raj Kumar',
          category: 'technology',
          fee: 649,
          originalPrice: 3799,
          rating: 4.7,
          students: 212345,
          icon: '💻',
          bestseller: true,
          featured: true,
          trending: true,
          isNew: false,
          duration: '13 weeks',
        },
        {
          name: 'Entrepreneurship & Startup Launch',
          university: 'Stanford Graduate School of Business',
          instructor: 'Prof. Steve Blank',
          category: 'business',
          fee: 749,
          originalPrice: 4499,
          rating: 4.8,
          students: 145678,
          icon: '🚀',
          bestseller: true,
          featured: true,
          trending: false,
          isNew: false,
          duration: '10 weeks',
        },
        {
          name: 'Architecture & Interior Design',
          university: 'Pratt Institute',
          instructor: 'Zaha Hadid Academy',
          category: 'design',
          fee: 699,
          originalPrice: 4199,
          rating: 4.7,
          students: 65432,
          icon: '🏛️',
          bestseller: false,
          featured: true,
          trending: false,
          isNew: false,
          duration: '11 weeks',
        },
        {
          name: 'Yoga Teacher Training',
          university: 'Yoga Alliance International',
          instructor: 'Shiva Rea',
          category: 'health',
          fee: 579,
          originalPrice: 3299,
          rating: 4.9,
          students: 123456,
          icon: '🧘‍♀️',
          bestseller: false,
          featured: true,
          trending: false,
          isNew: false,
          duration: '12 weeks',
        },
        {
          name: 'Screenwriting for Film & TV',
          university: 'UCLA School of Theater',
          instructor: 'Aaron Sorkin Jr.',
          category: 'arts',
          fee: 549,
          originalPrice: 3199,
          rating: 4.6,
          students: 89012,
          icon: '✍️',
          bestseller: false,
          featured: false,
          trending: false,
          isNew: false,
          duration: '9 weeks',
        },
      ];

      const insertCourseText = `
        INSERT INTO courses
          (name, instructor, category, university, fee, duration, created_at,
           original_price, rating, students, icon, bestseller, featured, trending, is_new)
        VALUES
          ($1, $2, $3, $4, $5, $6, $7,
           $8, $9, $10, $11, $12, $13, $14, $15)
        RETURNING id
      `;

      const topicInsertText = `
        INSERT INTO course_topics (course_id, title, description, order_index)
        VALUES ($1, $2, $3, $4)
      `;

      const contentInsertText = `
        INSERT INTO course_contents (course_id, title, content_type, url, note_text, order_index)
        VALUES ($1, $2, $3, $4, $5, $6)
      `;

      // Category-specific "What you'll learn" mini topics
      const topicsByCategory = {
        technology: [
          ['Programming Foundations', 'Variables, control flow, data structures, and debugging'],
          ['APIs & Integrations', 'Calling REST APIs, handling JSON, and working with third‑party services'],
          ['Databases & Persistence', 'Designing schemas and querying relational / NoSQL databases'],
          ['Deployment & DevOps Basics', 'Environments, builds, and shipping code to production'],
        ],
        business: [
          ['Financial Statements', 'Income statement, balance sheet, and cash flow analysis'],
          ['Valuation Techniques', 'DCF, comparables, and multiples-based valuation'],
          ['Strategic Decision-Making', 'Frameworks for evaluating investments and projects'],
          ['Reporting & Dashboards', 'Building clear reports for leadership and stakeholders'],
        ],
        marketing: [
          ['Customer Personas', 'Identifying audiences and mapping customer journeys'],
          ['Acquisition Channels', 'SEO, social, email, and paid campaigns'],
          ['Campaign Analytics', 'Tracking KPIs, funnels, and conversion rates'],
          ['Content & Copywriting', 'Crafting persuasive messages and landing pages'],
        ],
        finance: [
          ['Time Value of Money', 'NPV, IRR, and discounting cash flows'],
          ['Risk & Return', 'Portfolio theory and diversification concepts'],
          ['Capital Markets', 'Equity, debt, and derivatives basics'],
          ['Deal Structuring', 'Term sheets, covenants, and transaction mechanics'],
        ],
        design: [
          ['Visual Hierarchy', 'Layout, alignment, and emphasis in UI screens'],
          ['Typography & Color', 'Type systems, color palettes, and contrast'],
          ['Design Systems', 'Reusable components and design tokens'],
          ['Prototyping & Handoffs', 'Wireframes, prototypes, and developer handoff files'],
        ],
        language: [
          ['Essential Vocabulary', 'Daily phrases and high‑frequency words'],
          ['Grammar Building Blocks', 'Tenses, sentence structure, and common patterns'],
          ['Listening & Pronunciation', 'Improving accent and understanding native speakers'],
          ['Situational Dialogues', 'Conversations for travel, study, and business'],
        ],
        photography: [
          ['Camera Basics', 'Exposure triangle, ISO, shutter speed, and aperture'],
          ['Composition Techniques', 'Rule of thirds, leading lines, and framing'],
          ['Lighting Fundamentals', 'Natural vs studio light and using reflectors'],
          ['Editing Workflow', 'RAW processing and color correction in editing tools'],
        ],
        health: [
          ['Nutrition Principles', 'Macros, micros, and balanced meal planning'],
          ['Movement & Exercise', 'Designing safe and effective workout plans'],
          ['Habit Building', 'Coaching clients to adopt sustainable lifestyle changes'],
          ['Client Assessments', 'Intake forms, progress tracking, and check‑ins'],
        ],
        music: [
          ['Music Theory Basics', 'Scales, chords, and chord progressions'],
          ['Arranging & Harmony', 'Building full arrangements from simple ideas'],
          ['Recording Techniques', 'Microphone choice, gain staging, and tracking'],
          ['Mixing & Mastering', 'EQ, compression, and final polish for releases'],
        ],
        cooking: [
          ['Knife Skills & Mise en Place', 'Preparing ingredients safely and efficiently'],
          ['Stocks & Sauces', 'Building flavors with classic bases and reductions'],
          ['Regional Dishes', 'Signature recipes from the course’s cuisine focus'],
          ['Plating & Presentation', 'Restaurant‑style plating and garnishing'],
        ],
        science: [
          ['Foundational Concepts', 'Key laws, theories, and mathematical tools'],
          ['Experimental Design', 'Formulating hypotheses and setting up experiments'],
          ['Data Analysis', 'Interpreting results and visualizing findings'],
          ['Real‑World Applications', 'How theory is used in modern technology and research'],
        ],
        arts: [
          ['Materials & Tools', 'Choosing paints, brushes, and surfaces'],
          ['Form & Perspective', 'Drawing believable shapes, depth, and space'],
          ['Color & Texture', 'Blending, layering, and creating visual interest'],
          ['Personal Style Development', 'Finding and refining your artistic voice'],
        ],
        'personal-dev': [
          ['Goal Setting Frameworks', 'Translating big goals into actionable plans'],
          ['Communication Skills', 'Presenting ideas clearly and confidently'],
          ['Productivity Systems', 'Time management and focus strategies'],
          ['Building a Personal Brand', 'Positioning yourself across platforms'],
        ],
      };

      const defaultTopics = [
        ['Introduction & Overview', 'Course introduction, goals, and structure'],
        ['Core Concepts', 'Fundamental theories, tools, and terminology'],
        ['Practical Application', 'Hands-on exercises and real-world use cases'],
        ['Advanced Techniques', 'Deeper dive into more complex scenarios'],
      ];

      // Default generic contents: 2 videos + 2 notes with placeholder links/text
      const defaultContents = [
        [
          'Welcome & Course Tour (Video)',
          'video',
          'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          null,
        ],
        [
          'Core Concepts Walkthrough (Video)',
          'video',
          'https://www.youtube.com/watch?v=3GwjfUFyY6M',
          null,
        ],
        [
          'Lecture Notes – Key Ideas',
          'note',
          'https://docs.google.com/document/d/1N9YWvcyF1YolZuQiR_AUhiNDRc-JFrk8rHL9KAMnP5A/preview',
          'Open the Google Docs notes summarizing the most important concepts in this course.',
        ],
        [
          'Cheatsheet / Reference Guide',
          'note',
          'https://docs.google.com/document/d/1N9YWvcyF1YolZuQiR_AUhiNDRc-JFrk8rHL9KAMnP5A/preview',
          'Quick-reference Google Docs cheatsheet for formulas, commands, or patterns used throughout the course.',
        ],
      ];

      // Seed all 50 courses with course topics and contents
      const instructorNames = new Set();
      for (const c of seedCourses) {
        const courseRes = await pool.query(insertCourseText, [
          c.name,
          c.instructor,
          c.category,
          c.university,
          c.fee,
          c.duration,
          now,
          c.originalPrice,
          c.rating,
          c.students,
          c.icon,
          c.bestseller,
          c.featured,
          c.trending,
          c.isNew,
        ]);

        const courseId = courseRes.rows[0].id;

        if (c.instructor) {
          instructorNames.add(c.instructor);
        }

        // Pick appropriate mini topics based on course category
        const topicSet =
          topicsByCategory[c.category] && topicsByCategory[c.category].length
            ? topicsByCategory[c.category]
            : defaultTopics;

        for (let i = 0; i < topicSet.length; i++) {
          const [title, description] = topicSet[i];
          await pool.query(topicInsertText, [
            courseId,
            title,
            description,
            i + 1,
          ]);
        }

        // Contents (videos + notes)
        for (let i = 0; i < defaultContents.length; i++) {
          const [title, contentType, url, noteText] = defaultContents[i];
          await pool.query(contentInsertText, [
            courseId,
            title,
            contentType,
            url,
            noteText,
            i + 1,
          ]);
        }
      }

      // Seed instructor users corresponding to hardcoded course instructors
      if (instructorNames.size > 0) {
        console.log(`Seeding ${instructorNames.size} instructor users from seeded courses...`);
        const instructorPasswordHash = await bcrypt.hash('123', 10); // same as admin password

        const slugify = (name) =>
          name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '')
            .replace(/^(\d+)/, '');

        for (const name of instructorNames) {
          const baseSlug = slugify(name) || 'instructor';
          const userid = `instr_${baseSlug}`;
          const email = `${userid}@learnx.com`;

          await pool.query(
            `
            INSERT INTO users (userid, name, email, password_hash, role, created_at)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (userid) DO NOTHING
            `,
            [userid, name, email, instructorPasswordHash, 'instructor', now]
          );
        }
      }

      console.log('Seeded 50 unique courses, topics, contents, and instructor users into PostgreSQL');
    }
  } catch (err) {
    console.error('Error initializing database in PostgreSQL:', err.message);
  }
}

initDb();

module.exports = pool;
