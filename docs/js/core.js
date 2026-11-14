/* Resazurin Explorer core: CSV parsing, validation and normalization.
   Runs in the browser (window.RZ) and in Node (module.exports) so the same
   rules apply to bundled data and to files a visitor uploads. */
(function (root) {
  "use strict";

  const REQUIRED_COLS = ["sample_id", "plate", "type", "hour", "fluorescence"];
  const OPTIONAL_COLS = ["temperature_c", "length_mm", "group", "family", "mortality", "date", "excluded", "notes"];
  const REQUIRED_META = ["id", "title", "species", "contact", "date_start", "container"];
  const RECOMMENDED_META = ["life_stage", "size_class", "volume_ml", "reader", "excitation_nm", "emission_nm",
    "resazurin_ug_ml", "salinity_psu", "temperature_profile", "group_label", "description", "doi", "citation",
    "source_url", "license", "date_end"];
  const WIDE_HOUR = /^(?:t|h|hour_?)?(\d+(?:\.\d+)?)$/i;

  /* ---------- CSV ---------- */
  function parseCSV(text) {
    text = text.replace(/^﻿/, "");
    const firstLine = text.split(/\r?\n/, 1)[0] || "";
    const delim = (firstLine.split("\t").length > firstLine.split(",").length) ? "\t" : ",";
    const rows = []; let row = [], cur = "", q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
        else cur += c;
      } else if (c === '"') q = true;
      else if (c === delim) { row.push(cur); cur = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(cur); cur = "";
        if (row.some(v => v.trim() !== "")) rows.push(row);
        row = [];
      } else cur += c;
    }
    row.push(cur);
    if (row.some(v => v.trim() !== "")) rows.push(row);
    if (!rows.length) return { header: [], rows: [] };
    const header = rows[0].map(h => h.trim().toLowerCase().replace(/\s+/g, "_").replace(/\./g, "_"));
    return { header, rows: rows.slice(1).map(r => r.map(v => v.trim())) };
  }

  function toCSV(header, rows) {
    const esc = v => (v === null || v === undefined) ? "" : (/[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v));
    return [header.join(",")].concat(rows.map(r => r.map(esc).join(","))).join("\n") + "\n";
  }

  const num = v => (v === "" || v === null || v === undefined || /^(na|nan|null)$/i.test(v)) ? null : (isFinite(+v) ? +v : NaN);

  /* ---------- readings table -> samples ----------
     Accepts long format (one row per sample per hour) or wide format
     (one row per sample, one column per hour named 0,1,2 / T0,T1 / h0,h1). */
  function readingsToSamples(text, expId) {
    const errors = [], warnings = [];
    const { header, rows } = parseCSV(text);
    if (!header.length) return { samples: [], errors: ["The file is empty."], warnings, format: null };
    const alias = { well: "sample_id", sample: "sample_id", id: "sample_id", value: "fluorescence", rfu: "fluorescence",
      raw: "fluorescence", time: "hour", timepoint: "hour", hours: "hour", temperature: "temperature_c", temp_c: "temperature_c",
      temp: "temperature_c", length: "length_mm", shell_length_mm: "length_mm", treatment: "group", plate_id: "plate" };
    const cols = header.map(h => (alias[h] && !header.includes(alias[h])) ? alias[h] : h);
    const hourCols = cols.map((c, i) => ({ i, m: WIDE_HOUR.exec(c) })).filter(o => o.m && !REQUIRED_COLS.includes(cols[o.i]));
    const wide = !cols.includes("hour") && hourCols.length >= 2;
    const need = wide ? ["sample_id", "plate", "type"] : REQUIRED_COLS;
    const missing = need.filter(c => !cols.includes(c));
    if (missing.length) {
      errors.push("Missing required column" + (missing.length > 1 ? "s" : "") + ": " + missing.join(", ") +
        ". Found: " + header.join(", ") + ".");
      return { samples: [], errors, warnings, format: wide ? "wide" : "long" };
    }
    const ix = Object.fromEntries(cols.map((c, i) => [c, i]));
    const get = (r, c) => (c in ix ? (r[ix[c]] === undefined ? "" : r[ix[c]]) : "");
    const byId = new Map();
    const bad = { hour: 0, fl: 0, type: 0, noId: 0, dup: 0, temp: 0, len: 0 };
    rows.forEach((r, n) => {
      const sid = get(r, "sample_id");
      if (!sid) { bad.noId++; return; }
      let type = get(r, "type").toLowerCase();
      if (type === "oyster" || type === "animal") type = "sample";
      if (type !== "sample" && type !== "blank") { bad.type++; return; }
      let s = byId.get(sid);
      if (!s) {
        const t = num(get(r, "temperature_c")), len = num(get(r, "length_mm"));
        if (Number.isNaN(t)) bad.temp++;
        if (Number.isNaN(len)) bad.len++;
        let mort = get(r, "mortality").toLowerCase();
        if (mort === "0") mort = "alive"; if (mort === "1") mort = "dead";
        s = { e: expId, id: sid, plate: get(r, "plate"), type, t: Number.isNaN(t) ? null : t, len: Number.isNaN(len) ? null : len,
          g: get(r, "group"), fam: get(r, "family"), mort, date: get(r, "date"), excl: get(r, "excluded"), notes: get(r, "notes"),
          _pts: new Map() };
        byId.set(sid, s);
      } else if (s.type !== type || s.plate !== get(r, "plate")) {
        warnings.push(`Sample ${sid} has inconsistent type or plate across rows; the first value is used.`);
      }
      const add = (h, f) => {
        if (f === null) return;                       // empty read: skip silently
        if (h === null || Number.isNaN(h) || h < 0) { bad.hour++; return; }
        if (Number.isNaN(f)) { bad.fl++; return; }
        if (s._pts.has(h)) { bad.dup++; return; }
        s._pts.set(h, f);
      };
      if (wide) hourCols.forEach(o => add(+o.m[1], num(r[o.i] === undefined ? "" : r[o.i])));
      else add(num(get(r, "hour")), num(get(r, "fluorescence")));
    });
    if (bad.noId) errors.push(`${bad.noId} row(s) have no sample_id.`);
    if (bad.type) errors.push(`${bad.type} row(s) have a type other than "sample" or "blank".`);
    if (bad.hour) errors.push(`${bad.hour} reading(s) have a missing, negative or non-numeric hour.`);
    if (bad.fl) errors.push(`${bad.fl} reading(s) have a non-numeric fluorescence value.`);
    if (bad.dup) errors.push(`${bad.dup} duplicate reading(s): the same sample_id appears twice at the same hour. sample_id must be unique within the experiment.`);
    if (bad.temp) errors.push(`${bad.temp} sample(s) have a non-numeric temperature_c.`);
    if (bad.len) errors.push(`${bad.len} sample(s) have a non-numeric length_mm.`);
    const samples = [];
    byId.forEach(s => {
      const hs = [...s._pts.keys()].sort((a, b) => a - b);
      s.h = hs; s.f = hs.map(h => s._pts.get(h)); delete s._pts;
      samples.push(s);
    });
    return { samples, errors, warnings, format: wide ? "wide" : "long" };
  }

  /* ---------- validation ---------- */
  function validateMeta(meta) {
    const errors = [], warnings = [];
    REQUIRED_META.forEach(k => { if (meta[k] === undefined || meta[k] === null || String(meta[k]).trim() === "") errors.push(`Experiment field "${k}" is required.`); });
    if (meta.id && !/^[a-z0-9][a-z0-9-]{2,63}$/.test(meta.id)) errors.push('Experiment "id" must be 3 to 64 characters: lowercase letters, digits and hyphens.');
    if (meta.date_start && !/^\d{4}-\d{2}-\d{2}$/.test(meta.date_start)) errors.push('"date_start" must be YYYY-MM-DD.');
    if (meta.species && !/^[A-Z][a-z]+ [a-z]+/.test(meta.species)) warnings.push('"species" should be a full binomial, for example "Crassostrea gigas".');
    ["excitation_nm", "emission_nm"].forEach(k => { if (meta[k] === undefined || meta[k] === "") warnings.push(`Recommended field "${k}" is empty.`); });
    return { errors, warnings };
  }

  function validateSamples(samples) {
    const errors = [], warnings = [];
    if (!samples.length) { errors.push("No readings found."); return { errors, warnings }; }
    const animals = samples.filter(s => s.type === "sample"), blanks = samples.filter(s => s.type === "blank");
    if (!animals.length) errors.push('No rows with type "sample".');
    const list = (a) => a.slice(0, 5).join(", ") + (a.length > 5 ? ` and ${a.length - 5} more` : "");
    const noT0 = samples.filter(s => s.h[0] !== 0).map(s => s.id);
    if (noT0.length) errors.push(`${noT0.length} sample(s) have no reading at hour 0, which is the baseline for fold change: ${list(noT0)}.`);
    const few = samples.filter(s => s.h.length < 2).map(s => s.id);
    if (few.length) errors.push(`${few.length} sample(s) have fewer than two readings: ${list(few)}.`);
    const zero = samples.filter(s => s.h[0] === 0 && !(s.f[0] > 0)).map(s => s.id);
    if (zero.length) errors.push(`${zero.length} sample(s) have a hour-0 fluorescence of zero or less: ${list(zero)}.`);
    const noPlate = samples.filter(s => !s.plate).length;
    if (noPlate) errors.push(`${noPlate} sample(s) have an empty "plate".`);
    const noTemp = animals.filter(s => s.t === null).length;
    if (noTemp) errors.push(`${noTemp} sample(s) have no temperature_c. Temperature is required for every row of type "sample".`);
    const weird = animals.filter(s => s.t !== null && (s.t < -2 || s.t > 60)).length;
    if (weird) warnings.push(`${weird} sample(s) have a temperature_c outside -2 to 60. Check the units are Celsius.`);
    const plates = new Set(animals.map(s => s.plate)), bp = new Set(blanks.map(s => s.plate));
    const nb = [...plates].filter(p => !bp.has(p));
    if (nb.length) warnings.push(`${nb.length} plate(s) have no blank wells, so blank-corrected values cannot be calculated for them: ${list(nb)}.`);
    const noLen = animals.filter(s => s.len === null).length;
    if (noLen) warnings.push(`${noLen} of ${animals.length} sample(s) have no length_mm, so size-normalized values cannot be calculated for them.`);
    const badLen = animals.filter(s => s.len !== null && (s.len <= 0 || s.len > 400)).length;
    if (badLen) warnings.push(`${badLen} sample(s) have a length_mm outside 0 to 400. Check the units are millimetres.`);
    const badMort = animals.filter(s => s.mort && s.mort !== "alive" && s.mort !== "dead").length;
    if (badMort) warnings.push(`${badMort} sample(s) have a mortality value other than "alive" or "dead"; it is ignored.`);
    const maxH = Math.max(...samples.map(s => s.h[s.h.length - 1]));
    if (maxH > 72) warnings.push(`The longest series runs to hour ${maxH}. Check that "hour" is in hours, not minutes.`);
    return { errors, warnings };
  }

  /* ---------- normalization (same steps as the paper) ----------
     fold     = F_t / F_0
     fc       = fold - mean fold of blanks on the same plate at the same hour
     fmm      = fc / shell length (mm)
     end      = fold at the last reading
     rate     = fc at the last reading / hours elapsed (uses fold - 1 when the plate has no blanks) */
  function normalize(samples) {
    const blank = new Map();
    samples.forEach(s => {
      s.fold = s.f.map(v => v / s.f[0]);
      if (s.type === "blank" && !s.excl) s.h.forEach((h, i) => {
        const k = s.e + "|" + s.plate + "|" + h;
        const b = blank.get(k) || [0, 0]; b[0] += s.fold[i]; b[1]++; blank.set(k, b);
      });
    });
    samples.forEach(s => {
      s.fc = s.h.map((h, i) => { const b = blank.get(s.e + "|" + s.plate + "|" + h); return b ? s.fold[i] - b[0] / b[1] : null; });
      s.fmm = s.fc.map(v => (v === null || !s.len) ? null : v / s.len);
      const n = s.h.length - 1;
      s.end = s.fold[n];
      s.rate = s.h[n] > 0 ? (s.fc[n] !== null ? s.fc[n] : s.fold[n] - 1) / s.h[n] : null;
      s.rate_mm = (s.rate !== null && s.len) ? s.rate / s.len : null;
    });
    return samples;
  }

  function samplesToLongRows(samples) {
    const header = REQUIRED_COLS.concat(OPTIONAL_COLS);
    const rows = [];
    samples.forEach(s => s.h.forEach((h, i) => rows.push([s.id, s.plate, s.type, h, s.f[i], s.t, s.len, s.g, s.fam, s.mort, s.date, s.excl, s.notes])));
    return { header, rows };
  }

  const quantile = (sorted, p) => { if (!sorted.length) return null; const i = (sorted.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo); };

  /* median and quartiles of a metric at each hour across samples */
  function summarize(samples, key) {
    const by = new Map();
    samples.forEach(s => s.h.forEach((h, i) => { const v = s[key][i]; if (v === null || v === undefined || !isFinite(v)) return; (by.get(h) || by.set(h, []).get(h)).push(v); }));
    const hs = [...by.keys()].sort((a, b) => a - b);
    return hs.map(h => { const a = by.get(h).sort((x, y) => x - y); return { h, n: a.length, med: quantile(a, 0.5), q1: quantile(a, 0.25), q3: quantile(a, 0.75) }; });
  }

  const api = { REQUIRED_COLS, OPTIONAL_COLS, REQUIRED_META, RECOMMENDED_META, parseCSV, toCSV, readingsToSamples,
    validateMeta, validateSamples, normalize, samplesToLongRows, summarize, quantile };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.RZ = api;
})(typeof window !== "undefined" ? window : globalThis);
