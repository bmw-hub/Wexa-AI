const express = require("express");
const { runQuery } = require("../db");
const { recordsToRows } = require("../serialize");

const router = express.Router();

// GET /api/courses - every course with the skills it teaches and requires.
router.get("/courses", async (req, res, next) => {
  try {
    const records = await runQuery(
      `MATCH (c:Course)
       OPTIONAL MATCH (c)-[:TEACHES]->(taught:Skill)
       OPTIONAL MATCH (c)-[:REQUIRES]->(required:Skill)
       WITH c, collect(DISTINCT taught.name) AS teaches, collect(DISTINCT required.name) AS requires
       RETURN c.id AS id, c.title AS title, c.provider AS provider,
              c.level AS level, c.durationHours AS durationHours,
              teaches, requires
       ORDER BY c.title`
    );
    res.json(recordsToRows(records));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
