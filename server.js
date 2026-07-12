require("dotenv").config();
const express = require("express");
const bcrypt = require("bcryptjs");
const session = require("express-session");
const path = require("path");
const { Pool } = require("pg");
const crypto = require("crypto");
const token = crypto.randomBytes(32).toString("hex");
const { Resend } = require("resend");

const app = express();
const PORT = process.env.PORT || 3000;

const resend = new Resend(process.env.RESEND_API_KEY);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

(async () => {
  try {
    console.log("Connecting...");
    const result = await pool.query("SELECT NOW()");
    console.log("SUCCESS:", result.rows[0]);
  } catch (err) {
    console.error("FAILED:", err);
  }
})();

pool.on("error", (err) => {
  console.error("POOL ERROR:", err);
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
  }),
);

// Landing Page
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/TodoSysLand.html"));
});

// Login Page
app.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "public/Login.html"));
});

//signup page
app.get("/signup", (req, res) => {
  res.sendFile(path.join(__dirname, "public/Signup.html"));
});

//404
app.get("/not-found ", (req, res) => {
  res.sendFile(path.join(__dirname, "public/fgtpss.html"));
});

//serve passfgt
app.get("/fgtpass", (req, res) => {
  res.sendFile(path.join(__dirname, "public/fgtpss.html"));
});

// Valid
app.get("/home", (req, res) => {
  if (!req.session.userId) {
    return res.redirect("/login");
  }
  res.sendFile(path.join(__dirname, "public/TodoSys.html"));
});

//Handle sign up
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
      [name, surname, email, hashedPassword],
    );

    return res.redirect("/login");
  } catch (err) {
    console.error(err);
    console.error("Signup error details:", err);
    return res.redirect("/signup?error=failed");
  }
});

// Handle Login
app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const userResult = await pool.query(
      "SELECT * FROM users WHERE email = $1",
      [email],
    );
    const user = userResult.rows[0];

    if (!user) return res.redirect("/login?error=invalid");

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.redirect("/login?error=invalid");

    req.session.userId = user.id;
    res.redirect("/home");
    console.log(req.session);
  } catch (err) {
    console.log("Connecting to:", process.env.DATABASE_URL);
    console.error(err);
    return res.redirect("/login?error=invalid");
  }
});

// Logout
app.get("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.log(err);
    }
  });

  res.clearCookie("connect.sid");
  res.redirect("/");
});

//After the Login the magic happens
app.get("/api/me", async (req, res) => {
  if (!req.session.userId)
    return res.status(401).json({ error: "Not logged in" });

  try {
    const userResult = await pool.query(
      "SELECT id, name, surname FROM users WHERE id = $1",
      [req.session.userId],
    );
    const user = userResult.rows[0];
    if (!user) return res.status(404).json({ error: "User not found" });

    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

//handle fetch tasks
app.get("/api/tasks", async (req, res) => {
  try {
    const userId = req.session.userId;
    if (!req.session.userId)
      return res.status(401).json({ error: "Not logged in" });

    const result = await pool.query(
      `
      SELECT id, user_id, title, description, due_date, priority, tags, done, created_at, updated_at
      FROM tasks
      WHERE user_id = $1
      ORDER BY id DESC
    `,
      [userId],
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch tasks" });
  }
});

//adding data to the table
app.post("/api/tasks", async (req, res) => {
  const { id, title, desc, prio, due, tags, done } = req.body;

  if (!req.session.userId)
    return res.status(401).json({ error: "Not logged in" });

  try {
    if (id && done !== undefined) {
      const result = await pool.query(
        "UPDATE tasks SET done=$1, updated_at=NOW() WHERE id=$2 AND user_id=$3 RETURNING *",
        [done, id, req.session.userId],
      );
      if (!result.rows[0])
        return res.status(404).json({ error: "Task not found" });
      return res.json(result.rows[0]);
    }

    if (id) {
      // Full edit
      const result = await pool.query(
        `UPDATE tasks
         SET title=$1, description=$2, priority=$3, due_date=$4, tags=$5, updated_at=NOW()
         WHERE id=$6 AND user_id=$7 RETURNING *`,
        [title, desc, prio, due, tags, id, req.session.userId],
      );
      if (!result.rows[0])
        return res.status(404).json({ error: "Task not found" });
      return res.json(result.rows[0]);
    }

    const result = await pool.query(
      `INSERT INTO tasks (user_id, title, description, priority, due_date, tags)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [req.session.userId, title, desc, prio, due, tags],
    );
    return res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    console.error("===== TASK ERROR =====");
    console.error(err);
    console.error(err.stack);
    console.error("User ID:", req.session.userId);
    console.error("Request Body:", req.body);
    res.status(500).json({ error: "DB error" });
  }
});

//deleting data
app.delete("/api/tasks", async (req, res) => {
  const { id } = req.body;
  if (!req.session.userId)
    return res.status(401).json({ error: "Not logged in" });

  try {
    const result = await pool.query(
      "DELETE FROM tasks WHERE id=$1 AND user_id=$2 RETURNING *",
      [id, req.session.userId],
    );
    if (!result.rows[0])
      return res.status(404).json({ error: "Task not found" });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete task" });
  }
});
// Toggle task done status
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
      [id, req.session.userId],
    );

    if (!result.rows[0])
      return res.status(404).json({ error: "Task not found" });

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to toggle task" });
  }
});

//This API is responsible for bulk deleting tasks
app.delete("/api/tasks/bulk", async (req, res) => {
  const { ids } = req.body;
  if (!req.session.userId)
    return res.status(401).json({ error: "Not logged in" });
  if (!Array.isArray(ids) || !ids.length)
    return res.status(400).json({ error: "No task IDs provided" });

  try {
    const result = await pool.query(
      "DELETE FROM tasks WHERE id = ANY($1) AND user_id = $2 RETURNING *",
      [ids, req.session.userId],
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

//mark tast done
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
      [ids, timestamp, req.session.userId],
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

function generateResetPin() {
  return Math.floor(10000000 + Math.random() * 90000000).toString();
}

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

//handle email sender
async function sendResetPin(email, pin) {
  await resend.emails.send({
    from: "TM Support <onboarding@resend.dev>",

    to: email,

    subject: "Your password reset PIN",

    html: `
            <div style="font-family: Arial, sans-serif">

                <h2>Password Reset</h2>

                <p>Your password reset PIN is:</p>

                <h1>${pin}</h1>

                <p>This PIN expires in 5 minutes.</p>

            </div>
        `,
  });
}

//verify email
app.post("/forgot-password", async (req, res) => {
  console.log("FORGOT PASSWORD ROUTE HIT");
  try {
    console.log("Forgot password started");

    const { email } = req.body;

    console.log("Email received:", email);

    const userResult = await pool.query(
      `
      SELECT id, email
      FROM users
      WHERE email = $1
      `,
      [email],
    );

    console.log("User lookup complete");

    if (userResult.rows.length === 0) {
      return res.status(404).send("Email not found");
    }

    const user = userResult.rows[0];

    console.log("User found:", user.id);

    const pin = generateResetPin();

    console.log("PIN generated");

    const pinHash = await bcrypt.hash(pin, 10);

    console.log("PIN hashed");

    await pool.query(
      `
      INSERT INTO tempcodes
      (user_id, pin_hash, expires_at)
      VALUES
      ($1,$2,NOW() + INTERVAL '5 minutes')
      `,
      [user.id, pinHash],
    );

    console.log("PIN saved");

    await sendResetPin(user.email, pin);

    console.log("Email sent");

    res.send("PIN sent successfully");
  } catch (err) {
    console.error("FORGOT PASSWORD ERROR:", err);

    res.status(500).json({
      error: err.message,
      stack: err.stack,
    });
  }
});

//verify pin match
app.post("/verify-reset-pin", async (req, res) => {
  try {
    const { email, pin } = req.body;

    const userResult = await pool.query(
      `
            SELECT id
            FROM users
            WHERE email=$1
            `,
      [email],
    );

    if (userResult.rows.length === 0) {
      return res.status(404).send("User not found");
    }

    const userId = userResult.rows[0].id;

    const resetResult = await pool.query(
      `
            SELECT *
            FROM tempcodes
            WHERE user_id=$1
            AND used=false
            AND expires_at > NOW()
            ORDER BY created_at DESC
            LIMIT 1
            `,
      [userId],
    );

    if (resetResult.rows.length === 0) {
      return res.status(400).send("PIN expired");
    }

    const reset = resetResult.rows[0];

    const valid = await bcrypt.compare(pin, reset.pin_hash);

    if (!valid) {
      return res.status(400).send("Invalid PIN");
    }

    await pool.query(
      `
            UPDATE tempcodes
            SET used=true
            WHERE id=$1
            `,
      [reset.id],
    );

    req.session.passwordResetUser = userId;

    res.send("PIN verified");
  } catch (err) {
    console.error(err);

    res.status(500).send("Server error");
  }
});

//handle password reset
app.post("/reset-password", async (req, res) => {
  try {
    const userId = req.session.passwordResetUser;

    if (!userId) {
      return res.status(401).send("Reset session expired");
    }

    const { password } = req.body;

    if (!password || password.length < 6) {
      return res.status(400).send("Password too short");
    }

    const hash = await bcrypt.hash(password, 10);

    await pool.query(
      `
            UPDATE users
            SET password=$1
            WHERE id=$2
            `,
      [hash, userId],
    );

    delete req.session.passwordResetUser;

    res.send("Password updated");
  } catch (err) {
    console.error(err);

    res.status(500).send("Server error");
  }
});

app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, "public", "404.html"));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
