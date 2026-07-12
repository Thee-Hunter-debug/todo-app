require("dotenv").config();

const { Pool } = require("pg");

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
  } finally {
    await pool.end();
  }
})();