const express = require("express");
const { runQuery } = require("../db");
const { recordsToRows } = require("../serialize");

const router = express.Router();

// GET /api/skills - flat list of every skill, for dropdowns etc.
router.get("/skills", async (req, res, next) => {
  try {
    const records = await runQuery(
      `MATCH (s:Skill)
       RETURN s.id AS id, s.name AS name, s.category AS category
       ORDER BY s.category, s.name`
    );
    res.json(recordsToRows(records));
  } catch (err) {
    next(err);
  }
});

// GET /api/graph - the full skill graph (nodes + PREREQUISITE_OF edges), used
// to render the trail map visualization on the frontend.
router.get("/graph", async (req, res, next) => {
  try {
    const nodeRecords = await runQuery(
      `MATCH (s:Skill)
       RETURN s.id AS id, s.name AS name, s.category AS category`
    );
    const edgeRecords = await runQuery(
      `MATCH (a:Skill)-[:PREREQUISITE_OF]->(b:Skill)
       RETURN a.id AS source, b.id AS target`
    );
    res.json({
      nodes: recordsToRows(nodeRecords),
      edges: recordsToRows(edgeRecords),
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/skills/:id/prerequisites - the full upstream prerequisite tree for
// a skill, using a variable-length traversal. This is the kind of query a
// relational schema handles only with a recursive CTE; here it's one line.
router.get("/skills/:id/prerequisites", async (req, res, next) => {
  try {
    const records = await runQuery(
      `MATCH path = (root:Skill {id: $id})<-[:PREREQUISITE_OF*1..6]-(ancestor:Skill)
       RETURN ancestor.id AS id, ancestor.name AS name, ancestor.category AS category,
              length(path) AS depth
       ORDER BY depth, ancestor.name`,
      { id: req.params.id }
    );
    res.json(recordsToRows(records));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
