export default function requestLogger({ enabled = true } = {}) {
  return (req, res, next) => {
    if (!enabled) return next();

    const startedAt = Date.now();
    res.once("finish", () => {
      const durationMs = Date.now() - startedAt;
      console.info(`${req.method} ${req.path} ${res.statusCode} ${durationMs}ms`);
    });
    next();
  };
}
