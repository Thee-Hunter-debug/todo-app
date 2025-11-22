require('dotenv').config();

const express = require('express');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = 3000;

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false
}));
app.use(session({
  secret: 'supersecretkey',
  resave: false,
  saveUninitialized: false
}));


// Landing Page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/TodoSysLand.html'));
});

// Login Page
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/login.html'));
});

// Signup Page
app.get('/signup', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/Signup.html'));
});


// Home Page (protected)
app.get('/home', (req, res) => {
  if (!req.session.userId) {
    return res.redirect('/login');
  }
  res.sendFile(path.join(__dirname, 'public/TodoSys.html'));
});

// Handle Signup
app.post('/signup', async (req, res) => {
  const { name, surname, email, password, confirmPassword } = req.body;

  // Check for empty fields
  if (!name || !surname || !email || !password || !confirmPassword) {
    return res.redirect('/signup?error=missing');
  }

  // Check password match
  if (password !== confirmPassword) {
    return res.redirect('/signup?error=mismatch');
  }

  try {
    const userCheck = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (userCheck.rows.length > 0) {
      return res.redirect('/signup?error=exists');
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    
    await pool.query(
      'INSERT INTO users (name, surname, email, password) VALUES ($1, $2, $3, $4)',
      [name, surname, email, hashedPassword]
    );

    return res.redirect('/login');
  } catch (err) {
    console.error(err);
    console.error("Signup error details:", err);
    return res.redirect('/signup?error=failed');
  }
});

// Handle Login
app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = userResult.rows[0];

    if (!user) return res.redirect('/login?error=invalid');

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.redirect('/login?error=invalid');

    req.session.userId = user.id;
    res.redirect('/home');
  } catch (err) {
    console.error(err);
    return res.redirect('/login?error=invalid');
  }
});

// Logout
app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

//After the Login the magin happens
app.get('/api/me', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not logged in' });

  try {
    const userResult = await pool.query('SELECT id, name, surname FROM users WHERE id = $1', [req.session.userId]);
    const user = userResult.rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });

    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

//fetching alles from the db
app.get("/api/tasks", async (req, res) => {
  try {
    const userId = Number(req.query.userId);  // <--- convert to number
    if (!userId) return res.status(400).json({ error: "Missing or invalid userId" });

    const result = await pool.query(`
      SELECT id, user_id, title, description, due_date, priority, tags, done, created_at, updated_at
      FROM tasks
      WHERE user_id = $1
      ORDER BY id DESC
    `, [userId]);

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch tasks" });
  }
});


//adding data to the table`
app.post('/api/tasks', async (req, res) => {
  const { id, title, desc, prio, due, tags, done } = req.body;

  if (!req.session.userId)
    return res.status(401).json({ error: "Not logged in" });

  try {
    if (id && done !== undefined) {
      // Only updating done status
      const result = await pool.query(
        "UPDATE tasks SET done=$1, updated_at=NOW() WHERE id=$2 AND user_id=$3 RETURNING *",
        [done, id, req.session.userId]
      );
      if (!result.rows[0]) return res.status(404).json({ error: "Task not found" });
      return res.json(result.rows[0]);
    }

    if (id) {
      // Full edit
      const result = await pool.query(
        `UPDATE tasks
         SET title=$1, description=$2, priority=$3, due_date=$4, tags=$5, updated_at=NOW()
         WHERE id=$6 AND user_id=$7 RETURNING *`,
        [title, desc, prio, due, tags, id, req.session.userId]
      );
      if (!result.rows[0]) return res.status(404).json({ error: "Task not found" });
      return res.json(result.rows[0]);
    }

    // Insert new
    const result = await pool.query(
      `INSERT INTO tasks (user_id, title, description, priority, due_date, tags)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [req.session.userId, title, desc, prio, due, tags]
    );
    return res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "DB error" });
  }
});


app.delete("/api/tasks", async (req, res) => {
  const { id } = req.body;
  if (!req.session.userId) return res.status(401).json({ error: "Not logged in" });

  try {
    const result = await pool.query(
      "DELETE FROM tasks WHERE id=$1 AND user_id=$2 RETURNING *",
      [id, req.session.userId]
    );
    if (!result.rows[0]) return res.status(404).json({ error: "Task not found" });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete task" });
  }
}); 
// Toggle task done status
app.post("/api/tasks/toggle", async (req, res) => {
  const { id } = req.body;
  if (!req.session.userId) return res.status(401).json({ error: "Not logged in" });

  try {
    const result = await pool.query(
      `UPDATE tasks 
       SET done = NOT done, updated_at = now()
       WHERE id=$1 AND user_id=$2
       RETURNING *`,
      [id, req.session.userId]
    );

    if (!result.rows[0]) return res.status(404).json({ error: "Task not found" });

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to toggle task" });
  }
});

//This API is responsible for bulk deleting tasks 
app.delete("/api/tasks/bulk", async (req, res) => {
  const { ids } = req.body; // expect an array of task IDs
  if (!req.session.userId) return res.status(401).json({ error: "Not logged in" });
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: "No task IDs provided" });

  try {
    
    const result = await pool.query(
      "DELETE FROM tasks WHERE id = ANY($1) AND user_id = $2 RETURNING *",
      [ids, req.session.userId]
    );

    if (!result.rows.length) return res.status(404).json({ error: "No matching tasks found" });

    res.json({
      success: true,
      deletedCount: result.rows.length,
      deletedTasks: result.rows, 
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete tasks" });
  }
});

//This API is responsible for bulk marking tasks as done 
app.post("/api/tasks/bulk-toggle-done", async (req, res) => {
  const { ids } = req.body; // array of task IDs
  if (!req.session.userId) return res.status(401).json({ error: "Not logged in" });
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: "No task IDs provided" });

  try {
    const timestamp = Date.now();

    const result = await pool.query(
      `UPDATE tasks
       SET done = TRUE, completed_at = to_timestamp($2 / 1000.0)
       WHERE id = ANY($1) AND user_id = $3
       RETURNING *`,
      [ids, timestamp, req.session.userId]
    );

    if (!result.rows.length) return res.status(404).json({ error: "No matching tasks found" });

    res.json({
      success: true,
      updatedCount: result.rows.length,
      updatedTasks: result.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update tasks" });
  }
});


// Start server
app.listen(PORT, () => console.log(`🚀 Running on http://localhost:${PORT}`));
