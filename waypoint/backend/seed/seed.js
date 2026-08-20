// Loads the sample dataset into CognoDB. Safe to re-run: every write uses
// MERGE, and the script wipes prior Waypoint data first so re-seeding never
// duplicates nodes.
//
// Usage:
//   cd backend
//   npm install
//   cp .env.example .env   # then fill in your CognoDB credentials
//   npm run seed

const { driver, runWrite, verifyConnection } = require("../src/db");
const { skills, prerequisites, courses, learners, knows, enrollments } = require("./data");

async function wipe() {
  console.log("Clearing any existing Waypoint data...");
  await runWrite(`MATCH (n) WHERE n:Skill OR n:Course OR n:Learner DETACH DELETE n`);
}

async function loadSkills() {
  console.log(`Loading ${skills.length} skills...`);
  await runWrite(
    `UNWIND $skills AS row
     MERGE (s:Skill {id: row.id})
     SET s.name = row.name, s.category = row.category`,
    { skills }
  );
}

async function loadPrerequisites() {
  console.log(`Loading ${prerequisites.length} prerequisite relationships...`);
  const rows = prerequisites.map(([source, target]) => ({ source, target }));
  await runWrite(
    `UNWIND $rows AS row
     MATCH (a:Skill {id: row.source}), (b:Skill {id: row.target})
     MERGE (a)-[:PREREQUISITE_OF]->(b)`,
    { rows }
  );
}

async function loadCourses() {
  console.log(`Loading ${courses.length} courses...`);
  await runWrite(
    `UNWIND $courses AS row
     MERGE (c:Course {id: row.id})
     SET c.title = row.title, c.provider = row.provider,
         c.level = row.level, c.durationHours = row.durationHours`,
    { courses }
  );
  const teachesRows = [];
  const requiresRows = [];
  for (const c of courses) {
    for (const skillId of c.teaches) teachesRows.push({ courseId: c.id, skillId });
    for (const skillId of c.requires) requiresRows.push({ courseId: c.id, skillId });
  }
  await runWrite(
    `UNWIND $rows AS row
     MATCH (c:Course {id: row.courseId}), (s:Skill {id: row.skillId})
     MERGE (c)-[:TEACHES]->(s)`,
    { rows: teachesRows }
  );
  await runWrite(
    `UNWIND $rows AS row
     MATCH (c:Course {id: row.courseId}), (s:Skill {id: row.skillId})
     MERGE (c)-[:REQUIRES]->(s)`,
    { rows: requiresRows }
  );
}

async function loadLearners() {
  console.log(`Loading ${learners.length} learners...`);
  await runWrite(
    `UNWIND $learners AS row
     MERGE (l:Learner {id: row.id})
     SET l.name = row.name, l.role = row.role`,
    { learners }
  );

  const knowsRows = [];
  for (const [learnerId, entries] of Object.entries(knows)) {
    for (const [skillId, proficiency] of entries) {
      knowsRows.push({ learnerId, skillId, proficiency });
    }
  }
  await runWrite(
    `UNWIND $rows AS row
     MATCH (l:Learner {id: row.learnerId}), (s:Skill {id: row.skillId})
     MERGE (l)-[k:KNOWS]->(s)
     SET k.proficiency = row.proficiency`,
    { rows: knowsRows }
  );

  const enrollRows = [];
  for (const [learnerId, entries] of Object.entries(enrollments)) {
    for (const [courseId, status, progress] of entries) {
      enrollRows.push({ learnerId, courseId, status, progress });
    }
  }
  await runWrite(
    `UNWIND $rows AS row
     MATCH (l:Learner {id: row.learnerId}), (c:Course {id: row.courseId})
     MERGE (l)-[e:ENROLLED_IN]->(c)
     SET e.status = row.status, e.progress = row.progress`,
    { rows: enrollRows }
  );
}

async function main() {
  await verifyConnection();
  await wipe();
  await loadSkills();
  await loadPrerequisites();
  await loadCourses();
  await loadLearners();
  console.log("Seed complete.");
  await driver.close();
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
