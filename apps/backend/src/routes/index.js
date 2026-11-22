import express from "express";
import authRoutes from "../modules/auth/auth.routes.js";

const apiRouter = express.Router();

apiRouter.get("/", (_req, res) => {
  res.json({ data: { name: "Wildlife Safety Network API", version: "v1" } });
});

apiRouter.get("/health", (_req, res) => {
  res.status(200).json({ data: { status: "ok" } });
});

// Authentication routes remain intentionally empty until authentication is implemented.
apiRouter.use("/auth", authRoutes);

export default function registerRoutes(app) {
  app.use("/api/v1", apiRouter);
}
