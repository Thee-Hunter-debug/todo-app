require("dotenv").config();
const express = require("express");
const bcrypt = require("bcryptjs");
const session = require("express-session");
const path = require("path");
const { Pool } = require("pg");
const crypto = require("crypto");
const token = crypto.randomBytes(32).toString("hex");
const nodemailer = require("nodemailer");

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

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/TodoSysLand.html"));
});


app.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "public/login.html"));
});

app.get("/signup", (req, res) => {
  res.sendFile(path.join(__dirname, "public/Signup.html"));
});

app.get("/home", (req, res) => {
  if (!req.session.userId) {
    return res.redirect("/login");
  }
  res.sendFile(path.join(__dirname, "public/TodoSys.html"));
});

app.post("/signup", async (req, res) => {
  const { name, surname, email, password, confirmPassword } = req.body;

  if (!name || !surname || !email || !password || !confirmPassword) {
    return res.redirect("/signup?error=missing");
  }

  if (password !== confirmPassword) {
    return res.redirect("/signup?error=mismatch");
  }

  try {
    const userCheck = await pool.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);
    if (userCheck.rows.length > 0) {
      return res.redirect("/signup?error=exists");
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await pool.query(
      "INSERT INTO users (name, surname, email, password) VALUES ($1, $2, $3, $4)",
      [name, surname, email, hashedPassword]
    );

    return res.redirect("/login");
  } catch (err) {
    console.error(err);
    console.error("Signup error details:", err);
    return res.redirect("/signup?error=failed");
  }
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const userResult = await pool.query(
      "SELECT * FROM users WHERE email = $1",
      [email]
    );
    const user = userResult.rows[0];

    if (!user) return res.redirect("/login?error=invalid");

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.redirect("/login?error=invalid");

    req.session.userId = user.id;
    res.redirect("/home");
  } catch (err) {
    console.error(err);
    return res.redirect("/login?error=invalid");
  }
});

app.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/");
});

app.get("/api/me", async (req, res) => {
  if (!req.session.userId)
    return res.status(401).json({ error: "Not logged in" });

  try {
    const userResult = await pool.query(
      "SELECT id, name, surname FROM users WHERE id = $1",
      [req.session.userId]
    );
    const user = userResult.rows[0];
    if (!user) return res.status(404).json({ error: "User not found" });

    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/tasks", async (req, res) => {
  try {
    const userId = Number(req.query.userId);
    if (!req.session.userId)
      return res.status(401).json({ error: "Not logged in" });

    const result = await pool.query(
      `
      SELECT id, user_id, title, description, due_date, priority, tags, done, created_at, updated_at
      FROM tasks
      WHERE user_id = $1
      ORDER BY id DESC
    `,
      [userId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch tasks" });
  }
});

app.post("/api/tasks", async (req, res) => {
  const { id, title, desc, prio, due, tags, done } = req.body;

  if (!req.session.userId)
    return res.status(401).json({ error: "Not logged in" });

  try {
    if (id && done !== undefined) {
      const result = await pool.query(
        "UPDATE tasks SET done=$1, updated_at=NOW() WHERE id=$2 AND user_id=$3 RETURNING *",
        [done, id, req.session.userId]
      );
      if (!result.rows[0])
        return res.status(404).json({ error: "Task not found" });
      return res.json(result.rows[0]);
    }

    if (id) {
      const result = await pool.query(
        `UPDATE tasks
         SET title=$1, description=$2, priority=$3, due_date=$4, tags=$5, updated_at=NOW()
         WHERE id=$6 AND user_id=$7 RETURNING *`,
        [title, desc, prio, due, tags, id, req.session.userId]
      );
      if (!result.rows[0])
        return res.status(404).json({ error: "Task not found" });
      return res.json(result.rows[0]);
    }

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
  if (!req.session.userId)
    return res.status(401).json({ error: "Not logged in" });

  try {
    const result = await pool.query(
      "DELETE FROM tasks WHERE id=$1 AND user_id=$2 RETURNING *",
      [id, req.session.userId]
    );
    if (!result.rows[0])
      return res.status(404).json({ error: "Task not found" });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete task" });
  }
});

app.post("/api/tasks/toggle", async (req, res) => {
  const { id } = req.body;
  if (!req.session.userId)
    return res.status(401).json({ error: "Not logged in" });

  try {
    const result = await pool.query(
      `UPDATE tasks 
       SET done = NOT done, updated_at = now()
       WHERE id=$1 AND user_id=$2
       RETURNING *`,
      [id, req.session.userId]
    );

    if (!result.rows[0])
      return res.status(404).json({ error: "Task not found" });

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to toggle task" });
  }
});

app.delete("/api/tasks/bulk", async (req, res) => {
  const { ids } = req.body;
  if (!req.session.userId)
    return res.status(401).json({ error: "Not logged in" });
  if (!Array.isArray(ids) || !ids.length)
    return res.status(400).json({ error: "No task IDs provided" });

  try {
    const result = await pool.query(
      "DELETE FROM tasks WHERE id = ANY($1) AND user_id = $2 RETURNING *",
      [ids, req.session.userId]
    );

    if (!result.rows.length)
      return res.status(404).json({ error: "No matching tasks found" });

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

app.post("/api/tasks/bulk-toggle-done", async (req, res) => {
  const { ids } = req.body;
  if (!req.session.userId)
    return res.status(401).json({ error: "Not logged in" });
  if (!Array.isArray(ids) || !ids.length)
    return res.status(400).json({ error: "No task IDs provided" });

  try {
    const timestamp = Date.now();

    const result = await pool.query(
      `UPDATE tasks
       SET done = TRUE, completed_at = to_timestamp($2 / 1000.0)
       WHERE id = ANY($1) AND user_id = $3
       RETURNING *`,
      [ids, timestamp, req.session.userId]
    );

    if (!result.rows.length)
      return res.status(404).json({ error: "No matching tasks found" });

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

app.post("/password-reset", async (req, res) => {
  const { email } = req.body;

  if (!email || typeof email !== 'string' || !email.trim()) {
    return res.status(400).send("Email is required");
  }

  try {
    
    const user = await pool.query(
      "SELECT id, name FROM users WHERE email = $1",
      [email.trim().toLowerCase()]
    );

   
    if (user.rows.length === 0) {
      return res.status(200).send("If that email exists, your password has been sent to your email.");
    }

 
    const userId = user.rows[0].id;
    const userName = user.rows[0].name || "User";

    const tempPassword = crypto.randomBytes(12).toString('base64').replace(/[^a-zA-Z0-9]/g, '').substring(0, 12);
    
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    await pool.query(
      "UPDATE users SET password = $1 WHERE id = $2",
      [hashedPassword, userId]
    );

    if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
      try {
        const transporter = nodemailer.createTransport({
          service: "Gmail",
          auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
          }
        });

        await transporter.sendMail({
          from: `"Task Manager" <${process.env.EMAIL_USER}>`,
          to: email.trim(),
          subject: "Task Manager Password Reset",
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #0b0c10; color: #e6e8ec;">
              <h2 style="color: #6ee7ff;">Password Recovery</h2>
              <p>Hello ${userName},</p>
              <p>You requested your password. Here is your new password:</p>
              <div style="background: #111317; padding: 15px; border-radius: 8px; margin: 20px 0; text-align: center;">
                <p style="font-size: 18px; font-weight: bold; color: #6ee7ff; letter-spacing: 2px; margin: 0;">${tempPassword}</p>
              </div>
              <p style="color: #fcd34d;">⚠️ Please change this password after logging in for security.</p>
              <p>If you didn't request this, please contact support immediately.</p>
              <hr style="border: none; border-top: 1px solid rgba(255,255,255,0.1); margin: 20px 0;">
              <p style="color: #9aa3af; font-size: 12px;">This is an automated message. Please do not reply.</p>
            </div>
          `
        });
      } catch (emailErr) {
        console.error("Email error:", emailErr);
        return res.status(500).send("Failed to send email. Please try again later.");
      }
    } else {
      console.log("Email not configured. New password for", email, ":", tempPassword);
      return res.status(200).send(`Email not configured. Your new password is: ${tempPassword}`);
    }

    res.status(200).send("If that email exists, your password has been sent to your email.");

  } catch (err) {
    console.error("Password reset error:", err);
    res.status(500).send("Server error. Please try again later.");
  }
});

app.use(express.static(path.join(__dirname, "public"), {
  fallthrough: true,
  index: false
}));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "localsecret123",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false,
    },
  })
);


app.listen(PORT, () => console.log(` Running on http://localhost:${PORT}`));
