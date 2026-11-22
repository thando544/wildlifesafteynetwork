import express from "express";
import registerRoutes from "./routes/index.js";
import { config } from "./config/env.js";
import { errorHandler } from "./middleware/error-handler.js";
import notFoundHandler from "./middleware/not-found.js";
import requestLogger from "./middleware/request-logger.js";
import registerRouter from "router/index.js"
const app = express();

app.disable("x-powered-by");
app.use(requestLogger({ enabled: config.nodeEnv !== "test" }));
app.use(express.json({ limit: "1mb" }));

registerRoutes(app);

app.use(notFoundHandler);
app.use(errorHandler);
app.use(registerRouter)
export default app;
