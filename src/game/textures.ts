import { mulberry32, TAU } from './rules';

export interface ProceduralTextures {
  sandFar: CanvasPattern | null;
  sandMid: CanvasPattern | null;
  sandNear: CanvasPattern | null;
  mesaStrata: CanvasPattern | null;
  trackSurface: CanvasPattern | null;
  woodGrain: CanvasPattern | null;
  rockSurface: CanvasPattern | null;
  cactusSkin: CanvasPattern | null;
  furGrain: CanvasPattern | null;
}

let cachedTextures: ProceduralTextures | null = null;

function createOffscreen(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  return [c, ctx];
}

function makeSandTile(
  baseColor: string,
  lightColor: string,
  darkColor: string,
  rippleSpacing: number,
  seed: number
): HTMLCanvasElement {
  const w = 256;
  const h = 128;
  const [c, ctx] = createOffscreen(w, h);
  const rnd = mulberry32(seed);

  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, w, h);

  // Wind-swept sand ripples (tileable horizontally)
  ctx.lineWidth = 1.6;
  for (let y = 4; y < h; y += rippleSpacing) {
    // Shadow trough
    ctx.strokeStyle = darkColor;
    ctx.globalAlpha = 0.22;
    ctx.beginPath();
    for (let x = 0; x <= w; x += 8) {
      const u = (x / w) * TAU;
      const dy = Math.sin(u * 2 + y * 0.15) * 2.2 + Math.cos(u + y * 0.08) * 1.2;
      if (x === 0) ctx.moveTo(x, y + dy);
      else ctx.lineTo(x, y + dy);
    }
    ctx.stroke();

    // Sunlit ridge crest
    ctx.strokeStyle = lightColor;
    ctx.globalAlpha = 0.28;
    ctx.beginPath();
    for (let x = 0; x <= w; x += 8) {
      const u = (x / w) * TAU;
      const dy = Math.sin(u * 2 + y * 0.15) * 2.2 + Math.cos(u + y * 0.08) * 1.2 - 1.5;
      if (x === 0) ctx.moveTo(x, y + dy);
      else ctx.lineTo(x, y + dy);
    }
    ctx.stroke();
  }

  // Fine mineral sand grains
  for (let i = 0; i < 900; i++) {
    const gx = rnd() * w;
    const gy = rnd() * h;
    const isLight = rnd() > 0.48;
    ctx.fillStyle = isLight ? lightColor : darkColor;
    ctx.globalAlpha = 0.08 + rnd() * 0.16;
    const sz = rnd() > 0.85 ? 2 : 1.2;
    ctx.fillRect(gx, gy, sz, sz);
  }

  ctx.globalAlpha = 1;
  return c;
}

function makeMesaTile(seed: number): HTMLCanvasElement {
  const w = 256;
  const h = 256;
  const [c, ctx] = createOffscreen(w, h);
  const rnd = mulberry32(seed);

  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#d88c5e');
  g.addColorStop(0.35, '#c7774b');
  g.addColorStop(0.7, '#b2623c');
  g.addColorStop(1, '#964e2e');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // Sedimentary geological strata bands
  const bands = [
    [14, 8, '#f0b684', 0.28],
    [32, 5, '#8c4326', 0.26],
    [54, 12, '#e29b6b', 0.24],
    [82, 6, '#7d391e', 0.3],
    [108, 14, '#eba97a', 0.22],
    [136, 7, '#823c20', 0.28],
    [164, 10, '#df9566', 0.25],
    [194, 6, '#733219', 0.3],
    [222, 12, '#cfa078', 0.2],
  ] as const;

  for (const [by, bh, col, alpha] of bands) {
    ctx.fillStyle = col;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.moveTo(0, by);
    for (let x = 0; x <= w; x += 16) {
      const u = (x / w) * TAU;
      ctx.lineTo(x, by + Math.sin(u * 2 + by) * 1.8);
    }
    for (let x = w; x >= 0; x -= 16) {
      const u = (x / w) * TAU;
      ctx.lineTo(x, by + bh + Math.sin(u * 2 + by) * 1.8);
    }
    ctx.closePath();
    ctx.fill();
  }

  // Vertical erosion fissures
  ctx.strokeStyle = '#6b2e16';
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 18; i++) {
    const vx = rnd() * w;
    const vy = rnd() * (h - 40);
    const len = 18 + rnd() * 44;
    ctx.globalAlpha = 0.14 + rnd() * 0.14;
    ctx.beginPath();
    ctx.moveTo(vx, vy);
    ctx.lineTo(vx + (rnd() - 0.5) * 4, vy + len * 0.5);
    ctx.lineTo(vx + (rnd() - 0.5) * 6, vy + len);
    ctx.stroke();
  }

  // Rock grain speckles
  for (let i = 0; i < 500; i++) {
    ctx.fillStyle = rnd() > 0.5 ? '#ffcaa0' : '#632b15';
    ctx.globalAlpha = 0.08 + rnd() * 0.12;
    ctx.fillRect(rnd() * w, rnd() * h, 1.5, 1.5);
  }

  ctx.globalAlpha = 1;
  return c;
}

function makeTrackTile(seed: number): HTMLCanvasElement {
  const w = 256;
  const h = 224;
  const [c, ctx] = createOffscreen(w, h);
  const rnd = mulberry32(seed);

  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#d8a25e');
  g.addColorStop(0.14, '#e5b472');
  g.addColorStop(0.45, '#dead6b');
  g.addColorStop(0.75, '#c98e4b');
  g.addColorStop(1, '#995f29');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // 4 packed lane ruts corresponding to lanes 3, 2, 1, 0 (y = 36, 66, 98, 130 from HORIZON_Y=512)
  const rutYs = [36, 66, 98, 130];
  for (const ry of rutYs) {
    ctx.fillStyle = 'rgba(255, 242, 210, 0.24)';
    ctx.fillRect(0, ry - 7, w, 12);
    ctx.fillStyle = 'rgba(105, 58, 20, 0.20)';
    ctx.fillRect(0, ry + 5, w, 2.5);
  }

  // Fine gravel & packed dirt noise
  for (let i = 0; i < 1600; i++) {
    const gx = rnd() * w;
    const gy = rnd() * h;
    const r = rnd();
    ctx.fillStyle = r < 0.45 ? '#fff0cf' : r < 0.8 ? '#8c5222' : '#613512';
    ctx.globalAlpha = 0.1 + rnd() * 0.18;
    const rw = 1 + rnd() * 2.2;
    const rh = 1 + rnd() * 1.4;
    ctx.fillRect(gx, gy, rw, rh);
  }

  ctx.globalAlpha = 1;
  return c;
}

function makeWoodTile(seed: number): HTMLCanvasElement {
  const w = 128;
  const h = 128;
  const [c, ctx] = createOffscreen(w, h);
  const rnd = mulberry32(seed);

  ctx.fillStyle = '#9c6635';
  ctx.fillRect(0, 0, w, h);

  // Wood grain fibers
  for (let x = 0; x < w; x += 2) {
    const shade = rnd() > 0.5 ? '#b87e47' : '#73461f';
    ctx.fillStyle = shade;
    ctx.globalAlpha = 0.18 + rnd() * 0.2;
    ctx.fillRect(x, 0, 1.5, h);
  }

  // Wood knots and growth rings
  ctx.strokeStyle = '#543012';
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 14; i++) {
    const kx = rnd() * w;
    ctx.globalAlpha = 0.22;
    ctx.beginPath();
    ctx.moveTo(kx, 0);
    ctx.bezierCurveTo(kx + 5, h * 0.33, kx - 5, h * 0.66, kx, h);
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
  return c;
}

function makeRockTile(seed: number): HTMLCanvasElement {
  const w = 128;
  const h = 128;
  const [c, ctx] = createOffscreen(w, h);
  const rnd = mulberry32(seed);

  ctx.fillStyle = '#b08558';
  ctx.fillRect(0, 0, w, h);

  for (let i = 0; i < 700; i++) {
    const rx = rnd() * w;
    const ry = rnd() * h;
    ctx.fillStyle = rnd() > 0.5 ? '#e6c59c' : '#6e4b2a';
    ctx.globalAlpha = 0.14 + rnd() * 0.2;
    const sz = 1 + rnd() * 2.5;
    ctx.fillRect(rx, ry, sz, sz);
  }

  // Diagonal rock strata cracks
  ctx.strokeStyle = '#523418';
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 10; i++) {
    const x0 = rnd() * w;
    const y0 = rnd() * h;
    ctx.globalAlpha = 0.22;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x0 + 18, y0 + 10);
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
  return c;
}

function makeCactusTile(seed: number): HTMLCanvasElement {
  const w = 64;
  const h = 64;
  const [c, ctx] = createOffscreen(w, h);
  const rnd = mulberry32(seed);

  ctx.fillStyle = '#5d8544';
  ctx.fillRect(0, 0, w, h);

  // Vertical saguaro ribs
  for (let x = 0; x < w; x += 8) {
    ctx.fillStyle = '#78a35c';
    ctx.globalAlpha = 0.35;
    ctx.fillRect(x, 0, 3, h);
    ctx.fillStyle = '#3e5e2c';
    ctx.globalAlpha = 0.35;
    ctx.fillRect(x + 4, 0, 2, h);
  }

  // Subtle cellular speckles
  for (let i = 0; i < 180; i++) {
    ctx.fillStyle = rnd() > 0.5 ? '#96bf78' : '#355224';
    ctx.globalAlpha = 0.15;
    ctx.fillRect(rnd() * w, rnd() * h, 1.5, 1.5);
  }

  ctx.globalAlpha = 1;
  return c;
}

function makeFurTile(seed: number): HTMLCanvasElement {
  const w = 64;
  const h = 64;
  const [c, ctx] = createOffscreen(w, h);
  const rnd = mulberry32(seed);

  ctx.clearRect(0, 0, w, h);
  ctx.lineWidth = 1.1;
  ctx.lineCap = 'round';
  for (let i = 0; i < 220; i++) {
    const fx = rnd() * w;
    const fy = rnd() * h;
    ctx.strokeStyle = rnd() > 0.45 ? 'rgba(255, 220, 165, 0.24)' : 'rgba(140, 65, 15, 0.20)';
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.lineTo(fx - 3.5, fy + 1.2);
    ctx.stroke();
  }
  return c;
}

export function getTextures(ctx: CanvasRenderingContext2D): ProceduralTextures {
  if (cachedTextures) return cachedTextures;

  const sandFarCanvas = makeSandTile('#e6b479', '#ffdfa8', '#b87f44', 18, 101);
  const sandMidCanvas = makeSandTile('#dca264', '#ffd89c', '#a86e34', 14, 202);
  const sandNearCanvas = makeSandTile('#cf9252', '#ffc982', '#945b24', 11, 303);
  const mesaCanvas = makeMesaTile(404);
  const trackCanvas = makeTrackTile(505);
  const woodCanvas = makeWoodTile(606);
  const rockCanvas = makeRockTile(707);
  const cactusCanvas = makeCactusTile(808);
  const furCanvas = makeFurTile(909);

  cachedTextures = {
    sandFar: ctx.createPattern(sandFarCanvas, 'repeat'),
    sandMid: ctx.createPattern(sandMidCanvas, 'repeat'),
    sandNear: ctx.createPattern(sandNearCanvas, 'repeat'),
    mesaStrata: ctx.createPattern(mesaCanvas, 'repeat'),
    trackSurface: ctx.createPattern(trackCanvas, 'repeat'),
    woodGrain: ctx.createPattern(woodCanvas, 'repeat'),
    rockSurface: ctx.createPattern(rockCanvas, 'repeat'),
    cactusSkin: ctx.createPattern(cactusCanvas, 'repeat'),
    furGrain: ctx.createPattern(furCanvas, 'repeat'),
  };

  return cachedTextures;
}
