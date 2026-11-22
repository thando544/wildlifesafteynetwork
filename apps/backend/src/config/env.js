import dotenv from "dotenv";

dotenv.config();

const errors = [];
const rawPort = process.env.PORT;

if (!rawPort) {
  errors.push("PORT is required (set it in the environment or apps/backend/.env)");
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

if (errors.length > 0) {
  throw new Error(`Invalid backend configuration:\n- ${errors.join("\n- ")}`);
}

export const config = Object.freeze({ port, host, nodeEnv });
