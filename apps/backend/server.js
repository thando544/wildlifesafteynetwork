import app from "./src/app.js";
import { config } from "./src/config/env.js";

const server = app.listen(config.port, config.host, () => {
  console.info(`WSN backend listening on ${config.host}:${config.port} (${config.nodeEnv})`);
});

function shutdown(signal) {
  console.info(`Received ${signal}; closing HTTP server`);
  server.close((error) => {
    if (error) {
      console.error("Failed to close HTTP server cleanly", error);
      process.exitCode = 1;
      return;
    }
    process.exit(0);
  });
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
