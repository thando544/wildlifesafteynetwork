import dotenv from "dotenv";

dotenv.config();

const errors = [];

// Application configuration
const rawPort = process.env.PORT;

if (!rawPort) {
  errors.push(
    "PORT is required (set it in the environment or apps/backend/.env)",
  );
}

const port = Number(rawPort);

if (rawPort && (!Number.isInteger(port) || port < 1 || port > 65535)) {
errors.push("PORT must be an integer between 1 and 65535");
}
const nodeEnv = process.env.NODE_ENV || "development";

if (!["development", "test", "production"].includes(nodeEnv)) {
  errors.push("NODE_ENV must be development, test, or production");
}

const host = process.env.HOST || "0.0.0.0";
const rawDbPort = process.env.DB_PORT || "5432";
const dbPort = Number(rawDbPort);

if (!Number.isInteger(dbPort) || dbPort < 1 || dbPort > 65535) {
  errors.push("DB_PORT must be an integer between 1 and 65535");
}

const dbHost = process.env.DB_HOST;
const dbName = process.env.DB_NAME;
const dbUser = process.env.DB_USER;
const dbPassword = process.env.DB_PASSWORD;

if (!dbHost) errors.push("DB_HOST is required");
if (!dbName) errors.push("DB_NAME is required");
if (!dbUser) errors.push("DB_USER is required");
if (!dbPassword) errors.push("DB_PASSWORD is required");

if (errors.length > 0) {
  throw new Error(`Invalid backend configuration:\n- ${errors.join("\n- ")}`);
}

export const config = Object.freeze({
  port,
  host,
  nodeEnv,

  database: Object.freeze({
    host: dbHost,
    port: dbPort,
    name: dbName,
    user: dbUser,
    password: dbPassword,
  }),
});
