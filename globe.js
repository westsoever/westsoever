// Spinning ASCII globe in the top-right corner of every page.
// Land mask: Natural Earth 110m land, 96x48 equirectangular, one hex string per row from 90N down, bit set = land.
(() => {
  const MASK = [
    '000000000000000000000000', '000000000000000000000000', '000003fbfff0000c00400000', '000082e7ffe0080000180000',
    '0001d7d07fc0000207ff4000', '0fef7d4c3f800780afffffff', 'dfffff8c3c301d9fffffffff', '0ffffe1818007bffffffffee',
    '020ffe1e000011fffffffc20', '0007ffdf80012ffffffff820', '0003ffff0001fffffffff800', '0001fffe0001fffffffff800',
    '0001fff80003961ffffff600', '0001fff000072dffffffc400', '0000fff00002e03fffff2800', '00007fc00007f67fffff0000',
    '00003c200007fffbffff0000', '00001c00000fffbe3fff0000', '00000c90000fffdf1e700000', '00000700000fffdc0c788000',
    '00000040000fffe008380000', '0000000f000ffff80c014000', '0000001fc0077ff800010000', '0000001fe0001ff000320000',
    '0000003ff0003fe000161000', '0000003ffe001fc000000600', '0000001ffe001fe000000100', '0000000ffc001fe000001000',
    '00000007fc001fc800007a00', '00000007f8000f880001ff00', '00000007e0000f880003ff80', '00000007e0000f800003ff80',
    '00000007c00007000001df80', '000000078000000000000702', '0000000e0000000000000002', '000000060000000000000004',
    '0000000c0000000000000000', '0000000c0000000000000000', '000000040000000000000000', '000000000000000000000000',
    '000000000000000000000000', '000000000000000000000000', '000000020000005fe7ffffc0', '00000c87000ffffffffffff8',
    '00ffffe000fffffffffffff0', '007ffff930ffffffffffffe0', 'a0fffffffffffffffffffffe', 'ffffffffffffffffffffffff',
  ];
  const BITS = new Uint8Array(48 * 96);
  for (let r = 0; r < 48; r++) for (let c = 0; c < 96; c++) BITS[r * 96 + c] = (parseInt(MASK[r][c >> 2], 16) >> (3 - (c & 3))) & 1;
  const bit = (r, c) => BITS[Math.max(0, Math.min(47, r)) * 96 + ((c % 96) + 96) % 96];
  // Land coverage 0..1, bilinear between mask cells so coastlines stay smooth on a big globe.
  const land = (lat, lon) => {
    const fy = (90 - lat) / 180 * 48 - 0.5, fx = (lon + 180) / 360 * 96 - 0.5;
    const r = Math.floor(fy), c = Math.floor(fx), ty = fy - r, tx = fx - c;
    return (bit(r, c) * (1 - tx) + bit(r, c + 1) * tx) * (1 - ty) + (bit(r + 1, c) * (1 - tx) + bit(r + 1, c + 1) * tx) * ty;
  };
  const hash = (a, b) => {
    let h = Math.imul(a, 73856093) ^ Math.imul(b, 19349663);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };

  const DEG = Math.PI / 180;
  const TILT = 25 * DEG;          // north pole leans towards the viewer
  const START = 10 * DEG;         // start over Europe
  const PERIOD = 40000;           // ms per turn
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // One clock, so every globe shows the same longitude. Features drift left to right, like the real Earth.
  // The clock runs on across page loads (it starts at the first page of the visit), so the globe and the
  // clouds carry on where they were when you move between pages instead of starting over.
  const store = (k, v) => { try { return v === undefined ? sessionStorage.getItem(k) : sessionStorage.setItem(k, v); } catch (e) { return null; } };
  if (!store('ws-epoch')) store('ws-epoch', Date.now());
  const EPOCH = +store('ws-epoch') || Date.now();
  const clock = () => Date.now() - EPOCH;
  const TURNED = +store('ws-spin') || 0;   // how far the visitor has turned the globe by hand
  const spinAt = () => (still ? START : START - (clock() / PERIOD) * 2 * Math.PI) + TURNED;
  const saveSpin = (extra) => store('ws-spin', TURNED + extra);

  // Shading: light from the upper left. Land gets dense glyphs, sea sparse ones; both thin out towards the night side.
  const LX = -0.50, LY = 0.48, LZ = 0.72;
  const LAND = ':=+*#%@', SEA = '  ..:';
  const TONE_LAND = 1, TONE_SEA = 2;
  let spin = START, ct = Math.cos(TILT), st = Math.sin(TILT);
  const setView = (s, tilt = TILT) => { spin = s; ct = Math.cos(tilt); st = Math.sin(tilt); };
  // (x, y) in the unit disk, y up. Returns 0 for nothing, else tone << 8 | char code.
  const shade = (x, y) => {
    const d = x * x + y * y;
    if (d > 1) return d < 1.07 && x * LX + y * LY > 0.35 ? TONE_SEA << 8 | 46 : 0; // thin atmosphere on the lit limb
    const z = Math.sqrt(1 - d);
    const yw = y * ct + z * st, zw = z * ct - y * st;
    const lat = Math.asin(Math.max(-1, Math.min(1, yw))) / DEG;
    const lon = (((Math.atan2(x, zw) + spin) / DEG + 180) % 360 + 360) % 360 - 180;
    const lum = Math.max(0, x * LX + y * LY + z * LZ);
    const tex = hash(Math.floor(lat / 2.2), Math.floor(lon / 2.2));
    if (land(lat, lon) > 0.5) {
      const v = 0.16 + 0.84 * lum + (tex - 0.5) * 0.34;
      return TONE_LAND << 8 | LAND.charCodeAt(Math.max(0, Math.min(6, Math.floor(v * 7))));
    }
    const v = 0.1 + 0.9 * lum + (tex - 0.5) * 0.3;
    const k = SEA.charCodeAt(Math.max(0, Math.min(4, Math.floor(v * 5))));
    return k === 32 ? 0 : TONE_SEA << 8 | k;
  };
  const COLORS = [null, '#ff5f00', '#ffa870'];
  const MONO = 'ui-monospace, Menlo, Consolas, monospace';
  window.Globe = { spinAt, clock, store, saveSpin, setView, shade, still, TILT, COLORS, MONO };

  const cv = document.createElement('canvas');
  cv.id = 'globe';
  cv.setAttribute('aria-hidden', 'true');
  document.body.appendChild(cv);
  const ctx = cv.getContext('2d');
  let cols, rows, cw, ch;

  function size() {
    const px = cv.clientWidth, dpr = window.devicePixelRatio || 1;
    cols = 0;
    if (!px) return;
    const fs = Math.max(5, px / 28);
    cw = fs * 0.6; ch = fs;
    cols = Math.floor(px / cw); rows = Math.floor(px / ch);
    cv.width = cv.height = Math.round(px * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = `bold ${fs}px ${MONO}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
  }

  function draw(now) {
    if (!cols) return;
    setView(spinAt(now));
    ctx.clearRect(0, 0, cv.width, cv.height);
    const r = cols * cw / 2 / 1.07;
    for (let tone = 1; tone <= 2; tone++) {
      ctx.fillStyle = COLORS[tone];
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
        const s = shade(((i + 0.5) * cw - cols * cw / 2) / r, (rows * ch / 2 - (j + 0.5) * ch) / r);
        if (s >> 8 === tone) ctx.fillText(String.fromCharCode(s & 255), (i + 0.5) * cw, (j + 0.5) * ch);
      }
    }
  }

  let last = performance.now();
  size();
  draw(last);
  window.addEventListener('resize', () => { size(); draw(last); });

  if (still || !cols) return;
  const tick = (now) => {
    if (now - last >= 100) { last = now; draw(now); } // 10fps is plenty for a slow turn
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})();
