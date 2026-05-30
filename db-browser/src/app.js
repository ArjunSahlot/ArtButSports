const metricLabels = {
  warmth: "Warmth",
  brightness: "Brightness",
  contrast: "Contrast",
  saliencySpread: "Spread",
  centerFocus: "Center",
  paletteComplexity: "Palette",
  verticality: "Vertical",
  poseDensity: "Pose",
  xBias: "X bias",
  yBias: "Y bias",
};

const sortLabels = {
  relevance: "Relevance",
  title: "Title",
  yearAsc: "Oldest",
  yearDesc: "Newest",
  warmth: "Warmest",
  contrast: "Highest contrast",
  centerFocus: "Most centered",
  saliencySpread: "Most distributed",
  paletteComplexity: "Most complex palette",
  verticality: "Most vertical",
  poseDensity: "Most pose signal",
};

const facetFields = ["department", "type", "culture", "collection"];
const metricFilters = ["warmth", "contrast", "centerFocus", "paletteComplexity", "poseDensity"];
const state = {
  query: "",
  sort: "relevance",
  view: "grid",
  facets: {},
  poseOnly: false,
  imageOnly: true,
  yearSpan: null,
  metricFloor: {},
  selectedId: null,
};

let db = null;
let prepared = [];

const app = document.querySelector("#app");

const icon = {
  search: svg("M21 21l-4.3-4.3M10.8 18a7.2 7.2 0 1 1 0-14.4 7.2 7.2 0 0 1 0 14.4z"),
  grid: svg("M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z"),
  table: svg("M3 5h18M3 12h18M3 19h18M8 5v14M16 5v14"),
  filter: svg("M4 5h16M7 12h10M10 19h4"),
  sliders: svg("M4 7h7M15 7h5M4 17h5M13 17h7M11 4v6M9 14v6"),
  sort: svg("M7 4v16M7 20l-3-3M7 20l3-3M17 4v16M17 4l-3 3M17 4l3 3"),
  external: svg("M14 3h7v7M10 14L21 3M21 14v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h6"),
  close: svg("M6 6l12 12M18 6L6 18"),
};

fetch("/public/data/index.json")
  .then((response) => {
    if (!response.ok) throw new Error("Run ../.venv/bin/python scripts/build_index.py first.");
    return response.json();
  })
  .then((payload) => {
    db = payload;
    const [start, end] = db.yearRange;
    state.yearSpan = start !== null && end !== null ? [start, end] : null;
    state.selectedId = db.records[0]?.id ?? null;
    render();
  })
  .catch((error) => {
    app.innerHTML = `<section class="loading"><div class="mark">!</div><h1>Index missing</h1><p>${escapeHtml(error.message)}</p></section>`;
  });

function svg(path) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}" /></svg>`;
}

function render() {
  prepared = filterAndSort();
  const selected = db.records.find((record) => record.id === state.selectedId) ?? prepared[0] ?? null;
  if (selected) state.selectedId = selected.id;
  app.className = "app";
  app.innerHTML = `${sidebar()}${workspace()}${inspector(selected)}`;
  bindEvents();
}

function filterAndSort() {
  const terms = state.query.toLowerCase().split(/\s+/).filter(Boolean);
  const rows = db.records
    .map((record) => {
      const haystack = [
        record.id,
        record.accession,
        record.title,
        record.creators,
        record.culture,
        record.department,
        record.collection,
        record.type,
        record.technique,
        record.date,
      ]
        .join(" ")
        .toLowerCase();
      const score = terms.reduce((total, term) => total + (haystack.includes(term) ? 1 : -3), 0);
      return { record, score };
    })
    .filter(({ record, score }) => {
      if (terms.length && score < terms.length) return false;
      if (state.poseOnly && !record.hasPose) return false;
      if (state.imageOnly && !record.image) return false;
      if (state.yearSpan && record.year !== null && (record.year < state.yearSpan[0] || record.year > state.yearSpan[1])) return false;
      for (const field of facetFields) {
        if (state.facets[field] && (record[field] || "Unknown") !== state.facets[field]) return false;
      }
      for (const [key, floor] of Object.entries(state.metricFloor)) {
        if (Number(floor) > 0 && record.metrics[key] < Number(floor)) return false;
      }
      return true;
    });

  rows.sort((a, b) => {
    if (state.sort === "relevance") return b.score - a.score || a.record.title.localeCompare(b.record.title);
    if (state.sort === "title") return a.record.title.localeCompare(b.record.title);
    if (state.sort === "yearAsc") return (a.record.year ?? 99999) - (b.record.year ?? 99999);
    if (state.sort === "yearDesc") return (b.record.year ?? -99999) - (a.record.year ?? -99999);
    return b.record.metrics[state.sort] - a.record.metrics[state.sort];
  });
  return rows.map(({ record }) => record);
}

function sidebar() {
  const yearRange = db.yearRange[0] !== null && db.yearRange[1] !== null ? db.yearRange : null;
  return `
    <aside class="sidebar">
      <div class="brand">
        <div class="mark">AB</div>
        <div><h1>DB Browser</h1><p>${db.generatedFrom.records.toLocaleString()} feature records</p></div>
      </div>
      <label class="searchBox">
        ${icon.search}
        <input id="search" value="${escapeAttr(state.query)}" placeholder="Search title, creator, culture, id..." />
        ${state.query ? `<button id="clearSearch" aria-label="Clear search">${icon.close}</button>` : ""}
      </label>
      <section class="panel">
        <h2>${icon.filter} Classification</h2>
        ${facetFields.map(facetSelect).join("")}
      </section>
      <section class="panel">
        <h2>${icon.sliders} Signals</h2>
        <label class="check"><input id="imageOnly" type="checkbox" ${state.imageOnly ? "checked" : ""} /> With image URL</label>
        <label class="check"><input id="poseOnly" type="checkbox" ${state.poseOnly ? "checked" : ""} /> Pose detected</label>
        ${metricFilters.map(metricRange).join("")}
      </section>
      ${
        yearRange && state.yearSpan
          ? `<section class="panel">
              <h2>${icon.sort} Date Window</h2>
              ${yearRangeControl("from", yearRange[0], yearRange[1], state.yearSpan[0])}
              ${yearRangeControl("to", yearRange[0], yearRange[1], state.yearSpan[1])}
            </section>`
          : ""
      }
    </aside>`;
}

function workspace() {
  const visible = prepared.slice(0, 600);
  return `
    <section class="workspace">
      <header class="toolbar">
        <div><p class="kicker">Showing ${visible.length.toLocaleString()} of ${prepared.length.toLocaleString()} matches</p><h2>Flythrough</h2></div>
        <div class="controls">
          <label class="sort">${icon.sort}<select id="sort">${Object.entries(sortLabels).map(([key, label]) => `<option value="${key}" ${state.sort === key ? "selected" : ""}>${label}</option>`).join("")}</select></label>
          <button class="${state.view === "grid" ? "active" : ""}" data-view="grid" aria-label="Grid view">${icon.grid}</button>
          <button class="${state.view === "table" ? "active" : ""}" data-view="table" aria-label="Table view">${icon.table}</button>
        </div>
      </header>
      ${state.view === "grid" ? `<div class="grid">${visible.map(card).join("")}</div>` : table(visible)}
    </section>`;
}

function inspector(record) {
  if (!record) return `<aside class="inspector empty"><div class="mark">DB</div><p>Select a record</p></aside>`;
  return `
    <aside class="inspector">
      <div class="hero">${record.image ? `<img src="${escapeAttr(record.image)}" />` : `<span>No image</span>`}</div>
      <div class="inspectBody">
        <p class="kicker">${escapeHtml(record.accession)} · ${escapeHtml(record.id)}</p>
        <h2>${escapeHtml(record.title)}</h2>
        <p>${escapeHtml(record.creators || "Unknown creator")}</p>
        <dl>
          <dt>Department</dt><dd>${escapeHtml(record.department || "Unknown")}</dd>
          <dt>Type</dt><dd>${escapeHtml(record.type || "Unknown")}</dd>
          <dt>Culture</dt><dd>${escapeHtml(record.culture || "Unknown")}</dd>
          <dt>Technique</dt><dd>${escapeHtml(record.technique || "Unknown")}</dd>
          <dt>Date</dt><dd>${escapeHtml(record.date || record.year || "Unknown")}</dd>
        </dl>
        <div class="metrics">${Object.keys(metricLabels).map((key) => metricMeter(key, record.metrics[key])).join("")}</div>
        ${record.url ? `<a class="external" href="${escapeAttr(record.url)}" target="_blank" rel="noreferrer">Open CMA record ${icon.external}</a>` : ""}
      </div>
    </aside>`;
}

function facetSelect(field) {
  const options = db.facets[field] ?? [];
  return `<label class="selectRow"><span>${field}</span><select data-facet="${field}">
    <option value="">All</option>
    ${options.map((facet) => `<option value="${escapeAttr(facet.value)}" ${state.facets[field] === facet.value ? "selected" : ""}>${escapeHtml(facet.value)} (${facet.count})</option>`).join("")}
  </select></label>`;
}

function metricRange(key) {
  const value = state.metricFloor[key] ?? 0;
  return `<label class="range"><span>${metricLabels[key]}</span><input data-metric="${key}" type="range" min="0" max="0.95" step="0.05" value="${value}" /><b>${Math.round(value * 100)}</b></label>`;
}

function yearRangeControl(id, min, max, value) {
  return `<label class="range"><span>${id === "from" ? "From" : "To"}</span><input id="year-${id}" type="range" min="${min}" max="${max}" step="10" value="${value}" /><b>${value}</b></label>`;
}

function card(record) {
  return `
    <button class="card ${state.selectedId === record.id ? "selected" : ""}" data-id="${escapeAttr(record.id)}">
      <div class="thumb">${record.image ? `<img src="${escapeAttr(record.image)}" loading="lazy" />` : `<span>No image</span>`}</div>
      <div class="cardBody">
        <strong>${escapeHtml(record.title)}</strong>
        <span>${escapeHtml(record.creators || "Unknown creator")}</span>
        <small>${escapeHtml(record.type || "Unknown type")} · ${escapeHtml(record.date || record.year || "undated")}</small>
      </div>
      ${metricStrip(record.metrics)}
    </button>`;
}

function table(records) {
  return `<div class="tableWrap"><table>
    <thead><tr><th>Title</th><th>Class</th><th>Creator</th><th>Year</th><th>Warm</th><th>Contrast</th><th>Pose</th></tr></thead>
    <tbody>${records.map((record) => `
      <tr class="${state.selectedId === record.id ? "selectedRow" : ""}" data-id="${escapeAttr(record.id)}">
        <td><b>${escapeHtml(record.title)}</b><span>${escapeHtml(record.accession)}</span></td>
        <td>${escapeHtml(record.department || "Unknown")}<span>${escapeHtml(record.type || "Unknown")}</span></td>
        <td>${escapeHtml(record.creators || "Unknown")}</td>
        <td>${record.year ?? ""}</td>
        <td>${Math.round(record.metrics.warmth * 100)}</td>
        <td>${Math.round(record.metrics.contrast * 100)}</td>
        <td>${record.hasPose ? Math.round(record.metrics.poseDensity * 100) : "No"}</td>
      </tr>`).join("")}</tbody>
  </table></div>`;
}

function metricStrip(metrics) {
  return `<div class="metricStrip">${["warmth", "contrast", "centerFocus", "paletteComplexity"]
    .map((key) => `<i style="height:${20 + metrics[key] * 60}%" title="${metricLabels[key]} ${Math.round(metrics[key] * 100)}"></i>`)
    .join("")}</div>`;
}

function metricMeter(key, value) {
  const normalized = Math.max(0, Math.min(1, Number(value)));
  return `<label><span>${metricLabels[key]}</span><meter min="0" max="1" value="${normalized}"></meter><b>${Math.round(Number(value) * 100)}</b></label>`;
}

function bindEvents() {
  document.querySelector("#search")?.addEventListener("input", (event) => {
    state.query = event.target.value;
    render();
  });
  document.querySelector("#clearSearch")?.addEventListener("click", () => {
    state.query = "";
    render();
  });
  document.querySelector("#sort")?.addEventListener("change", (event) => {
    state.sort = event.target.value;
    render();
  });
  document.querySelector("#imageOnly")?.addEventListener("change", (event) => {
    state.imageOnly = event.target.checked;
    render();
  });
  document.querySelector("#poseOnly")?.addEventListener("change", (event) => {
    state.poseOnly = event.target.checked;
    render();
  });
  document.querySelector("#year-from")?.addEventListener("input", (event) => {
    state.yearSpan[0] = Number(event.target.value);
    render();
  });
  document.querySelector("#year-to")?.addEventListener("input", (event) => {
    state.yearSpan[1] = Number(event.target.value);
    render();
  });
  document.querySelectorAll("[data-facet]").forEach((node) => {
    node.addEventListener("change", (event) => {
      state.facets[event.target.dataset.facet] = event.target.value;
      render();
    });
  });
  document.querySelectorAll("[data-metric]").forEach((node) => {
    node.addEventListener("input", (event) => {
      state.metricFloor[event.target.dataset.metric] = Number(event.target.value);
      render();
    });
  });
  document.querySelectorAll("[data-view]").forEach((node) => {
    node.addEventListener("click", (event) => {
      state.view = event.currentTarget.dataset.view;
      render();
    });
  });
  document.querySelectorAll("[data-id]").forEach((node) => {
    node.addEventListener("click", (event) => {
      state.selectedId = event.currentTarget.dataset.id;
      render();
    });
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}
