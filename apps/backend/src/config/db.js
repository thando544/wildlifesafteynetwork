import { Pool } from "pg";
import { config } from "./env";

export const pool = new Pool({
  host: config.database.host,
  port: config.database.host,
  database: config.database.name,
  user: config.database.user,
  password: config.database.password,

  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on("error", (error) => {
  console.error("Unexpected PostgreSQL pool error:", error.message);
});

export async function checkDatabaseConnection() {
  const result = await pool.query("SELECT NOW() AS database_time");
  return result.rows[0];
}
