/* Resazurin Explorer application: overview, explorer, uploader, format reference. */
(function () {
  "use strict";
  const $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const esc = s => String(s === null || s === undefined ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const fmt = RZChart.fmt;
  const CAT = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];
  const BLUE = CAT[0], ORANGE = CAT[1], OTHER = "#a8a7a0", MUTED = "#8a8983";
  const STORE = "resazurin-explorer-uploads-v1";
  const METRIC = { fold: "Fold change (F / F₀)", fc: "Blank-corrected fold change", fmm: "Blank-corrected fold change per mm", f: "Raw fluorescence (RFU)" };

  /* ---------------- data ---------------- */
  const PUB = window.RESAZURIN_DB || { experiments: [], samples: [] };
  let uploads = [];           // [{meta, samples}]
  let EXPS = [], ALL = [], EXP = {}, BLANKS = new Map();

  function loadUploads() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORE) || "[]");
      uploads = raw.map(u => ({ meta: Object.assign(u.meta, { user: true }), samples: RZ.readingsToSamples(u.csv, u.meta.id).samples }));
    } catch (e) { uploads = []; }
  }
  function saveUploads() {
    try {
      localStorage.setItem(STORE, JSON.stringify(uploads.map(u => { const t = RZ.samplesToLongRows(u.samples); return { meta: u.meta, csv: RZ.toCSV(t.header, t.rows) }; })));
      return true;
    } catch (e) { return false; }
  }
  function rebuild() {
    EXPS = PUB.experiments.concat(uploads.map(u => u.meta));
    EXP = Object.fromEntries(EXPS.map(e => [e.id, e]));
    const raw = PUB.samples.concat(...uploads.map(u => u.samples));
    RZ.normalize(raw);
    BLANKS = new Map();
    raw.forEach(s => { if (s.type === "blank") { const k = s.e + "|" + s.plate; (BLANKS.get(k) || BLANKS.set(k, []).get(k)).push(s); } });
    ALL = raw.filter(s => s.type === "sample");
    ALL.forEach(s => { s.sp = EXP[s.e].species; s.q = [s.id, s.plate, s.g, s.fam, s.mort, s.date, EXP[s.e].title, s.sp, s.excl, s.notes].join(" ").toLowerCase(); });
  }

  /* ---------------- tabs ---------------- */
  function go(tab) {
    $$("nav button").forEach(b => b.setAttribute("aria-selected", b.dataset.tab === tab));
    $$("main > section").forEach(s => { s.hidden = s.id !== "tab-" + tab; });
    if (location.hash !== "#" + tab) history.replaceState(null, "", "#" + tab);
    if (tab === "explore") renderExplore();
    if (tab === "upload") renderContext();
    window.scrollTo(0, 0);
  }
  document.addEventListener("click", ev => {
    const t = ev.target.closest("[data-tab],[data-goto]"); if (!t) return;
    go(t.dataset.tab || t.dataset.goto);
  });

  /* ---------------- overview ---------------- */
  function expStats(id) {
    const ss = ALL.filter(s => s.e === id), temps = [...new Set(ss.map(s => s.t).filter(v => v !== null))].sort((a, b) => a - b);
    const lens = ss.map(s => s.len).filter(v => v !== null), hrs = Math.max(0, ...ss.map(s => s.h[s.h.length - 1]));
    return { n: ss.length, temps, hrs, lmin: lens.length ? Math.min(...lens) : null, lmax: lens.length ? Math.max(...lens) : null,
      blanks: [...BLANKS.entries()].filter(([k]) => k.startsWith(id + "|")).reduce((a, [, v]) => a + v.length, 0) };
  }
  function renderOverview() {
    const readings = ALL.reduce((a, s) => a + s.h.length, 0), species = new Set(EXPS.map(e => e.species));
    const temps = ALL.map(s => s.t).filter(v => v !== null);
    $("#stats").innerHTML = [[EXPS.length, "experiments"], [ALL.length.toLocaleString(), "individual animals or wells"], [readings.toLocaleString(), "fluorescence readings"],
      [species.size, "species"], [Math.min(...temps) + " to " + Math.max(...temps) + " °C", "temperature range"]]
      .map(([b, s]) => `<div class="card stat"><b>${b}</b><span>${s}</span></div>`).join("");
    const q = $("#exp-search").value.trim().toLowerCase();
    $("#exp-cards").innerHTML = EXPS.filter(e => !q || JSON.stringify(e).toLowerCase().includes(q)).map(e => {
      const st = expStats(e.id);
      return `<div class="card exp"><h3>${esc(e.title)}</h3><div class="sp">${esc(e.species)}</div>
        <dl><dt>Animals</dt><dd>${st.n} (${st.blanks} blanks)</dd>
        <dt>Shell length</dt><dd>${st.lmin === null ? "not recorded" : fmt(st.lmin) + " to " + fmt(st.lmax) + " mm"}</dd>
        <dt>Temperature</dt><dd>${esc(e.temperature_profile || st.temps.join(", ") + " °C")}</dd>
        <dt>Duration</dt><dd>${st.hrs} h</dd><dt>Container</dt><dd>${esc(e.container)}</dd>
        ${e.reader ? `<dt>Reader</dt><dd>${esc(e.reader)}${e.excitation_nm ? `, ${e.excitation_nm}/${e.emission_nm} nm` : ""}</dd>` : ""}</dl>
        <p class="note">${esc(e.description || "")}</p>
        <div class="row">${e.user ? '<span class="tag user">your upload</span>' : '<span class="tag">published</span>'}
        <button class="btn" data-open="${esc(e.id)}" style="margin-left:auto">Explore</button></div></div>`;
    }).join("") || '<p class="note">No experiments match.</p>';
  }
  $("#exp-search").addEventListener("input", renderOverview);
  document.addEventListener("click", ev => {
    const b = ev.target.closest("[data-open]"); if (!b) return;
    resetFilters(); F.exps = new Set([b.dataset.open]); buildFilterLists(); go("explore");
  });

  /* ---------------- explorer ---------------- */
  const F = { q: "", exps: null, species: null, tmin: null, tmax: null, lmin: null, lmax: null, mort: "", excl: false };
  let sortKey = "e", sortDir = 1, lastFiltered = [];
  function resetFilters() {
    Object.assign(F, { q: "", exps: null, species: null, tmin: null, tmax: null, lmin: null, lmax: null, mort: "", excl: false });
    ["f-q", "f-tmin", "f-tmax", "f-lmin", "f-lmax"].forEach(i => { $("#" + i).value = ""; }); $("#f-mort").value = ""; $("#f-excl").checked = false;
  }
  function buildFilterLists() {
    const cnt = {}; ALL.forEach(s => { cnt[s.e] = (cnt[s.e] || 0) + 1; });
    $("#f-exp").innerHTML = EXPS.map(e => `<label><input type="checkbox" value="${esc(e.id)}" ${!F.exps || F.exps.has(e.id) ? "checked" : ""}><span>${esc(e.title)}${e.user ? " (yours)" : ""} <small>${cnt[e.id] || 0}</small></span></label>`).join("");
    const sp = [...new Set(EXPS.map(e => e.species))];
    $("#f-species").innerHTML = sp.map(s => `<label><input type="checkbox" value="${esc(s)}" ${!F.species || F.species.has(s) ? "checked" : ""}><i>${esc(s)}</i></label>`).join("");
  }
  function readFilters() {
    F.q = $("#f-q").value.trim().toLowerCase();
    const ex = $$("#f-exp input"), sp = $$("#f-species input");
    F.exps = ex.every(i => i.checked) ? null : new Set(ex.filter(i => i.checked).map(i => i.value));
    F.species = sp.every(i => i.checked) ? null : new Set(sp.filter(i => i.checked).map(i => i.value));
    const n = id => { const v = $("#" + id).value; return v === "" ? null : +v; };
    F.tmin = n("f-tmin"); F.tmax = n("f-tmax"); F.lmin = n("f-lmin"); F.lmax = n("f-lmax");
    F.mort = $("#f-mort").value; F.excl = $("#f-excl").checked;
  }
  function filtered() {
    const terms = F.q ? F.q.split(/\s+/) : [];
    return ALL.filter(s =>
      (!F.exps || F.exps.has(s.e)) && (!F.species || F.species.has(s.sp)) && (F.excl || !s.excl) &&
      (F.tmin === null || (s.t !== null && s.t >= F.tmin)) && (F.tmax === null || (s.t !== null && s.t <= F.tmax)) &&
      (F.lmin === null || (s.len !== null && s.len >= F.lmin)) && (F.lmax === null || (s.len !== null && s.len <= F.lmax)) &&
      (!F.mort || (F.mort === "unknown" ? !s.mort : s.mort === F.mort)) && terms.every(t => s.q.includes(t)));
  }
  const mix = (a, b, t) => "rgb(" + a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(",") + ")";
  const heat = t => t < 0.5 ? mix([253, 204, 138], [227, 74, 51], t * 2) : mix([227, 74, 51], [127, 0, 0], (t - 0.5) * 2);
  const blues = t => mix([185, 214, 239], [11, 60, 122], t);
  const SIZE_BINS = [[0, 5, "under 5 mm"], [5, 10, "5 to 10 mm"], [10, 15, "10 to 15 mm"], [15, 20, "15 to 20 mm"], [20, 25, "20 to 25 mm"], [25, 1e9, "25 mm and over"]];

  /* returns key -> {label, color, order} for the chosen color mode, over the given samples */
  function colorizer(mode, ss) {
    const map = new Map(); let keyOf;
    if (mode === "experiment") { keyOf = s => s.e; EXPS.forEach((e, i) => map.set(e.id, { label: e.title + (e.user ? " (yours)" : ""), color: i < CAT.length ? CAT[i] : OTHER, order: i })); }
    else if (mode === "species") { keyOf = s => s.sp; [...new Set(EXPS.map(e => e.species))].forEach((sp, i) => map.set(sp, { label: sp, color: CAT[i] || OTHER, order: i })); }
    else if (mode === "temperature") {
      keyOf = s => s.t; const ts = [...new Set(ALL.map(s => s.t).filter(v => v !== null))].sort((a, b) => a - b), lo = ts[0], hi = ts[ts.length - 1];
      ts.forEach(t => map.set(t, { label: t + " °C", color: heat((t - lo) / (hi - lo || 1)), order: t }));
    } else if (mode === "size") {
      keyOf = s => s.len === null ? "none" : SIZE_BINS.findIndex(b => s.len >= b[0] && s.len < b[1]);
      SIZE_BINS.forEach((b, i) => map.set(i, { label: b[2], color: blues(i / 5), order: i })); map.set("none", { label: "length not recorded", color: OTHER, order: 9 });
    } else if (mode === "mortality") {
      keyOf = s => s.mort || "none"; map.set("alive", { label: "alive", color: BLUE, order: 0 }); map.set("dead", { label: "dead", color: ORANGE, order: 1 }); map.set("none", { label: "survival not recorded", color: OTHER, order: 2 });
    } else if (mode === "group") {
      const cnt = new Map(); ss.forEach(s => { const k = s.g || "none"; cnt.set(k, (cnt.get(k) || 0) + 1); });
      const top = [...cnt.entries()].filter(([k]) => k !== "none").sort((a, b) => b[1] - a[1]).slice(0, 7).map(([k]) => k);
      keyOf = s => (s.g && top.includes(s.g)) ? s.g : (s.g ? "other" : "none");
      top.forEach((k, i) => map.set(k, { label: k, color: CAT[i], order: i })); map.set("other", { label: "other groups", color: MUTED, order: 8 }); map.set("none", { label: "no group", color: OTHER, order: 9 });
    } else {   // your data vs published: one gray median per published experiment, so studies of different length are not pooled
      keyOf = s => EXP[s.e].user ? "u:" + s.e : s.e;
      EXPS.forEach((e, i) => map.set(e.user ? "u:" + e.id : e.id, e.user ? { label: e.title + " (yours)", color: ORANGE, order: 100 + i, legend: "your data" }
        : { label: e.title, color: OTHER, order: i, legend: "published (one line per experiment)" }));
    }
    return { keyOf, map };
  }

  function seriesFor(ss, metric, cz, opt) {
    const groups = new Map();
    ss.forEach(s => { const k = cz.keyOf(s); (groups.get(k) || groups.set(k, []).get(k)).push(s); });
    const keys = [...groups.keys()].sort((a, b) => cz.map.get(a).order - cz.map.get(b).order);
    const series = [];
    if (opt.individuals) {
      const stride = Math.max(1, Math.ceil(ss.length / 700)), alpha = Math.max(0.07, Math.min(0.45, 14 / (ss.length / stride)));
      keys.forEach(k => groups.get(k).forEach((s, i) => { if (i % stride) return; series.push({ pts: s.h.map((h, j) => [h, s[metric][j]]), color: cz.map.get(k).color, width: 0.7, alpha }); }));
    }
    if (opt.blanks && (metric === "fold" || metric === "f")) {
      const plates = new Set(ss.map(s => s.e + "|" + s.plate)), bl = []; plates.forEach(p => (BLANKS.get(p) || []).forEach(b => bl.push(b)));
      if (bl.length) series.push({ pts: RZ.summarize(bl, metric).map(r => [r.h, r.med, r.n]), color: MUTED, width: 1.3, dash: [4, 3], hover: true, label: "blank wells (median)" });
    }
    keys.forEach(k => {
      const sm = RZ.summarize(groups.get(k), metric); if (!sm.length) return;
      series.push({ pts: sm.map(r => [r.h, r.med, r.n]), band: keys.length <= 3 ? sm.map(r => [r.h, r.q1, r.q3]) : null, color: cz.map.get(k).color,
        width: 2.2, hover: true, label: cz.map.get(k).label + " (median)" });
    });
    return { series, keys };
  }

  function renderExplore() {
    if ($("#tab-explore").hidden) return;
    const ss = filtered(); lastFiltered = ss;
    const metric = $("#c-metric").value, facet = $("#c-facet").value, mode = $("#c-color").value;
    const canLog = metric === "fold" || metric === "f"; $("#c-scale").disabled = !canLog;
    const log = canLog && $("#c-scale").value === "log", ind = $("#c-ind").checked, share = $("#c-sharey").checked;
    const cz = colorizer(mode, ss);
    const fk = facet === "experiment" ? (s => s.e) : facet === "species" ? (s => s.sp) : facet === "temperature" ? (s => s.t) : (() => "all");
    const panels = new Map(); ss.forEach(s => { const k = fk(s); (panels.get(k) || panels.set(k, []).get(k)).push(s); });
    let pk = [...panels.keys()];
    if (facet === "experiment") pk.sort((a, b) => EXPS.findIndex(e => e.id === a) - EXPS.findIndex(e => e.id === b)); else pk.sort((a, b) => a > b ? 1 : -1);
    const wrap = $("#panels"); wrap.innerHTML = ""; wrap.className = "panels" + (pk.length > 1 ? " multi" : "");
    $("#explore-count").textContent = `${ss.length.toLocaleString()} of ${ALL.length.toLocaleString()} wells match` + (ss.length ? "" : ". Loosen the filters to see data.");
    const used = new Set(), built = pk.map(k => { const r = seriesFor(panels.get(k), metric, cz, { individuals: ind, blanks: true }); r.keys.forEach(x => used.add(x)); return r; });
    let yd = null;
    if (share && pk.length > 1) { const v = []; built.forEach(b => b.series.forEach(s => { s.pts.forEach(p => v.push(p[1])); })); yd = RZChart.domain(v, log); }
    pk.forEach((k, i) => {
      const el = document.createElement("div"); el.className = "card"; wrap.appendChild(el);
      const inner = document.createElement("div"); el.appendChild(inner);
      const title = facet === "experiment" ? EXP[k].title + (EXP[k].user ? " (yours)" : "") : facet === "species" ? k : facet === "temperature" ? (k === null ? "temperature not recorded" : k + " °C") : "";
      const sub = facet === "experiment" ? `${EXP[k].species}, ${panels.get(k).length} wells` : (facet === "none" ? "" : `${panels.get(k).length} wells`);
      RZChart.lines(inner, { series: built[i].series, log, yDomain: yd, title, subtitle: sub, xLabel: "Hours since resazurin added", yLabel: METRIC[metric],
        height: pk.length > 1 ? 280 : 440, yFmt: metric === "fold" ? (v => fmt(v) + "×") : undefined });
    });
    const seen = new Set();
    $("#legend").innerHTML = [...used].sort((a, b) => cz.map.get(a).order - cz.map.get(b).order).map(k => { const c = cz.map.get(k), l = c.legend || c.label; if (seen.has(l)) return ""; seen.add(l); return `<span><i class="sw" style="background:${c.color}"></i>${esc(l)}</span>`; }).join("") +
      (ss.length ? `<span><i class="sw" style="background:repeating-linear-gradient(90deg,${MUTED} 0 4px,transparent 4px 7px)"></i>blank wells</span><span>thick line = median${used.size <= 3 ? ", band = middle 50%" : ""}</span>` : "");
    if (ss.length && facet !== "experiment" && mode !== "experiment" && mode !== "source" && new Set(ss.map(s => s.e)).size > 1)
      $("#explore-count").textContent += ". Medians here pool wells from several experiments; a study drops out of the line after its last reading.";
    renderTable();
  }

  const COLS = [["e", "Experiment", s => EXP[s.e].title], ["id", "Sample", s => s.id], ["sp", "Species", s => s.sp], ["t", "°C", s => s.t, 1], ["len", "Length mm", s => s.len, 1],
    ["g", "Group", s => s.g], ["fam", "Family", s => s.fam], ["mort", "Survival", s => s.mort], ["end", "Fold at end", s => s.end, 1], ["rate", "Rate / h", s => s.rate, 1], ["excl", "Excluded", s => s.excl]];
  function renderTable() {
    const col = COLS.find(c => c[0] === sortKey), get = col[2];
    const rows = lastFiltered.slice().sort((a, b) => { const x = get(a), y = get(b); if (x === y) return 0; if (x === null || x === undefined || x === "") return 1; if (y === null || y === undefined || y === "") return -1; return (x > y ? 1 : -1) * sortDir; });
    $("#table-count").textContent = rows.length > 200 ? `showing 200 of ${rows.length.toLocaleString()}` : `${rows.length}`;
    $("#table").innerHTML = "<thead><tr>" + COLS.map(c => `<th class="sort${c[3] ? " num" : ""}" data-sort="${c[0]}">${c[1]}${c[0] === sortKey ? (sortDir > 0 ? " ▲" : " ▼") : ""}</th>`).join("") + "</tr></thead><tbody>" +
      rows.slice(0, 200).map(s => "<tr>" + COLS.map(c => { const v = c[2](s); return `<td${c[3] ? ' class="num"' : ""}>${v === null || v === undefined ? "" : (c[3] ? fmt(v) : esc(v))}</td>`; }).join("") + "</tr>").join("") + "</tbody>";
  }
  $("#table").addEventListener("click", ev => { const th = ev.target.closest("th[data-sort]"); if (!th) return; if (sortKey === th.dataset.sort) sortDir = -sortDir; else { sortKey = th.dataset.sort; sortDir = 1; } renderTable(); });
  $("#filters").addEventListener("input", () => { readFilters(); renderExplore(); });
  $("#f-reset").addEventListener("click", () => { resetFilters(); buildFilterLists(); renderExplore(); });
  ["c-metric", "c-color", "c-facet", "c-scale", "c-ind", "c-sharey"].forEach(i => $("#" + i).addEventListener("change", renderExplore));
  let rz; window.addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => { renderExplore(); renderContext(); }, 150); });

  /* Normal browsers: a blob link. When hosted as a claude.ai artifact, the frame blocks that, so use its downloads capability if present. */
  let hostSave = null;
  if (window.claude && typeof window.claude.use === "function") window.claude.use("downloads").then(d => { hostSave = d; }).catch(() => {});
  function download(name, text, type) {
    if (hostSave) { hostSave.save({ filename: name, data: text }).catch(() => {}); return; }
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: type || "text/csv" })); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  $("#dl-filtered").addEventListener("click", () => {
    const header = ["experiment_id", "species"].concat(RZ.REQUIRED_COLS, RZ.OPTIONAL_COLS, ["fold_change", "fold_change_blank_corrected", "fold_change_blank_corrected_per_mm"]);
    const rows = []; lastFiltered.forEach(s => s.h.forEach((h, i) => rows.push([s.e, s.sp, s.id, s.plate, s.type, h, s.f[i], s.t, s.len, s.g, s.fam, s.mort, s.date, s.excl, s.notes, s.fold[i], s.fc[i], s.fmm[i]])));
    download("resazurin_filtered_readings.csv", RZ.toCSV(header, rows));
  });

  /* ---------------- format reference + templates ---------------- */
  const READ_DOC = {
    sample_id: ["Required", "Unique name for one well, cup or animal within the experiment.", "A01, plate2_B07"],
    plate: ["Required", "The plate, run or batch. Wells with the same plate value share blanks.", "plate1, 2025-06-10_27C"],
    type: ["Required", "sample (contains an animal or control object) or blank (resazurin solution only).", "sample"],
    hour: ["Required", "Hours since resazurin was added. Every well needs hour 0. Decimals are allowed.", "0, 1, 2.5"],
    fluorescence: ["Required", "Raw plate-reader value (RFU). Do not subtract blanks or normalize.", "1532"],
    temperature_c: ["Required for samples", "Incubation temperature in °C. For two-phase designs use the stress temperature.", "38"],
    length_mm: ["Recommended", "Shell length in millimetres. Needed for size-normalized values.", "7.4"],
    group: ["Optional", "Treatment, line, ploidy, or control label you want to compare.", "control, triploid, empty shell"],
    family: ["Optional", "Family or genetic line identifier.", "F12"],
    mortality: ["Optional", "alive or dead at the end of the assay (0 and 1 are accepted).", "alive"],
    date: ["Optional", "Date the well was run, YYYY-MM-DD.", "2026-03-10"],
    excluded: ["Optional", "Reason this well should be hidden by default. Leave empty to include it.", "spilled"],
    notes: ["Optional", "Free text.", ""]
  };
  const META_DOC = {
    id: ["Required", "Short unique id: lowercase letters, digits and hyphens. Also the folder name.", "roberts-2026-heat-trial"],
    title: ["Required", "Short human-readable title.", "Triploid seed heat trial"],
    species: ["Required", "Full binomial.", "Crassostrea gigas"],
    contact: ["Required", "Person or lab responsible, with a way to reach them.", "J. Doe, Example Lab, jdoe@example.edu"],
    date_start: ["Required", "First assay date, YYYY-MM-DD.", "2026-03-10"],
    container: ["Required", "What the animals were incubated in.", "96-well plate"],
    life_stage: ["Recommended", "Larvae, seed, juvenile, adult, tissue.", "seed"],
    size_class: ["Recommended", "Approximate size range.", "5-10 mm"],
    volume_ml: ["Recommended", "Resazurin working solution per animal, in mL.", "0.28"],
    reader: ["Recommended", "Plate reader make and model.", "BioTek Synergy HTX"],
    excitation_nm: ["Recommended", "Excitation wavelength in nm.", "530"],
    emission_nm: ["Recommended", "Emission wavelength in nm.", "590"],
    resazurin_ug_ml: ["Recommended", "Working concentration in µg/mL.", "111"],
    salinity_psu: ["Recommended", "Salinity of the working solution.", "25"],
    temperature_profile: ["Recommended", "Plain-language temperature schedule.", "18 C for 3 h, then 40 C for 3 h"],
    group_label: ["Optional", "What the group column means in this experiment.", "Ploidy"],
    description: ["Optional", "One or two sentences on design and anything unusual.", ""],
    doi: ["Optional", "DOI of the associated paper or dataset.", "10.7717/peerj.21542"],
    citation: ["Optional", "How to cite.", ""], source_url: ["Optional", "Link to raw files.", ""],
    license: ["Optional", "Data license.", "CC BY 4.0"], date_end: ["Optional", "Last assay date, YYYY-MM-DD.", ""]
  };
  function example() {
    let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const samples = [];
    [["plateA", 18, 0.55], ["plateB", 38, 1.25]].forEach(([plate, t, k]) => {
      for (let i = 1; i <= 12; i++) {
        const blank = i > 10, f0 = 600 + Math.round(rnd() * 150), len = blank ? null : +(5 + rnd() * 5).toFixed(2), r = blank ? 0.01 : k * (0.6 + rnd() * 0.8);
        const h = [0, 1, 2, 3, 4];
        samples.push({ id: plate + "_" + (blank ? "blank" + (i - 10) : "oyster" + String(i).padStart(2, "0")), plate, type: blank ? "blank" : "sample", t, len,
          g: blank ? "" : (i % 2 ? "diploid" : "triploid"), fam: "", mort: blank ? "" : (t === 38 && rnd() < 0.2 ? "dead" : "alive"), date: "2026-03-10", excl: "", notes: "",
          h, f: h.map(x => Math.round(f0 * (1 + r * x * (1 + (rnd() - 0.5) * 0.15)))) });
      }
    });
    const meta = { id: "example-ploidy-heat-trial", title: "Example: ploidy heat trial", species: "Crassostrea gigas", contact: "Your name, your lab, you@example.edu", date_start: "2026-03-10",
      container: "96-well plate", life_stage: "seed", size_class: "5-10 mm", volume_ml: 0.28, reader: "BioTek Synergy HTX", excitation_nm: 530, emission_nm: 590, resazurin_ug_ml: 111, salinity_psu: 25,
      temperature_profile: "18 or 38 C for 4 h", group_label: "Ploidy", description: "Made-up numbers that show the file layout. Replace with your own.", license: "CC BY 4.0" };
    return { meta, samples };
  }
  function tplText(kind) {
    const ex = example();
    if (kind === "meta") return JSON.stringify(ex.meta, null, 2) + "\n";
    if (kind === "long") { const t = RZ.samplesToLongRows(ex.samples); return RZ.toCSV(t.header, t.rows); }
    return RZ.toCSV(["sample_id", "plate", "type", "temperature_c", "length_mm", "group", "mortality", "date", "0", "1", "2", "3", "4"],
      ex.samples.map(s => [s.id, s.plate, s.type, s.t, s.len, s.g, s.mort, s.date].concat(s.f)));
  }
  window.RZ_TEMPLATES = tplText;   // used by scripts/make_templates.js
  function renderFormat() {
    const tbl = (doc) => "<tr><th>Field</th><th>Status</th><th>What it is</th><th>Example</th></tr>" + Object.entries(doc).map(([k, v]) => `<tr><td><code>${k}</code></td><td>${v[0].startsWith("Required") ? "<b>" + v[0] + "</b>" : v[0]}</td><td>${esc(v[1])}</td><td>${v[2] ? "<code>" + esc(v[2]) + "</code>" : ""}</td></tr>`).join("");
    $("#spec-readings").innerHTML = tbl(READ_DOC); $("#spec-meta").innerHTML = tbl(META_DOC);
    $("#ex-long").textContent = tplText("long").split("\n").slice(0, 8).join("\n") + "\n…";
    $("#ex-wide").textContent = tplText("wide").split("\n").slice(0, 4).join("\n") + "\n…";
    $("#ex-meta").textContent = tplText("meta");
  }
  document.addEventListener("click", ev => {
    const b = ev.target.closest("[data-tpl]"); if (!b) return; const k = b.dataset.tpl;
    download(k === "meta" ? "experiment.json" : "readings_" + k + "_template.csv", tplText(k), k === "meta" ? "application/json" : "text/csv");
  });

  /* ---------------- uploader ---------------- */
  const FORM = ["id", "title", "species", "contact", "date_start", "container", "life_stage", "size_class", "reader", "excitation_nm", "emission_nm", "volume_ml", "resazurin_ug_ml", "temperature_profile", "group_label", "doi", "description"];
  const U = { meta: {}, samples: [], rErrors: [], rWarnings: [], format: null, fileName: "", idTouched: false };
  function renderForm() {
    $("#u-form").innerHTML = FORM.map(k => { const d = META_DOC[k], req = d[0] === "Required";
      return `<div><label for="m-${k}">${k}${req ? " <b>*</b>" : ""}</label><input id="m-${k}" data-k="${k}" type="${k === "date_start" ? "date" : "text"}" placeholder="${esc(d[2])}" ${k === "species" ? 'list="species-list"' : ""} title="${esc(d[1])}"></div>`; }).join("") +
      `<datalist id="species-list">${["Crassostrea gigas", "Crassostrea virginica", "Ostrea lurida", "Mytilus galloprovincialis", "Mytilus trossulus", "Ruditapes philippinarum", "Mercenaria mercenaria", "Panopea generosa"].map(s => `<option value="${s}">`).join("")}</datalist>`;
  }
  function setMeta(m) { U.meta = Object.assign({}, m); FORM.forEach(k => { $("#m-" + k).value = m[k] === undefined ? "" : m[k]; }); U.idTouched = !!m.id; }
  $("#u-form").addEventListener("input", ev => {
    const k = ev.target.dataset.k; if (!k) return; let v = ev.target.value.trim();
    if (k === "id") U.idTouched = true;
    if (["excitation_nm", "emission_nm", "volume_ml", "resazurin_ug_ml"].includes(k) && v !== "" && isFinite(+v)) v = +v;
    if (v === "") delete U.meta[k]; else U.meta[k] = v;
    if (k === "title" && !U.idTouched) { const id = v.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60); U.meta.id = id; $("#m-id").value = id; }
    if (k === "id" || k === "title") U.samples.forEach(s => { s.e = U.meta.id || "upload"; });
    report(); if (k === "species") renderContext();
  });
  $("#u-meta-file").addEventListener("change", ev => {
    const f = ev.target.files[0]; if (!f) return;
    f.text().then(t => { try { setMeta(JSON.parse(t)); report(); renderContext(); } catch (e) { $("#u-report").innerHTML = `<div class="msg err">That file is not valid JSON: ${esc(e.message)}</div>`; } });
  });
  function loadReadings(text, name) {
    const r = RZ.readingsToSamples(text, U.meta.id || "upload");
    U.samples = r.samples; U.format = r.format; U.fileName = name;
    const v = r.errors.length ? { errors: [], warnings: [] } : RZ.validateSamples(r.samples);
    U.rErrors = r.errors.concat(v.errors); U.rWarnings = [...new Set(r.warnings)].slice(0, 8).concat(v.warnings);
    report(); renderContext();
  }
  function metaCheck() {
    const v = RZ.validateMeta(U.meta);
    if (U.meta.id && PUB.experiments.some(e => e.id === U.meta.id)) v.errors.push(`The id "${U.meta.id}" is already used by a published experiment. Choose another.`);
    return v;
  }
  function report() {
    const mv = metaCheck(), has = U.samples.length > 0 || U.rErrors.length > 0;
    const li = a => "<ul>" + a.map(x => `<li>${esc(x)}</li>`).join("") + "</ul>";
    let html = "";
    if (has) {
      const n = U.samples.filter(s => s.type === "sample").length, b = U.samples.length - n, rd = U.samples.reduce((a, s) => a + s.h.length, 0);
      html += `<p class="note" style="margin-top:10px"><b>${esc(U.fileName)}</b>: ${U.format || "unknown"} format, ${n} samples, ${b} blanks, ${rd} readings.</p>`;
      if (U.rErrors.length) html += `<div class="msg err"><b>${U.rErrors.length} problem${U.rErrors.length > 1 ? "s" : ""} to fix in the readings file</b>${li(U.rErrors)}</div>`;
      if (U.rWarnings.length) html += `<div class="msg warn"><b>Worth checking</b>${li(U.rWarnings)}</div>`;
      if (!U.rErrors.length) html += `<div class="msg ok">The readings file is valid.</div>`;
    }
    if (mv.errors.length && (has || Object.keys(U.meta).length)) html += `<div class="msg err"><b>Experiment details still needed</b>${li(mv.errors)}</div>`;
    $("#u-report").innerHTML = html;
    const ok = has && !U.rErrors.length && !mv.errors.length;
    $("#u-add").disabled = !ok; $("#u-download").disabled = !ok;
  }
  const drop = $("#u-drop");
  ["dragover", "dragenter"].forEach(e => drop.addEventListener(e, ev => { ev.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach(e => drop.addEventListener(e, ev => { ev.preventDefault(); drop.classList.remove("over"); }));
  drop.addEventListener("drop", ev => { const f = ev.dataTransfer.files[0]; if (f) f.text().then(t => loadReadings(t, f.name)); });
  $("#u-pick").addEventListener("click", () => $("#u-file").click());
  $("#u-file").addEventListener("change", ev => { const f = ev.target.files[0]; if (f) f.text().then(t => loadReadings(t, f.name)); });
  $("#u-example").addEventListener("click", () => { const ex = example(); setMeta(ex.meta); loadReadings(tplText("long"), "example readings"); });

  const hash = s => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return ((h >>> 0) % 1000) / 1000 - 0.5; };
  function renderContext() {
    if ($("#tab-upload").hidden) return;
    const ok = U.samples.length && !U.rErrors.length;
    $("#u-context").hidden = !ok; $("#u-context-empty").hidden = !!ok; if (!ok) return;
    const mine = RZ.normalize(U.samples.map(s => Object.assign({}, s))).filter(s => s.type === "sample" && !s.excl);
    const sp = U.meta.species || "", metric = $("#u-metric").value, same = $("#u-compare").value === "species" && sp;
    const prior = ALL.filter(s => !EXP[s.e].user && !s.excl && (!same || s.sp === sp));
    const spList = [...new Set(prior.map(s => s.sp))], spCol = Object.fromEntries(spList.map((x, i) => [x, [BLUE, CAT[2], CAT[6], CAT[3]][i] || OTHER]));
    // 1. curves
    const series = [], groups = new Map();
    prior.forEach(s => { const k = s.e + "|" + s.t; (groups.get(k) || groups.set(k, []).get(k)).push(s); });
    groups.forEach((g, k) => { const sm = RZ.summarize(g, metric); series.push({ pts: sm.map(r => [r.h, r.med, r.n]), color: spCol[g[0].sp], width: 1.2, alpha: 0.75, hover: true, label: `${EXP[g[0].e].title}, ${g[0].t} °C` }); });
    const stride = Math.max(1, Math.ceil(mine.length / 300));
    mine.forEach((s, i) => { if (i % stride === 0) series.push({ pts: s.h.map((h, j) => [h, s[metric][j]]), color: ORANGE, width: 0.7, alpha: 0.25 }); });
    const mt = new Map(); mine.forEach(s => (mt.get(s.t) || mt.set(s.t, []).get(s.t)).push(s));
    [...mt.keys()].sort((a, b) => a - b).forEach(t => { const sm = RZ.summarize(mt.get(t), metric); series.push({ pts: sm.map(r => [r.h, r.med, r.n]), color: ORANGE, width: 3, hover: true, label: `Your data, ${t} °C` }); });
    const log = metric === "fold";
    RZChart.lines($("#u-c1"), { series, log, title: "Median curves", subtitle: "one line per experiment and temperature", xLabel: "Hours since resazurin added", yLabel: METRIC[metric], height: 320, yFmt: log ? (v => fmt(v) + "×") : undefined });
    // 2 + 3. rate scatters
    const g2 = spList.map(x => ({ label: x, color: spCol[x], alpha: 0.3, size: 2.2, pts: prior.filter(s => s.sp === x && s.rate !== null && s.t !== null).map(s => [s.t + hash(s.id) * 0.9, s.rate, `${EXP[s.e].title}: ${s.id}`]) }));
    g2.push({ label: "Your data", color: ORANGE, alpha: 0.95, size: 4, ring: true, pts: mine.filter(s => s.rate !== null && s.t !== null).map(s => [s.t + hash(s.id) * 0.9, s.rate, "Your data: " + s.id]) });
    RZChart.scatter($("#u-c2"), { groups: g2, log: true, floor: 0.01, title: "Rate by temperature", subtitle: "each dot is one animal; values under 0.01 sit on the floor", xLabel: "Temperature (°C)", yLabel: "Blank-corrected fold change per hour", yShort: "Rate / h", height: 320 });
    const g3 = spList.map(x => ({ label: x, color: spCol[x], alpha: 0.3, size: 2.2, pts: prior.filter(s => s.sp === x && s.rate !== null && s.len !== null).map(s => [s.len, s.rate, `${EXP[s.e].title}: ${s.id}`]) }));
    const myLen = mine.filter(s => s.rate !== null && s.len !== null);
    g3.push({ label: "Your data", color: ORANGE, alpha: 0.95, size: 4, ring: true, pts: myLen.map(s => [s.len, s.rate, "Your data: " + s.id]) });
    RZChart.scatter($("#u-c3"), { groups: g3, log: true, floor: 0.01, title: "Rate by shell length", subtitle: myLen.length ? "each dot is one animal" : "your file has no length_mm, so only published data are shown", xLabel: "Shell length (mm)", yLabel: "Blank-corrected fold change per hour", yShort: "Rate / h", height: 320 });
    $("#u-legend").innerHTML = spList.map(x => `<span><i class="sw" style="background:${spCol[x]}"></i>published, <i>${esc(x)}</i></span>`).join("") + `<span><i class="sw" style="background:${ORANGE}"></i>your data</span>`;
    // summary sentences
    const out = [];
    [...mt.keys()].sort((a, b) => a - b).forEach(t => {
      const r = mt.get(t).map(s => s.rate).filter(v => v !== null).sort((a, b) => a - b); if (!r.length) return;
      const med = RZ.quantile(r, 0.5), ref = ALL.filter(s => !EXP[s.e].user && !s.excl && s.rate !== null && s.t !== null && Math.abs(s.t - t) <= 3 && (!sp || s.sp === sp));
      if (ref.length >= 10) { const pct = Math.round(100 * ref.filter(s => s.rate < med).length / ref.length);
        out.push(`At ${t} °C your median rate is ${fmt(med)} per hour (n = ${r.length}), higher than ${pct}% of the ${ref.length} published ${sp ? esc(sp) + " " : ""}animals measured within 3 °C.`); }
      else out.push(`At ${t} °C your median rate is ${fmt(med)} per hour (n = ${r.length}). There are too few published ${sp ? esc(sp) + " " : ""}animals within 3 °C to compare.`);
    });
    const noBlank = mine.some(s => s.fc[s.fc.length - 1] === null);
    $("#u-summary").innerHTML = out.join("<br>") + (noBlank ? "<br>Some of your plates have no blanks, so their rate uses fold change minus 1 instead of a blank correction." : "");
  }
  ["u-compare", "u-metric"].forEach(i => $("#" + i).addEventListener("change", renderContext));

  function renderMine() {
    $("#u-mine").innerHTML = uploads.length ? "<h3>Stored in this browser</h3>" + uploads.map(u => `<div class="row" style="margin:4px 0"><span class="tag user">your upload</span><span>${esc(u.meta.title)} <span class="note">(${esc(u.meta.id)}, ${u.samples.filter(s => s.type === "sample").length} samples)</span></span><button class="btn" data-rm="${esc(u.meta.id)}" style="margin-left:auto">Remove</button></div>`).join("") : "";
  }
  function refreshAll() { rebuild(); buildFilterLists(); renderOverview(); renderMine(); }
  $("#u-add").addEventListener("click", () => {
    const meta = Object.assign({}, U.meta, { user: true }), samples = U.samples.map(s => Object.assign({}, s, { e: meta.id }));
    uploads = uploads.filter(u => u.meta.id !== meta.id).concat([{ meta, samples }]);
    const saved = saveUploads(); refreshAll(); resetFilters(); buildFilterLists();
    $("#c-color").value = "source"; $("#c-facet").value = "none"; go("explore");
    if (!saved) $("#explore-count").textContent += " Your experiment is loaded for this visit, but this browser would not store it for next time.";
  });
  $("#u-download").addEventListener("click", () => {
    const meta = Object.assign({}, U.meta); delete meta.user; const t = RZ.samplesToLongRows(U.samples);
    const used = t.header.map((_, i) => i < 5 || t.rows.some(r => r[i] !== "" && r[i] !== null && r[i] !== undefined));
    download("experiment.json", JSON.stringify(meta, null, 2) + "\n", "application/json");
    setTimeout(() => download("readings.csv", RZ.toCSV(t.header.filter((_, i) => used[i]), t.rows.map(r => r.filter((_, i) => used[i])))), 400);
  });
  document.addEventListener("click", ev => { const b = ev.target.closest("[data-rm]"); if (!b) return; uploads = uploads.filter(u => u.meta.id !== b.dataset.rm); saveUploads(); refreshAll(); });

  /* ---------------- start ---------------- */
  loadUploads(); rebuild(); renderForm(); renderFormat(); buildFilterLists(); renderOverview(); renderMine();
  const start = (location.hash || "#overview").slice(1);
  go(["overview", "explore", "upload", "format", "about"].includes(start) ? start : "overview");
})();
