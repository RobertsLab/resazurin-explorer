/* Minimal canvas charts for the Resazurin Explorer: line panels and scatter plots.
   No dependencies. Text uses ink colors; series colors carry identity only. */
(function (root) {
  "use strict";
  const INK = "#0b0b0b", INK2 = "#52514e", MUTED = "#8a8983", GRID = "#e6e5e0";
  const FONT = '12px system-ui, -apple-system, "Segoe UI", sans-serif';

  function niceTicks(lo, hi, n) {
    const span = hi - lo || 1, step0 = Math.pow(10, Math.floor(Math.log10(span / n)));
    const step = [1, 2, 2.5, 5, 10].map(m => m * step0).find(s => span / s <= n) || step0 * 10;
    const out = []; for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(+v.toPrecision(12));
    return out;
  }
  function logTicks(lo, hi) {
    const out = [];
    for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++)
      [1, 2, 5].forEach(m => { const v = m * Math.pow(10, e); if (v >= lo * 0.999 && v <= hi * 1.001) out.push(v); });
    return out.length > 9 ? out.filter(v => /^1/.test(v.toExponential())) : out;
  }
  const fmt = v => { const a = Math.abs(v); if (a === 0) return "0"; if (a >= 10000) return (v / 1000).toPrecision(3).replace(/\.?0+$/, "") + "k"; if (a >= 100) return v.toFixed(0); if (a >= 1) return String(+v.toPrecision(3)); return String(+v.toPrecision(2)); };

  function setup(el, height) {
    el.innerHTML = "";
    el.style.position = "relative";
    const cv = document.createElement("canvas"), tip = document.createElement("div");
    const w = Math.max(220, el.clientWidth || 400), dpr = window.devicePixelRatio || 1;
    cv.width = w * dpr; cv.height = height * dpr; cv.style.width = w + "px"; cv.style.height = height + "px"; cv.style.display = "block";
    tip.className = "chart-tip"; tip.style.display = "none";
    el.appendChild(cv); el.appendChild(tip);
    const ctx = cv.getContext("2d"); ctx.scale(dpr, dpr); ctx.font = FONT;
    return { cv, ctx, tip, w, h: height };
  }

  function axes(c, o, xd, yd, m) {
    const { ctx, w, h } = c, log = o.log;
    const X = v => m.l + (v - xd[0]) / (xd[1] - xd[0] || 1) * (w - m.l - m.r);
    const Y = log ? v => h - m.b - (Math.log10(Math.max(v, yd[0])) - Math.log10(yd[0])) / (Math.log10(yd[1]) - Math.log10(yd[0]) || 1) * (h - m.t - m.b)
                  : v => h - m.b - (v - yd[0]) / (yd[1] - yd[0] || 1) * (h - m.t - m.b);
    ctx.clearRect(0, 0, w, h);
    if (o.shade) { ctx.fillStyle = "#f6e3d8"; ctx.fillRect(X(o.shade[0]), m.t, X(o.shade[1]) - X(o.shade[0]), h - m.t - m.b); }
    ctx.lineWidth = 1; ctx.textBaseline = "middle"; ctx.textAlign = "right";
    (log ? logTicks(yd[0], yd[1]) : niceTicks(yd[0], yd[1], 5)).forEach(v => {
      const y = Math.round(Y(v)) + 0.5;
      ctx.strokeStyle = GRID; ctx.beginPath(); ctx.moveTo(m.l, y); ctx.lineTo(w - m.r, y); ctx.stroke();
      ctx.fillStyle = INK2; ctx.fillText((o.yFmt || fmt)(v), m.l - 6, y);
    });
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    (o.xTicks || niceTicks(xd[0], xd[1], 7)).forEach(v => { if (v < xd[0] || v > xd[1]) return; ctx.fillStyle = INK2; ctx.fillText(fmt(v), X(v), h - m.b + 6); });
    ctx.strokeStyle = MUTED; ctx.beginPath(); ctx.moveTo(m.l, h - m.b + 0.5); ctx.lineTo(w - m.r, h - m.b + 0.5); ctx.stroke();
    ctx.fillStyle = INK2;
    if (o.xLabel) ctx.fillText(o.xLabel, (m.l + w - m.r) / 2, h - 16);
    if (o.yLabel) { ctx.save(); ctx.translate(12, (m.t + h - m.b) / 2); ctx.rotate(-Math.PI / 2); ctx.textBaseline = "middle"; ctx.fillText(o.yLabel, 0, 0); ctx.restore(); }
    if (o.title) { ctx.textAlign = "left"; ctx.textBaseline = "top"; ctx.fillStyle = INK; ctx.font = "600 12.5px system-ui, sans-serif"; ctx.fillText(o.title, m.l, 4); ctx.font = FONT; }
    if (o.subtitle) { ctx.textAlign = "left"; ctx.textBaseline = "top"; ctx.fillStyle = INK2; ctx.fillText(o.subtitle, m.l, 20); }
    return { X, Y };
  }

  function domain(vals, log, pad) {
    let lo = Infinity, hi = -Infinity;
    for (const v of vals) { if (v === null || !isFinite(v) || (log && v <= 0)) continue; if (v < lo) lo = v; if (v > hi) hi = v; }
    if (lo === Infinity) return log ? [0.5, 2] : [0, 1];
    if (log) return [lo / (pad || 1.15), hi * (pad || 1.15)];
    const p = (hi - lo || 1) * 0.06; return [lo - p, hi + p];
  }

  /* opts.series: [{pts:[[x,y],...], color, width, alpha, dash, label, band:[[x,lo,hi],...], hover:true, n}] */
  function lines(el, o) {
    const c = setup(el, o.height || 300), { ctx } = c;
    const m = { l: 58, r: 12, t: o.subtitle ? 40 : (o.title ? 26 : 10), b: 46 };
    const xs = [], ys = [];
    o.series.forEach(s => { s.pts.forEach(p => { xs.push(p[0]); ys.push(p[1]); }); (s.band || []).forEach(b => { ys.push(b[1], b[2]); }); });
    const xd = o.xDomain || [0, Math.max(1, ...xs)], yd = o.yDomain || domain(ys, o.log);
    function draw(hi) {
      const { X, Y } = axes(c, o, xd, yd, m);
      ctx.save(); ctx.beginPath(); ctx.rect(m.l, m.t - 2, c.w - m.l - m.r, c.h - m.t - m.b + 4); ctx.clip();
      o.series.forEach(s => {
        if (s.band && s.band.length) {
          ctx.globalAlpha = 0.16; ctx.fillStyle = s.color; ctx.beginPath();
          s.band.forEach((b, i) => { const x = X(b[0]), y = Y(b[2]); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
          for (let i = s.band.length - 1; i >= 0; i--) ctx.lineTo(X(s.band[i][0]), Y(s.band[i][1]));
          ctx.closePath(); ctx.fill();
        }
      });
      const stroke = (s, width, alpha) => {
        const pts = s.pts.filter(p => p[1] !== null && isFinite(p[1]) && (!o.log || p[1] > 0));
        if (!pts.length) return;
        ctx.globalAlpha = alpha; ctx.strokeStyle = s.color; ctx.lineWidth = width; ctx.lineJoin = "round"; ctx.lineCap = "round";
        ctx.setLineDash(s.dash || []); ctx.beginPath();
        pts.forEach((p, i) => { const x = X(p[0]), y = Y(p[1]); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
        ctx.stroke(); ctx.setLineDash([]);
      };
      o.series.forEach(s => { if (!s.hover) stroke(s, s.width || 1, s.alpha === undefined ? 1 : s.alpha); });
      o.series.forEach(s => { if (s.hover) { stroke({ pts: s.pts, color: "#fff" }, (s.width || 2) + 2, 1); stroke(s, s.width || 2, s.alpha === undefined ? 1 : s.alpha); } });
      if (hi) {
        stroke({ pts: hi.s.pts, color: "#fff" }, (hi.s.width || 2) + 4, 1); stroke(hi.s, (hi.s.width || 2) + 1.5, 1);
        ctx.globalAlpha = 1; ctx.fillStyle = hi.s.color; ctx.strokeStyle = "#fff"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(X(hi.p[0]), Y(hi.p[1]), 4.5, 0, 7); ctx.fill(); ctx.stroke();
      }
      ctx.restore(); ctx.globalAlpha = 1;
      return { X, Y };
    }
    let sc = draw(null);
    const hov = o.series.filter(s => s.hover);
    c.cv.addEventListener("mousemove", ev => {
      const r = c.cv.getBoundingClientRect(), mx = ev.clientX - r.left, my = ev.clientY - r.top;
      let best = null, bd = 28 * 28;
      hov.forEach(s => s.pts.forEach(p => { if (p[1] === null || (o.log && p[1] <= 0)) return; const dx = sc.X(p[0]) - mx, dy = sc.Y(p[1]) - my, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = { s, p }; } }));
      sc = draw(best);
      if (best) {
        c.tip.innerHTML = `<span class="sw" style="background:${best.s.color}"></span><b>${best.s.label}</b><br>hour ${fmt(best.p[0])}: ${(o.yFmt || fmt)(best.p[1])}` + (best.p[2] ? `<br>n = ${best.p[2]}` : "");
        c.tip.style.display = "block";
        const tx = Math.min(sc.X(best.p[0]) + 12, c.w - 190); c.tip.style.left = tx + "px"; c.tip.style.top = Math.max(0, sc.Y(best.p[1]) - 54) + "px";
      } else c.tip.style.display = "none";
    });
    c.cv.addEventListener("mouseleave", () => { c.tip.style.display = "none"; sc = draw(null); });
  }

  /* opts.groups: [{pts:[[x,y,label],...], color, size, alpha, ring, label}] drawn in order */
  function scatter(el, o) {
    const c = setup(el, o.height || 300), { ctx } = c;
    const m = { l: 58, r: 12, t: o.subtitle ? 40 : (o.title ? 26 : 10), b: 46 };
    const xs = [], ys = [];
    o.groups.forEach(g => g.pts.forEach(p => { xs.push(p[0]); ys.push(o.floor ? Math.max(p[1], o.floor) : p[1]); }));
    const xd = o.xDomain || domain(xs, false), yd = o.yDomain || domain(ys, o.log, 1.3);
    const all = [];
    function draw(hi) {
      const { X, Y } = axes(c, o, xd, yd, m);
      all.length = 0;
      o.groups.forEach(g => {
        ctx.globalAlpha = g.alpha === undefined ? 0.5 : g.alpha; ctx.fillStyle = g.color;
        g.pts.forEach(p => {
          const y = o.floor ? Math.max(p[1], o.floor) : p[1]; if (o.log && y <= 0) return;
          const px = X(p[0]), py = Y(y); all.push({ px, py, p, g });
          ctx.beginPath(); ctx.arc(px, py, g.size || 2.5, 0, 7); ctx.fill();
          if (g.ring) { ctx.globalAlpha = 1; ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.2; ctx.stroke(); ctx.globalAlpha = g.alpha === undefined ? 0.5 : g.alpha; }
        });
      });
      ctx.globalAlpha = 1;
      if (hi) { ctx.fillStyle = hi.g.color; ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(hi.px, hi.py, (hi.g.size || 2.5) + 2.5, 0, 7); ctx.fill(); ctx.stroke(); }
    }
    draw(null);
    c.cv.addEventListener("mousemove", ev => {
      const r = c.cv.getBoundingClientRect(), mx = ev.clientX - r.left, my = ev.clientY - r.top;
      let best = null, bd = 100;
      for (let i = all.length - 1; i >= 0; i--) { const a = all[i], d = (a.px - mx) ** 2 + (a.py - my) ** 2; if (d < bd) { bd = d; best = a; } }
      draw(best);
      if (best) {
        c.tip.innerHTML = `<span class="sw" style="background:${best.g.color}"></span><b>${best.p[2] || best.g.label}</b><br>${o.xLabel}: ${fmt(best.p[0])}<br>${o.yShort || o.yLabel}: ${fmt(best.p[1])}`;
        c.tip.style.display = "block"; c.tip.style.left = Math.min(best.px + 12, c.w - 210) + "px"; c.tip.style.top = Math.max(0, best.py - 60) + "px";
      } else c.tip.style.display = "none";
    });
    c.cv.addEventListener("mouseleave", () => { c.tip.style.display = "none"; draw(null); });
  }

  root.RZChart = { lines, scatter, domain, fmt };
})(window);
