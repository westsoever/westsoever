// Homepage: one full-screen grid of small ASCII glyphs.
// Intro (about 4.5s): orange static -> "the world is in your hands." decodes across the screen -> a white wave
// rolls out from the globe and leaves the resting page: a large globe you can drag, the sentence set small next to it.
(() => {
  const G = window.Globe;
  if (!G) return;
  const html = document.documentElement;
  const hint = document.getElementById('hint');
  // tones: 1 land, 2 sea (from globe.js), 3 white, 4 cream (both on orange), 5 ink
  const COLORS = [null, G.COLORS[1], G.COLORS[2], '#ffffff', '#ffc9a8', '#222222'];
  const ORANGE = COLORS[1];
  const LINES_WIDE = ['the world is', 'in your hands.'], LINES_NARROW = ['the world', 'is in your', 'hands.'];
  const FACE = '"Helvetica Neue Condensed Black", "HelveticaNeue-CondensedBlack", Impact, "Arial Black", sans-serif';
  const EDGE = ".:+#@";   // letter edges fade through lighter glyphs, the inside is solid
  const SCRAMBLE = '#%&@$*+=?/<>[]{}01';
  const T = { textIn: 350, textOut: 2700, wipe: 2950, wipeLen: 1300, rest: 4500 };

  const cv = document.createElement('canvas');
  cv.id = 'intro';
  cv.setAttribute('aria-hidden', 'true');
  document.body.appendChild(cv);
  const ctx = cv.getContext('2d');

  const clamp = (v) => Math.max(0, Math.min(1, v));
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const hash = (a, b) => {
    let h = Math.imul(a, 73856093) ^ Math.imul(b, 19349663);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };

  // ---------- layout ----------
  let W, H, dpr, aw, ah, cols, rows, atlas, big, restGrid, rnd, globe, far;

  // Rasterise lines of type and turn them into glyph cells: light glyphs on the edges, the sentence inside.
  function typeCells(lines, wCols, maxRows) {
    const SS = 4, sy = SS * ah / aw;
    const c = document.createElement('canvas'), g = c.getContext('2d');
    g.font = `100px ${FACE}`;
    const widest = Math.max(...lines.map((l) => g.measureText(l).width));
    let px = wCols * SS / widest * 100;
    const need = (p) => (lines.length - 1) * p * 0.86 + p * 1.02;
    if (maxRows && need(px) / sy > maxRows) px = px * maxRows * sy / need(px);
    const n = Math.ceil(need(px) / sy);
    c.width = wCols * SS; c.height = Math.ceil(n * sy);
    g.font = `${px}px ${FACE}`;
    g.textBaseline = 'alphabetic';
    lines.forEach((l, i) => g.fillText(l, 0, px * 0.78 + i * px * 0.86));
    const d = g.getImageData(0, 0, c.width, c.height).data;
    const code = new Uint8Array(wCols * n);
    let usedCols = 0;
    for (let j = 0; j < n; j++) for (let i = 0; i < wCols; i++) {
      let sum = 0, cnt = 0;
      for (let y = Math.floor(j * sy); y < Math.floor((j + 1) * sy); y++) for (let x = i * SS; x < (i + 1) * SS; x++) { sum += d[(y * c.width + x) * 4 + 3]; cnt++; }
      const cov = sum / cnt / 255;
      if (cov < 0.14) continue;
      code[j * wCols + i] = EDGE.charCodeAt(Math.min(4, Math.floor((cov - 0.14) / 0.86 * 5)));
      usedCols = Math.max(usedCols, i + 1);
    }
    return { cols: wCols, rows: n, code, usedCols };
  }

  function layout() {
    W = window.innerWidth; H = window.innerHeight;
    dpr = window.devicePixelRatio || 1;
    const narrow = W < 700;
    const fs = Math.max(7.5, Math.min(9, W / 150));
    aw = Math.round(fs * 0.6 * dpr); ah = Math.round(fs * 1.0 * dpr);   // one cell, in device pixels
    cols = Math.ceil(W * dpr / aw); rows = Math.ceil(H * dpr / ah);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);

    atlas = COLORS.map((col) => {
      if (!col) return null;
      const c = document.createElement('canvas'), g = c.getContext('2d');
      c.width = aw * 95; c.height = ah;
      g.font = `bold ${fs * dpr}px ${G.MONO}`;
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = col;
      for (let i = 0; i < 95; i++) g.fillText(String.fromCharCode(32 + i), (i + 0.5) * aw, ah / 2);
      return c;
    });

    rnd = new Float32Array(cols * rows);
    for (let i = 0; i < rnd.length; i++) rnd[i] = Math.random();

    const place = (m, c0, r0, grid, halo) => {
      for (let j = 0; j < m.rows; j++) for (let i = 0; i < m.cols; i++) {
        const k = m.code[j * m.cols + i], x = c0 + i, y = r0 + j;
        if (!k || x < 0 || y < 0 || x >= cols || y >= rows) continue;
        grid[y * cols + x] = k;
        if (halo) for (let dy = -1; dy <= 1; dy++) for (let dx = -2; dx <= 2; dx++) {
          const q = (y + dy) * cols + x + dx;
          if (x + dx >= 0 && x + dx < cols && y + dy >= 0 && y + dy < rows && !grid[q]) grid[q] = 1;
        }
      }
    };

    // intro: the sentence across the whole screen
    const lines = narrow ? LINES_NARROW : LINES_WIDE;
    const bm = typeCells(lines, Math.floor(cols * (narrow ? 0.86 : 0.84)), Math.floor(rows * 0.8));
    big = new Uint8Array(cols * rows);
    place(bm, Math.round((cols - bm.usedCols) / 2), Math.round((rows - bm.rows) / 2), big, false);

    // rest: the globe, and the sentence set small
    const cwCss = aw / dpr, chCss = ah / dpr, margin = Math.round(28 / cwCss);
    restGrid = new Uint8Array(cols * rows);
    if (narrow) {
      const r = Math.min(W * 0.62, H * 0.33);
      globe = { cx: W / 2, cy: H - r * 0.7, r };
      const sm = typeCells(lines, cols - margin * 2, Math.floor((globe.cy - r - 140) / chCss));
      place(sm, margin, Math.round(120 / chCss), restGrid, true);
    } else {
      const r = Math.min(H * 0.52, W * 0.34);
      globe = { cx: W - r * 0.84, cy: H * 0.54, r };
      const sm = typeCells(LINES_NARROW, Math.floor(cols * 0.37), Math.floor(rows * 0.55));
      place(sm, margin, rows - sm.rows - Math.round(26 / chCss), restGrid, true);
    }
    far = Math.max(...[[0, 0], [W, 0], [0, H], [W, H]].map(([x, y]) => Math.hypot(x - globe.cx, y - globe.cy))) + 120;
  }

  // ---------- drawing ----------
  const put = (tone, code, i, j) => ctx.drawImage(atlas[tone], (code - 32) * aw, 0, aw, ah, i * aw, j * ah, aw, ah);

  // What the resting page shows in a cell: tone << 8 | char code, or 0.
  function restCell(k, x, y) {
    const t = restGrid[k];
    if (t > 1) return 5 << 8 | t;
    if (t) return 0;
    const nx = (x - globe.cx) / globe.r;
    if (nx < -1.04 || nx > 1.04) return 0;
    return G.shade(nx, (globe.cy - y) / globe.r);
  }

  let spinOff = 0, tilt = G.TILT;
  function drawRest(ts) {
    G.setView(G.spinAt(ts) + spinOff, tilt);
    ctx.clearRect(0, 0, cv.width, cv.height);
    for (let j = 0; j < rows; j++) {
      const y = (j + 0.5) * ah / dpr;
      for (let i = 0; i < cols; i++) {
        const s = restCell(j * cols + i, (i + 0.5) * aw / dpr, y);
        if (s) put(s >> 8, s & 255, i, j);
      }
    }
  }

  function drawIntro(t, ts) {
    G.setView(G.spinAt(ts) + spinOff, tilt);
    const tick = Math.floor(t / 70) + 7919;
    const R = ease(clamp((t - T.wipe) / T.wipeLen)) * far;
    ctx.fillStyle = ORANGE;
    ctx.fillRect(0, 0, cv.width, cv.height);
    if (R > 0) {
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(globe.cx * dpr, globe.cy * dpr, R * dpr, 0, 7); ctx.fill();
    }
    for (let j = 0; j < rows; j++) {
      const y = (j + 0.5) * ah / dpr;
      for (let i = 0; i < cols; i++) {
        const k = j * cols + i, x = (i + 0.5) * aw / dpr, q = rnd[k];
        const scr = SCRAMBLE.charCodeAt(Math.floor(hash(k, tick) * SCRAMBLE.length));
        const behind = R - Math.hypot(x - globe.cx, y - globe.cy);   // how far the wave is past this cell
        if (behind > 0) {
          const s = restCell(k, x, y);
          if (behind < 30 + q * 110) { if (s || q < 0.3) put(s ? s >> 8 : 2, scr, i, j); }
          else if (s) put(s >> 8, s & 255, i, j);
          continue;
        }
        if (R > 0 && behind > -26) { put(3, scr, i, j); continue; }   // white crest of the wave
        const b = big[k];
        if (b) {
          const tin = T.textIn + (i / cols) * 700 + q * 350, tout = T.textOut + q * 450;
          if (t > tin && t < tout) { put(3, t < tin + 220 || t > tout - 160 ? scr : b, i, j); continue; }
        }
        if (hash(k, Math.floor(t / 130)) < 0.018) put(4, scr, i, j);      // static
      }
    }
  }

  // ---------- drag: the world is in your hands ----------
  let drag = null, vel = 0, dirty = true;
  const onGlobe = (e) => Math.hypot(e.clientX - globe.cx, e.clientY - globe.cy) < globe.r;
  cv.addEventListener('pointerdown', (e) => {
    if (!resting || !onGlobe(e)) return;
    drag = { x: e.clientX, y: e.clientY, t: e.timeStamp };
    vel = 0;
    cv.setPointerCapture(e.pointerId);
    cv.style.cursor = 'grabbing';
    if (hint) hint.classList.add('done');
    e.preventDefault();
  });
  cv.addEventListener('pointermove', (e) => {
    if (!drag) { cv.style.cursor = resting && onGlobe(e) ? 'grab' : ''; return; }
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y, dt = Math.max(1, e.timeStamp - drag.t);
    spinOff -= dx / globe.r;
    tilt = Math.max(-0.5, Math.min(1.2, tilt + dy / globe.r));
    vel = -dx / globe.r / dt;
    drag = { x: e.clientX, y: e.clientY, t: e.timeStamp };
    dirty = true;
  });
  const drop = () => { if (drag) { drag = null; cv.style.cursor = ''; } };
  cv.addEventListener('pointerup', drop);
  cv.addEventListener('pointercancel', drop);

  // ---------- main loop ----------
  const FREEZE = new URLSearchParams(location.search).get("t");
  let resting = false, t0 = null, lastDraw = 0, lastTs = 0;
  function toRest() {
    resting = true;
    dirty = true;
    html.classList.remove('intro', 'intro-orange');
    cv.classList.add('rest');
  }
  function frame(ts) {
    if (t0 === null) t0 = ts;
    const t = FREEZE === null ? ts - t0 : +FREEZE, dt = ts - lastTs;   // ?t=2000 holds the intro at that moment, for checking a frame
    lastTs = ts;
    if (!drag && vel) {                       // a thrown globe keeps turning for a moment
      spinOff += vel * dt;
      vel *= Math.pow(0.996, dt);
      if (Math.abs(vel) < 0.00002) vel = 0;
      dirty = true;
    }
    if (!resting) {
      if (t >= T.rest) toRest(); else drawIntro(t, ts);
    }
    if (resting && (dirty || (!G.still && ts - lastDraw > 33))) {
      lastDraw = ts; dirty = false;
      drawRest(ts);
    }
    requestAnimationFrame(frame);
  }

  layout();
  window.addEventListener('resize', () => { layout(); dirty = true; });
  window.addEventListener('pagehide', () => { G.saveSpin(spinOff); });
  // The intro plays on the first arrival of a visit and on a reload, not each time you come back from a subpage.
  const reload = (performance.getEntriesByType('navigation')[0] || {}).type === 'reload';
  if (G.still || (G.store('ws-intro') && !reload && FREEZE === null)) toRest();
  G.store('ws-intro', 1);
  requestAnimationFrame(frame);
})();
