const express = require("express");
const { runQuery } = require("../db");
const { recordsToRows } = require("../serialize");

const router = express.Router();

// GET /api/learners - roster, for the learner picker.
router.get("/learners", async (req, res, next) => {
  try {
    const records = await runQuery(
      `MATCH (l:Learner)
       OPTIONAL MATCH (l)-[:KNOWS]->(s:Skill)
       RETURN l.id AS id, l.name AS name, l.role AS role, count(s) AS skillCount
       ORDER BY l.name`
    );
    res.json(recordsToRows(records));
  } catch (err) {
    next(err);
  }
});

// GET /api/learners/:id - profile with known skills and in-progress courses.
router.get("/learners/:id", async (req, res, next) => {
  try {
    const records = await runQuery(
      `MATCH (l:Learner {id: $id})
       OPTIONAL MATCH (l)-[k:KNOWS]->(s:Skill)
       WITH l, collect(DISTINCT {id: s.id, name: s.name, category: s.category,
                                  proficiency: k.proficiency}) AS known
       OPTIONAL MATCH (l)-[e:ENROLLED_IN]->(c:Course)
       WITH l, known, collect(DISTINCT {id: c.id, title: c.title, status: e.status,
                                         progress: e.progress}) AS enrollments
       RETURN l.id AS id, l.name AS name, l.role AS role, known, enrollments`,
      { id: req.params.id }
    );
    const rows = recordsToRows(records);
    if (rows.length === 0) return res.status(404).json({ message: "Learner not found" });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// GET /api/learners/:id/recommend - "what should I learn next?"
//
// A skill is recommended when every one of its direct prerequisites is
// already known by the learner, but the skill itself is not. Candidates are
// ranked by how many *downstream* skills they unlock (a variable-length
// count of everything reachable via PREREQUISITE_OF), so the learner sees
// the highest-leverage next step first. Doing this in SQL means a recursive
// CTE for the downstream count, re-run per candidate skill; in Cypher it is
// one pattern match.
router.get("/learners/:id/recommend", async (req, res, next) => {
  try {
    const records = await runQuery(
      `MATCH (l:Learner {id: $id})-[:KNOWS]->(known:Skill)
       WITH l, collect(known.id) AS knownIds
       MATCH (candidate:Skill)
       WHERE NOT candidate.id IN knownIds
         AND ALL(
           prereqId IN [(p:Skill)-[:PREREQUISITE_OF]->(candidate) | p.id]
           WHERE prereqId IN knownIds
         )
       OPTIONAL MATCH (candidate)-[:PREREQUISITE_OF*1..4]->(unlocked:Skill)
       WITH candidate, knownIds, count(DISTINCT unlocked) AS unlocks
       RETURN candidate.id AS id, candidate.name AS name, candidate.category AS category,
              unlocks
       ORDER BY unlocks DESC, candidate.name
       LIMIT 6`,
      { id: req.params.id }
    );
    res.json(recordsToRows(records));
  } catch (err) {
    next(err);
  }
});

// GET /api/learners/:id/peers - other learners who share the most skills,
// via a 2-hop Learner-KNOWS->Skill<-KNOWS-Learner pattern with an
// intersection count. Awkward in SQL (a self-join on a bridge table plus a
// GROUP BY/HAVING for the overlap count); a natural traversal in Cypher.
router.get("/learners/:id/peers", async (req, res, next) => {
  try {
    const records = await runQuery(
      `MATCH (me:Learner {id: $id})-[:KNOWS]->(s:Skill)<-[:KNOWS]-(peer:Learner)
       WHERE peer.id <> $id
       WITH peer, collect(DISTINCT s.name) AS sharedSkills
       RETURN peer.id AS id, peer.name AS name, peer.role AS role,
              sharedSkills, size(sharedSkills) AS overlap
       ORDER BY overlap DESC, peer.name
       LIMIT 5`,
      { id: req.params.id }
    );
    res.json(recordsToRows(records));
  } catch (err) {
    next(err);
  }
});

// GET /api/route?learnerId=X&targetSkillId=Y - the core "plan my route"
// query. Finds the shortest prerequisite path from the target skill back to
// something the learner already knows (or a skill with no prerequisites),
// then attaches the best course for each skill gap along the way. This is
// the multi-hop traversal + shortest-path requirement: a variable-length,
// multi-hop pattern a relational join tree cannot express without knowing
// the path depth in advance.
router.get("/route", async (req, res, next) => {
  const { learnerId, targetSkillId } = req.query;
  if (!learnerId || !targetSkillId) {
    return res.status(400).json({ message: "learnerId and targetSkillId are required" });
  }
  try {
    const alreadyKnown = await runQuery(
      `MATCH (l:Learner {id: $learnerId})-[:KNOWS]->(s:Skill {id: $targetSkillId})
       RETURN s.id AS id`,
      { learnerId, targetSkillId }
    );
    if (alreadyKnown.length > 0) {
      return res.json({ alreadyKnown: true, steps: [] });
    }

    const records = await runQuery(
      `MATCH (l:Learner {id: $learnerId})
       MATCH (target:Skill {id: $targetSkillId})
       OPTIONAL MATCH (l)-[:KNOWS]->(known:Skill)
       WITH l, target, collect(known.id) AS knownIds
       MATCH path = (start:Skill)-[:PREREQUISITE_OF*0..6]->(target)
       WHERE (start.id IN knownIds OR NOT (()-[:PREREQUISITE_OF]->(start)))
       WITH path, length(path) AS len
       ORDER BY len ASC
       LIMIT 1
       UNWIND nodes(path) AS step
       OPTIONAL MATCH (step)<-[:TEACHES]-(course:Course)
       WITH step, collect(DISTINCT course.title)[0..2] AS courseOptions
       RETURN step.id AS id, step.name AS name, step.category AS category, courseOptions`,
      { learnerId, targetSkillId }
    );
    res.json({ alreadyKnown: false, steps: recordsToRows(records) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
