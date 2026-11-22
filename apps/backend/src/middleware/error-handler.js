export function errorHandler(error, _req, res, _next) {
  const status = error.status || error.statusCode || 500;
  const isClientError = status >= 400 && status < 500;
  const code = error.type === "entity.parse.failed"
    ? "INVALID_JSON"
    : isClientError
      ? "BAD_REQUEST"
      : "INTERNAL_SERVER_ERROR";
  const message = code === "INVALID_JSON"
    ? "Request body contains invalid JSON"
    : code === "INTERNAL_SERVER_ERROR"
      ? "An unexpected error occurred"
      : error.message || "The request could not be processed";

  if (status >= 500) {
    console.error("Request failed with an internal error", error);
  }

  res.status(isClientError ? status : 500).json({ error: { code, message } });
}
