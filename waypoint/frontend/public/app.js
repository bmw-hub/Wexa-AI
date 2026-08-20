const API = "/api";

const CATEGORY_COLORS = {
  Foundations: "#E8A33D",
  Frontend: "#4FA3A0",
  Backend: "#C97B6D",
  Data: "#8FB39B",
  ML: "#B08BD9",
  DevOps: "#5C9CD6",
  Architecture: "#D9C25A",
};
const colorFor = (category) => CATEGORY_COLORS[category] || "#93A79A";

async function api(path) {
  const res = await fetch(`${API}${path}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `Request failed (${res.status})`);
  }
  return res.json();
}

// ---------- connection status ----------
async function checkHealth() {
  const el = document.getElementById("conn-status");
  try {
    await api("/health");
    el.textContent = "trail conditions: clear";
    el.dataset.state = "ok";
  } catch (err) {
    el.textContent = "trail conditions: database unreachable";
    el.dataset.state = "down";
  }
}

// ---------- trail map (force-directed graph) ----------
async function renderGraph() {
  const loading = document.getElementById("graph-loading");
  const empty = document.getElementById("graph-empty");
  const svgEl = document.getElementById("graph-svg");
  const legendEl = document.getElementById("legend");

  let data;
  try {
    data = await api("/graph");
  } catch (err) {
    loading.hidden = true;
    empty.hidden = false;
    empty.querySelector("p").textContent = err.message;
    return;
  }

  loading.hidden = true;
  if (!data.nodes || data.nodes.length === 0) {
    empty.hidden = false;
    empty.querySelector("p").textContent = "No skills seeded yet. Run the seed script.";
    return;
  }
  svgEl.hidden = false;

  const width = svgEl.clientWidth || 900;
  const height = 480;
  const svg = d3.select(svgEl).attr("viewBox", [0, 0, width, height]);
  const g = svg.append("g");

  svg.call(
    d3.zoom().scaleExtent([0.4, 2.5]).on("zoom", (event) => g.attr("transform", event.transform))
  );

  const nodes = data.nodes.map((d) => ({ ...d }));
  const links = data.edges.map((d) => ({ source: d.source, target: d.target }));

  const sim = d3
    .forceSimulation(nodes)
    .force("link", d3.forceLink(links).id((d) => d.id).distance(70).strength(0.5))
    .force("charge", d3.forceManyBody().strength(-160))
    .force("center", d3.forceCenter(width / 2, height / 2))
    .force("collide", d3.forceCollide(22));

  g.append("defs")
    .append("marker")
    .attr("id", "arrow")
    .attr("viewBox", "0 -4 8 8")
    .attr("refX", 16)
    .attr("refY", 0)
    .attr("markerWidth", 6)
    .attr("markerHeight", 6)
    .attr("orient", "auto")
    .append("path")
    .attr("d", "M0,-4L8,0L0,4")
    .attr("fill", "#D9CDB466");

  const link = g
    .append("g")
    .selectAll("line")
    .data(links)
    .join("line")
    .attr("stroke", "#D9CDB4")
    .attr("stroke-opacity", 0.28)
    .attr("stroke-dasharray", "3 3")
    .attr("marker-end", "url(#arrow)");

  const node = g
    .append("g")
    .selectAll("g")
    .data(nodes)
    .join("g")
    .call(
      d3
        .drag()
        .on("start", (event, d) => {
          if (!event.active) sim.alphaTarget(0.2).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on("drag", (event, d) => {
          d.fx = event.x;
          d.fy = event.y;
        })
        .on("end", (event, d) => {
          if (!event.active) sim.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        })
    );

  node
    .append("circle")
    .attr("r", 9)
    .attr("fill", (d) => colorFor(d.category))
    .attr("stroke", "#0F1B16")
    .attr("stroke-width", 1.5);

  node.append("title").text((d) => `${d.name} (${d.category})`);

  node
    .append("text")
    .text((d) => d.name)
    .attr("x", 12)
    .attr("y", 4)
    .attr("fill", "#F1EFE6")
    .attr("font-size", 10)
    .attr("font-family", "Inter, sans-serif")
    .attr("pointer-events", "none");

  sim.on("tick", () => {
    link
      .attr("x1", (d) => d.source.x)
      .attr("y1", (d) => d.source.y)
      .attr("x2", (d) => d.target.x)
      .attr("y2", (d) => d.target.y);
    node.attr("transform", (d) => `translate(${d.x},${d.y})`);
  });

  const categories = [...new Set(nodes.map((n) => n.category))].sort();
  legendEl.innerHTML = categories
    .map(
      (cat) =>
        `<li><span class="swatch" style="background:${colorFor(cat)}"></span>${cat}</li>`
    )
    .join("");
}

// ---------- selectors ----------
async function populateSelectors() {
  const [learners, skills] = await Promise.all([api("/learners"), api("/skills")]);

  const learnerSelect = document.getElementById("learner-select");
  learners.forEach((l) => {
    const opt = document.createElement("option");
    opt.value = l.id;
    opt.textContent = `${l.name} — ${l.role}`;
    learnerSelect.appendChild(opt);
  });

  const skillSelect = document.getElementById("skill-select");
  skills.forEach((s) => {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = s.name;
    skillSelect.appendChild(opt);
  });

  learnerSelect.addEventListener("change", () => {
    if (learnerSelect.value) {
      loadLearnerDetail(learnerSelect.value);
      loadRecommendations(learnerSelect.value);
      loadPeers(learnerSelect.value);
    }
  });
}

// ---------- route planner ----------
async function handleRouteSubmit(event) {
  event.preventDefault();
  const learnerId = document.getElementById("learner-select").value;
  const targetSkillId = document.getElementById("skill-select").value;
  const resultEl = document.getElementById("route-result");
  resultEl.innerHTML = `<p class="route-hint">Charting the trail&hellip;</p>`;

  try {
    const learnerKnown = await api(`/learners/${learnerId}`);
    const knownIds = new Set(learnerKnown.known.filter((k) => k.id).map((k) => k.id));

    const data = await api(`/route?learnerId=${learnerId}&targetSkillId=${targetSkillId}`);

    if (data.alreadyKnown) {
      resultEl.innerHTML = `<div class="already-there">This hiker has already reached that summit. Try a further-out destination.</div>`;
      return;
    }
    if (!data.steps || data.steps.length === 0) {
      resultEl.innerHTML = `<p class="route-hint">No route found — this skill may have no prerequisite path from what the hiker already knows.</p>`;
      return;
    }

    const items = data.steps
      .map((step, i) => {
        const known = knownIds.has(step.id);
        const courses = step.courseOptions?.length
          ? `<p class="waypoint-courses">Courses: ${step.courseOptions.join(", ")}</p>`
          : "";
        return `<li data-index="${i + 1}" class="${known ? "known" : ""}">
          <span class="waypoint-name">${step.name}</span>
          <span class="waypoint-category">${step.category}</span>
          ${known ? '<p class="waypoint-courses">Already known</p>' : courses}
        </li>`;
      })
      .join("");
    resultEl.innerHTML = `<ol class="trail">${items}</ol>`;
  } catch (err) {
    resultEl.innerHTML = `<p class="route-hint">Couldn't chart a route: ${err.message}</p>`;
  }
}

// ---------- recommendations ----------
async function loadRecommendations(learnerId) {
  const list = document.getElementById("recommend-list");
  list.innerHTML = `<li class="card-empty">Looking ahead on the trail&hellip;</li>`;
  try {
    const recs = await api(`/learners/${learnerId}/recommend`);
    if (recs.length === 0) {
      list.innerHTML = `<li class="card-empty">No new ground to break yet.</li>`;
      return;
    }
    list.innerHTML = recs
      .map(
        (r) => `<li>
          <div class="card-title">${r.name}</div>
          <div class="card-meta">${r.category} &middot; unlocks ${r.unlocks} further skill${r.unlocks === 1 ? "" : "s"}</div>
        </li>`
      )
      .join("");
  } catch (err) {
    list.innerHTML = `<li class="card-empty">${err.message}</li>`;
  }
}

// ---------- peers ----------
async function loadPeers(learnerId) {
  const list = document.getElementById("peers-list");
  list.innerHTML = `<li class="card-empty">Scouting nearby trails&hellip;</li>`;
  try {
    const peers = await api(`/learners/${learnerId}/peers`);
    if (peers.length === 0) {
      list.innerHTML = `<li class="card-empty">No overlapping trails yet.</li>`;
      return;
    }
    list.innerHTML = peers
      .map(
        (p) => `<li>
          <div class="card-title">${p.name}</div>
          <div class="card-meta">${p.role} &middot; shares ${p.overlap} skill${p.overlap === 1 ? "" : "s"}: ${p.sharedSkills.slice(0, 3).join(", ")}${p.sharedSkills.length > 3 ? "…" : ""}</div>
        </li>`
      )
      .join("");
  } catch (err) {
    list.innerHTML = `<li class="card-empty">${err.message}</li>`;
  }
}

// ---------- learner detail ----------
async function loadLearnerDetail(learnerId) {
  const el = document.getElementById("learner-detail");
  el.innerHTML = `<p class="route-hint">Loading profile&hellip;</p>`;
  try {
    const learner = await api(`/learners/${learnerId}`);
    const known = learner.known.filter((k) => k.id);
    const enrolled = learner.enrollments.filter((e) => e.id);

    const skillChips = known.length
      ? known
        .map(
          (k) =>
            `<span class="skill-chip proficiency-${k.proficiency}">${k.name} &middot; ${k.proficiency}</span>`
        )
        .join("")
      : `<span class="card-empty">No skills logged yet.</span>`;

    const enrollmentRows = enrolled.length
      ? enrolled
        .map((e) => `<li><div class="card-title">${e.title}</div><div class="card-meta">${e.status} &middot; ${e.progress}% complete</div></li>`)
        .join("")
      : `<li class="card-empty">Not enrolled in anything right now.</li>`;

    el.innerHTML = `
      <div>
        <h3 style="margin:0 0 8px;font-family:var(--font-display);font-size:16px;">${learner.name} &mdash; ${learner.role}</h3>
        <div class="skill-chip-row">${skillChips}</div>
      </div>
      <div>
        <h3 style="margin:0 0 8px;font-family:var(--font-display);font-size:16px;">In progress</h3>
        <ul class="card-list">${enrollmentRows}</ul>
      </div>
    `;
  } catch (err) {
    el.innerHTML = `<p class="route-hint">${err.message}</p>`;
  }
}

// ---------- boot ----------
async function init() {
  checkHealth();
  renderGraph();
  try {
    await populateSelectors();
  } catch (err) {
    console.error("Failed to populate selectors:", err);
  }
  document.getElementById("route-form").addEventListener("submit", handleRouteSubmit);
}

init();
