const express = require("express");
const { isConnected, runQuery } = require("../db");

const router = express.Router();

router.get("/health", async (req, res) => {
  if (!isConnected()) {
    return res.status(503).json({
      status: "unavailable",
      message: "Not connected to CognoDB. Check COGNODB_URI / credentials.",
    });
  }
  try {
    await runQuery("RETURN 1 AS ok");
    res.json({ status: "ok" });
  } catch (err) {
    res.status(503).json({ status: "unavailable", message: err.message });
  }
});

module.exports = router;
