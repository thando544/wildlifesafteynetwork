import express from "express";
import authRoutes from "../modules/auth/auth.routes.js";
import { checkDatabaseConnection } from "../config/db.js";
const apiRouter = express.Router();

apiRouter.get("/", (_req, res) => {
  res.status(200).json({
    data: {
      name: "Wildlife Safety Network API",
      version: "v1",
      status: "available",
      endpoints: {
        health: "/api/v1/health",
      },
    },
  });
});

apiRouter.get("/health", async (_req, res) => {
  try {
    const database = await checkDatabaseConnection();

    res.status(200).json({
      data: {
        status: "ok",
        database: {
          status: "connected",
          time: database.database_time,
        },
      },
    });
  } catch (error) {
    console.error("Health check failed:", error.message);

    res.status(503).json({
      data: {
        status: "unavailable",
        database: {
          status: "disconnected",
        },
      },
    });
  }
});

apiRouter.use("/auth", authRoutes);

export default function registerRoutes(app) {
  app.use("/api/v1", apiRouter);
}
