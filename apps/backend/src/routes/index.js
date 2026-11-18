import authRoutes from "../modules/auth/auth.routes.js";

export default function registerRoutes(app) {
    app.use("/api/auth", authRoutes);
}
