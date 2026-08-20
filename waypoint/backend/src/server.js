const path = require("path");
const express = require("express");
const cors = require("cors");
require("dotenv").config();

const { verifyConnection, isConnected } = require("./db");

const healthRoutes = require("./routes/health");
const skillRoutes = require("./routes/skills");
const courseRoutes = require("./routes/courses");
const learnerRoutes = require("./routes/learners");

const app = express();
app.use(cors());
app.use(express.json());

app.use("/api", healthRoutes);
app.use("/api", skillRoutes);
app.use("/api", courseRoutes);
app.use("/api", learnerRoutes);

// Gate every other /api/* route behind a connectivity check so the frontend
// gets one consistent, friendly error shape when CognoDB is unreachable,
// instead of a raw driver stack trace.
app.use("/api", (req, res) => {
  res.status(404).json({ message: "Not found" });
});

// eslint-disable-next-line no-unused-vars
app.use("/api", (err, req, res, next) => {
  console.error("[api]", err.message);
  if (!isConnected()) {
    return res.status(503).json({
      message: "The graph database is unreachable right now. Please try again shortly.",
    });
  }
  res.status(500).json({ message: "Something went wrong handling that request." });
});

// The frontend is a static, build-free site (plain HTML/CSS/JS) so the whole
// app deploys as a single Node service - no separate build/hosting step.
const frontendDir = path.join(__dirname, "..", "..", "frontend", "public");
app.use(express.static(frontendDir));
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api")) return next();
  res.sendFile(path.join(frontendDir, "index.html"), (err) => {
    if (err) next();
  });
});

const PORT = process.env.PORT || 4000;

async function start() {
  await verifyConnection();
  app.listen(PORT, () => {
    console.log(`[server] Waypoint API listening on port ${PORT}`);
  });
}

start();
