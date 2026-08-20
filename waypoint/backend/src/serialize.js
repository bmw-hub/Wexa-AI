const neo4j = require("neo4j-driver");

// The Neo4j/CognoDB driver returns rich JS objects (Integer, Node, Relationship,
// Path) that don't serialize cleanly to JSON. This walks any value returned
// from a query and converts it into plain objects/numbers/strings so routes
// can just `res.json(...)` the result.
function toPlain(value) {
  if (value === null || value === undefined) return value;

  if (neo4j.isInt(value)) {
    return value.toNumber();
  }

  if (Array.isArray(value)) {
    return value.map(toPlain);
  }

  if (isNode(value)) {
    return {
      id: value.elementId ?? value.identity?.toString(),
      labels: value.labels,
      ...toPlain(value.properties),
    };
  }

  if (isRelationship(value)) {
    return {
      id: value.elementId ?? value.identity?.toString(),
      type: value.type,
      startNodeId: value.startNodeElementId ?? value.start?.toString(),
      endNodeId: value.endNodeElementId ?? value.end?.toString(),
      ...toPlain(value.properties),
    };
  }

  if (isPath(value)) {
    return {
      segments: value.segments.map((seg) => ({
        start: toPlain(seg.start),
        relationship: toPlain(seg.relationship),
        end: toPlain(seg.end),
      })),
      length: value.length,
    };
  }

  if (typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = toPlain(v);
    }
    return out;
  }

  return value;
}

function isNode(v) {
  return v && typeof v === "object" && Array.isArray(v.labels) && v.properties;
}
function isRelationship(v) {
  return v && typeof v === "object" && typeof v.type === "string" && v.properties;
}
function isPath(v) {
  return v && typeof v === "object" && Array.isArray(v.segments);
}

// Converts a full driver result (array of Records) into an array of plain
// row objects keyed by the query's RETURN aliases.
function recordsToRows(records) {
  return records.map((record) => {
    const row = {};
    for (const key of record.keys) {
      row[key] = toPlain(record.get(key));
    }
    return row;
  });
}

module.exports = { toPlain, recordsToRows };
