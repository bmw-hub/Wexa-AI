const neo4j = require("neo4j-driver");
require("dotenv").config();

const { COGNODB_URI, COGNODB_USER, COGNODB_PASSWORD } = process.env;

if (!COGNODB_URI || !COGNODB_USER || !COGNODB_PASSWORD) {
  // Fail loudly at boot rather than on the first request - easier to diagnose.
  console.error(
    "[db] Missing CognoDB connection details. Set COGNODB_URI, COGNODB_USER and " +
      "COGNODB_PASSWORD (see backend/.env.example)."
  );
}

const driver = neo4j.driver(
  COGNODB_URI,
  neo4j.auth.basic(COGNODB_USER, COGNODB_PASSWORD),
  { maxConnectionPoolSize: 20 }
);

let verified = false;

// Verifies connectivity once at boot and logs a clear message either way.
// Does not throw - the app should still start and report a friendly error
// per-request if the database is unreachable (see errors.js / server.js).
async function verifyConnection() {
  try {
    await driver.verifyConnectivity();
    verified = true;
    console.log("[db] Connected to CognoDB.");
  } catch (err) {
    verified = false;
    console.error("[db] Could not connect to CognoDB:", err.message);
  }
}

function isConnected() {
  return verified;
}

// Runs a Cypher statement in a managed session and always closes the session,
// even on error. All queries in this app use parameters - never string
// concatenation - to avoid Cypher injection.
async function runQuery(cypher, params = {}) {
  const session = driver.session();
  try {
    const result = await session.run(cypher, params);
    return result.records;
  } finally {
    await session.close();
  }
}

async function runWrite(cypher, params = {}) {
  const session = driver.session();
  try {
    const result = await session.executeWrite((tx) => tx.run(cypher, params));
    return result.records;
  } finally {
    await session.close();
  }
}

module.exports = { driver, runQuery, runWrite, verifyConnection, isConnected };
