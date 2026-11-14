// ASCII cumulus clouds drifting slowly from left to right across the bottom half of the page.
// Each cloud is a row of overlapping puffs on a flat base, fluffed at the edges with noise.
(() => {
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const cv = document.createElement('canvas');
  cv.id = 'clouds';
  cv.setAttribute('aria-hidden', 'true');
  document.body.appendChild(cv);
  const ctx = cv.getContext('2d');
  const BLUE = '#9ccdf2';            // light azure, opposite the site's orange on the colour wheel
  const EDGE = '.:', BODY = '-=+*#'; // thin glyphs on the rim, denser towards the shaded base
  const FS = 11, CW = FS * 0.6, CH = FS * 1.12;

  const hash = (a, b) => {
    let h = Math.imul(a, 73856093) ^ Math.imul(b, 19349663);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const noise = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    let tx = x - xi, ty = y - yi;
    tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
    const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  };
  let seed = 7;
  const rnd = () => hash(seed++, 1013);

  let cols, rows, W, H, clouds, grid;
  function size() {
    const dpr = window.devicePixelRatio || 1;
    W = cv.clientWidth; H = cv.clientHeight;
    cols = Math.ceil(W / CW); rows = Math.ceil(H / CH);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = `bold ${FS}px ui-monospace, Menlo, Consolas, monospace`;
    ctx.textBaseline = 'top';
    ctx.fillStyle = BLUE;
    grid = new Uint8Array(cols * rows);

    // Clouds, in pixels. Same seed every time, so the sky does not reshuffle on resize.
    seed = 7;
    clouds = [];
    const n = Math.max(5, Math.round(W / 200));
    for (let k = 0; k < n; k++) {
      const w = 150 + rnd() * 260, big = 0.75 + rnd() * 0.5;
      const puffs = [];
      const m = Math.max(3, Math.round(w / 32));
      for (let p = 0; p < m; p++) {
        const u = (p + 0.5) / m, mid = 1 - Math.abs(u - 0.5) * 1.5;      // taller in the middle
        const r = (25 + rnd() * 27) * big * (0.5 + 0.7 * mid);
        puffs.push({ x: (u - 0.5) * w + (rnd() - 0.5) * 16, y: -r * (0.3 + rnd() * 0.35), r });
      }
      clouds.push({
        x: (k + rnd() * 0.7) / n * (W + 700), y: H * (0.2 + 0.78 * ((k * 0.618 + rnd() * 0.2) % 1)),
        w, puffs, speed: 4 + rnd() * 3.5, seed: k * 37.1, top: Math.max(...puffs.map((p) => p.r - p.y)),
      });
    }
  }

  // Page text the clouds must stay clear of: one box per line of text, in page coordinates.
  let boxes = [];
  function measure() {
    boxes = [];
    const range = document.createRange();
    for (const root of document.querySelectorAll('#content, #masthead, #primary')) {
      const fixed = getComputedStyle(root).position === 'fixed';
      const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n = walk.nextNode(); n; n = walk.nextNode()) {
        if (!n.nodeValue.trim()) continue;
        range.selectNodeContents(n);
        for (const r of range.getClientRects()) boxes.push({ x0: r.left - 3, x1: r.right + 3, y0: r.top + 4 + (fixed ? 0 : scrollY), y1: r.bottom - 4 + (fixed ? 0 : scrollY), fixed });
      }
    }
  }

  function draw(now) {
    grid.fill(0);
    const top = innerHeight - H;                         // the canvas sits at the bottom of the window
    for (const b of boxes) {
      const y0 = b.y0 - (b.fixed ? 0 : scrollY) - top, y1 = b.y1 - (b.fixed ? 0 : scrollY) - top;
      if (y1 < 0 || y0 > H) continue;
      const j0 = Math.max(0, Math.floor(y0 / CH)), j1 = Math.min(rows - 1, Math.floor(y1 / CH));
      const i0 = Math.max(0, Math.floor(b.x0 / CW)), i1 = Math.min(cols - 1, Math.floor(b.x1 / CW));
      for (let j = j0; j <= j1; j++) grid.fill(1, j * cols + i0, j * cols + i1 + 1);   // 1 = keep clear
    }
    const span = W + 700;
    for (const c of clouds) {
      const cx = ((c.x + now / 1000 * c.speed) % span + span) % span - 350;   // drifts right, wraps round
      const i0 = Math.max(0, Math.floor((cx - c.w / 2 - 80) / CW)), i1 = Math.min(cols - 1, Math.ceil((cx + c.w / 2 + 80) / CW));
      const j0 = Math.max(0, Math.floor((c.y - c.top - 14) / CH)), j1 = Math.min(rows - 1, Math.ceil((c.y + 8) / CH));
      for (let j = j0; j <= j1; j++) {
        const y = (j + 0.5) * CH - c.y;                 // 0 at the base, negative above it
        if (y > 5) continue;
        for (let i = i0; i <= i1; i++) {
          const x = (i + 0.5) * CW - cx;
          let d = -1;
          for (const p of c.puffs) d = Math.max(d, 1 - Math.hypot(x - p.x, y - p.y) / p.r);
          d += (noise(x * 0.045 + c.seed, y * 0.07) - 0.5) * 0.5;       // fluffy rim, travels with the cloud
          if (y > -6) d -= (y + 6) / 9;                                   // flat base
          if (d <= 0.04 || grid[j * cols + i] === 1) continue;
          const shade = Math.max(0, Math.min(1, 1 + y / c.top));          // 0 at the top, 1 at the base
          grid[j * cols + i] = d < 0.13 ? EDGE.charCodeAt(0) : d < 0.24 ? EDGE.charCodeAt(1)
            : BODY.charCodeAt(Math.min(4, Math.floor((shade * shade * 0.6 + Math.min(d, 0.8) * 0.5) * 5)));
        }
      }
    }
    ctx.clearRect(0, 0, W, H);
    for (let j = 0; j < rows; j++) {
      let line = '', any = false;
      for (let i = 0; i < cols; i++) { const k = grid[j * cols + i]; line += k > 1 ? String.fromCharCode(k) : ' '; any = any || k > 1; }
      if (any) ctx.fillText(line, 0, j * CH);            // a row of monospace text is one draw call
    }
  }

  // The shared clock (globe.js) keeps running across page loads, so the clouds carry on where they were.
  const clock = window.Globe ? window.Globe.clock : () => performance.now();
  let last = 0;
  const redraw = () => draw(still ? 0 : clock());
  size(); measure(); redraw();
  window.addEventListener('resize', () => { size(); measure(); redraw(); });
  window.addEventListener('load', () => { measure(); redraw(); });
  window.addEventListener('scroll', redraw, { passive: true });
  if (still) return;
  const tick = (now) => {
    if (now - last >= 80) { last = now; redraw(); }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})();
