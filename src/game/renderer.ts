import {
  W,
  H,
  HORIZON_Y,
  GROUND,
  START_X,
  PPM,
  RACE_LEN,
  LANE_DY,
  LANE_SCALE,
  TAU,
  clamp,
  hash01,
  getLaneGroundY,
  Obstacle,
  RacerState,
} from './rules';
import { getTextures } from './textures';
import { drawJerboa } from './jerboa';

export interface Particle {
  active: boolean;
  kind: 'dust' | 'spark' | 'leaf';
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  grav: number;
  color: string;
}

export interface PopupText {
  text: string;
  color: string;
  x: number;
  y: number;
  life: number;
  max: number;
}

export interface RenderContextState {
  t: number;
  camX: number;
  shake: number;
  hitFlash: number;
  goFlash: number;
  countdown: number;
  mode: 'title' | 'countdown' | 'race' | 'finish' | 'paused' | 'results';
  racers: RacerState[];
  player: RacerState;
  obstacles: Obstacle[];
  particles: Particle[];
  popups: PopupText[];
}

const FONT_DISPLAY = '"Rubik", "Trebuchet MS", sans-serif';

export function rr(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const rad = Math.min(r, w * 0.5, h * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

export function txt(
  ctx: CanvasRenderingContext2D,
  s: string,
  x: number,
  y: number,
  size: number,
  color = '#fff3d8',
  align: CanvasTextAlign = 'left',
  weight = '700',
  alpha?: number
): void {
  ctx.save();
  ctx.font = `${weight} ${size}px ${FONT_DISPLAY}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  if (alpha != null) ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fillText(s, x, y);
  ctx.restore();
}

export function txtOut(
  ctx: CanvasRenderingContext2D,
  s: string,
  x: number,
  y: number,
  size: number,
  color = '#fff3d8',
  align: CanvasTextAlign = 'left',
  weight = '800',
  lineW?: number,
  alpha?: number
): void {
  ctx.save();
  ctx.font = `${weight} ${size}px ${FONT_DISPLAY}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  if (alpha != null) ctx.globalAlpha = alpha;
  ctx.lineJoin = 'round';
  ctx.lineWidth = lineW || Math.max(4, size * 0.15);
  ctx.strokeStyle = 'rgba(46, 22, 8, 0.92)';
  ctx.strokeText(s, x, y);
  ctx.fillStyle = color;
  ctx.fillText(s, x, y);
  ctx.restore();
}

function drawSky(ctx: CanvasRenderingContext2D, camPx: number, t: number): void {
  const g = ctx.createLinearGradient(0, 0, 0, HORIZON_Y);
  g.addColorStop(0, '#dc7b3b');
  g.addColorStop(0.26, '#ee9f54');
  g.addColorStop(0.54, '#f8c57c');
  g.addColorStop(0.82, '#fde1ab');
  g.addColorStop(1, '#fff3d6');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, HORIZON_Y + 4);

  const sunX = 1015 - clamp(camPx * 0.004, 0, 60);
  const sunY = 236;
  const glow = ctx.createRadialGradient(sunX, sunY, 10, sunX, sunY, 300);
  glow.addColorStop(0, 'rgba(255, 250, 220, 0.95)');
  glow.addColorStop(0.25, 'rgba(255, 226, 156, 0.50)');
  glow.addColorStop(0.6, 'rgba(255, 196, 112, 0.18)');
  glow.addColorStop(1, 'rgba(255, 180, 100, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, HORIZON_Y);

  const sunGrad = ctx.createLinearGradient(0, sunY - 66, 0, sunY + 66);
  sunGrad.addColorStop(0, '#fffef0');
  sunGrad.addColorStop(1, '#ffd27d');
  ctx.beginPath();
  ctx.arc(sunX, sunY, 64, 0, TAU);
  ctx.fillStyle = sunGrad;
  ctx.fill();

  const clouds = [
    [180, 104, 1.05],
    [540, 74, 0.76],
    [870, 136, 0.9],
    [1170, 68, 0.64],
  ];
  for (let i = 0; i < clouds.length; i++) {
    const c = clouds[i];
    const cx =
      (((c[0] - camPx * 0.025 + t * 4) % (W + 420)) + W + 420) % (W + 420) - 120;
    const cy = c[1];
    const sc = c[2];

    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = '#e59858';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 5 * sc, 92 * sc, 16 * sc, 0, 0, TAU);
    ctx.ellipse(cx + 52 * sc, cy - 4 * sc, 54 * sc, 14 * sc, 0, 0, TAU);
    ctx.ellipse(cx - 50 * sc, cy + 8 * sc, 46 * sc, 12 * sc, 0, 0, TAU);
    ctx.fill();

    ctx.globalAlpha = 0.55;
    ctx.fillStyle = '#fff6df';
    ctx.beginPath();
    ctx.ellipse(cx, cy, 90 * sc, 17 * sc, 0, 0, TAU);
    ctx.ellipse(cx + 54 * sc, cy - 9 * sc, 54 * sc, 15 * sc, 0, 0, TAU);
    ctx.ellipse(cx - 52 * sc, cy + 4 * sc, 46 * sc, 12 * sc, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  ctx.save();
  ctx.strokeStyle = 'rgba(88, 48, 22, 0.48)';
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  const birds = [
    [0.88, 134],
    [0.95, 152],
    [1.02, 126],
    [0.42, 108],
  ];
  for (let b = 0; b < birds.length; b++) {
    const bx =
      (((birds[b][0] * 900 + t * 9 - camPx * 0.02) % (W + 300)) + W + 300) %
        (W + 300) -
      150;
    const by = birds[b][1] + Math.sin(t * 2.2 + b) * 4.5;
    const wing = Math.sin(t * 5.5 + b * 1.4) * 3.5;
    ctx.beginPath();
    ctx.moveTo(bx - 9, by + wing * 0.5);
    ctx.quadraticCurveTo(bx - 4, by - 5 - wing, bx, by);
    ctx.quadraticCurveTo(bx + 4, by - 5 - wing, bx + 9, by + wing * 0.5);
    ctx.stroke();
  }
  ctx.restore();
}

function drawMesas(ctx: CanvasRenderingContext2D, camPx: number): void {
  const textures = getTextures(ctx);
  const shift = camPx * 0.055;
  ctx.save();
  for (let i = -1; i < 7; i++) {
    const idx = i + Math.floor(shift / 330);
    const bx = i * 330 - (((shift % 330) + 330) % 330) - 60;
    const h = 88 + (Math.abs(idx * 53) % 5) * 22;
    const w = 160 + (Math.abs(idx * 37) % 4) * 40;
    const base = HORIZON_Y - 4;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(bx, base);
    ctx.lineTo(bx + w * 0.12, base - h * 0.52);
    ctx.lineTo(bx + w * 0.2, base - h * 0.96);
    ctx.lineTo(bx + w * 0.25, base - h);
    ctx.lineTo(bx + w * 0.72, base - h);
    ctx.lineTo(bx + w * 0.78, base - h * 0.92);
    ctx.lineTo(bx + w * 0.86, base - h * 0.48);
    ctx.lineTo(bx + w, base);
    ctx.closePath();

    ctx.globalAlpha = idx % 2 === 0 ? 0.68 : 0.56;
    if (textures.mesaStrata) {
      ctx.save();
      ctx.translate(bx, base - h);
      ctx.fillStyle = textures.mesaStrata;
      ctx.fill();
      ctx.restore();
    } else {
      ctx.fillStyle = '#c87c52';
      ctx.fill();
    }

    const faceGrad = ctx.createLinearGradient(bx, base - h, bx + w, base);
    faceGrad.addColorStop(0, 'rgba(95, 42, 20, 0.34)');
    faceGrad.addColorStop(0.55, 'rgba(210, 125, 75, 0.08)');
    faceGrad.addColorStop(1, 'rgba(255, 222, 165, 0.35)');
    ctx.fillStyle = faceGrad;
    ctx.fill();

    ctx.strokeStyle = 'rgba(255, 232, 185, 0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(bx + w * 0.22, base - h);
    ctx.lineTo(bx + w * 0.74, base - h);
    ctx.lineTo(bx + w * 0.86, base - h * 0.48);
    ctx.stroke();

    ctx.restore();
  }
  ctx.restore();
}

function drawDuneLayer(
  ctx: CanvasRenderingContext2D,
  camPx: number,
  par: number,
  baseColor: string,
  pattern: CanvasPattern | null,
  amp: number,
  baseY: number,
  freq: number,
  alpha: number
): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  const shift = camPx * par;

  ctx.beginPath();
  ctx.moveTo(0, HORIZON_Y + 4);
  for (let x = 0; x <= W; x += 10) {
    const wx = x + shift;
    const y =
      baseY +
      Math.sin(wx * freq) * amp +
      Math.sin(wx * freq * 0.47 + 2.1) * amp * 0.7;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(W, HORIZON_Y + 4);
  ctx.closePath();

  ctx.fillStyle = baseColor;
  ctx.fill();

  if (pattern) {
    ctx.save();
    ctx.clip();
    ctx.translate(-(shift % 256), 0);
    ctx.fillStyle = pattern;
    ctx.fillRect(-256, baseY - amp * 2, W + 512, HORIZON_Y - baseY + amp * 2 + 20);
    ctx.restore();
  }

  ctx.beginPath();
  for (let x = 0; x <= W; x += 10) {
    const wx = x + shift;
    const y =
      baseY +
      Math.sin(wx * freq) * amp +
      Math.sin(wx * freq * 0.47 + 2.1) * amp * 0.7;
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = 'rgba(255, 236, 188, 0.55)';
  ctx.lineWidth = 2.4;
  ctx.stroke();

  ctx.restore();
}

function drawFarCacti(ctx: CanvasRenderingContext2D, camPx: number): void {
  const spacing = 210;
  const shift = camPx * 0.36;
  const off = ((shift % spacing) + spacing) % spacing;
  const idx0 = Math.floor(shift / spacing);
  ctx.save();
  ctx.globalAlpha = 0.42;
  for (let i = -1; i < W / spacing + 2; i++) {
    const idx = i + idx0;
    const hv = hash01(idx * 3.71);
    if (hv < 0.38) continue;
    const bx = i * spacing - off + (hv - 0.5) * 70;
    const s = 0.38 + hash01(idx * 1.7) * 0.22;
    const h = 148 * s;
    const base = HORIZON_Y - 4;

    ctx.fillStyle = '#7e6f42';
    rr(ctx, bx - 5.5 * s, base - h, 11 * s, h, 5.5 * s);
    ctx.fill();
    rr(ctx, bx - 24 * s, base - h * 0.7, 8.5 * s, 25 * s, 4 * s);
    ctx.fill();
    rr(ctx, bx - 24 * s, base - h * 0.7 + 18 * s, 16 * s, 7.5 * s, 3.5 * s);
    ctx.fill();
    rr(ctx, bx + 16 * s, base - h * 0.84, 8.5 * s, 21 * s, 4 * s);
    ctx.fill();
    rr(ctx, bx + 10 * s, base - h * 0.84 + 15 * s, 14 * s, 7.5 * s, 3.5 * s);
    ctx.fill();
  }
  ctx.restore();
}

function drawGround(ctx: CanvasRenderingContext2D, camX: number): void {
  const textures = getTextures(ctx);
  const camPx = camX * PPM;

  // Base gradient from HORIZON_Y to H
  const g = ctx.createLinearGradient(0, HORIZON_Y, 0, H);
  g.addColorStop(0, '#d8a25e');
  g.addColorStop(0.2, '#e4b26e');
  g.addColorStop(0.55, '#d19854');
  g.addColorStop(1, '#9b612b');
  ctx.fillStyle = g;
  ctx.fillRect(0, HORIZON_Y, W, H - HORIZON_Y);

  // Textured 4-lane sandstone road surface scrolling with camera
  if (textures.trackSurface) {
    ctx.save();
    ctx.translate(-(((camPx % 256) + 256) % 256), HORIZON_Y);
    ctx.fillStyle = textures.trackSurface;
    ctx.fillRect(-256, 0, W + 512, H - HORIZON_Y);
    ctx.restore();
  }

  // Clear racing lane dividers between the 4 lanes on the road
  ctx.save();
  const dividerYs = [531, 563, 594, 626, 658];
  for (let i = 0; i < dividerYs.length; i++) {
    const dy = dividerYs[i];
    const isOuterEdge = i === 0 || i === dividerYs.length - 1;
    ctx.strokeStyle = isOuterEdge
      ? 'rgba(98, 52, 18, 0.45)'
      : 'rgba(255, 240, 204, 0.28)';
    ctx.lineWidth = isOuterEdge ? 3 : 2;
    if (!isOuterEdge) {
      ctx.setLineDash([24, 18]);
      ctx.lineDashOffset = (camPx * 0.9) % 42;
    } else {
      ctx.setLineDash([]);
    }
    ctx.beginPath();
    ctx.moveTo(0, dy);
    ctx.lineTo(W, dy);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.restore();

  // Horizon border where road meets dunes
  ctx.strokeStyle = 'rgba(110, 62, 24, 0.48)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, HORIZON_Y + 1);
  ctx.lineTo(W, HORIZON_Y + 1);
  ctx.stroke();

  // Roadside desert pebbles, cobbles, and scrub tufts across the road & foreground shoulder
  const fromM = Math.floor(camX / 2) * 2 - 6;
  for (let m = fromM; m < camX + W / PPM + 8; m += 2) {
    const sx = START_X + (m - camX) * PPM;
    if (sx < -40 || sx > W + 40) continue;
    const h1 = hash01(m * 12.9);
    if (h1 < 0.48) continue;
    // Place pebbles mostly along the upper and lower shoulders of the 4-lane road
    const onUpperShoulder = hash01(m * 5.7) < 0.35;
    const py = onUpperShoulder
      ? HORIZON_Y + 6 + hash01(m * 3.3) * 18
      : GROUND + 16 + hash01(m * 3.3) * 56;
    const s = 2.0 + hash01(m * 7.1) * 4.0;

    ctx.save();
    ctx.fillStyle = 'rgba(68, 36, 12, 0.32)';
    ctx.beginPath();
    ctx.ellipse(sx + 1.2, py + 1.4, s * 1.05, s * 0.65, 0, 0, TAU);
    ctx.fill();

    ctx.fillStyle = h1 > 0.75 ? '#8e582b' : '#a86f3c';
    ctx.beginPath();
    ctx.ellipse(sx, py, s, s * 0.62, 0, 0, TAU);
    ctx.fill();

    ctx.fillStyle = 'rgba(255, 232, 190, 0.45)';
    ctx.beginPath();
    ctx.ellipse(sx - s * 0.2, py - s * 0.18, s * 0.55, s * 0.3, -0.2, 0, TAU);
    ctx.fill();
    ctx.restore();

    if (h1 > 0.9) {
      ctx.save();
      ctx.strokeStyle = '#7c642e';
      ctx.lineWidth = 1.6;
      ctx.lineCap = 'round';
      for (let t = -1; t <= 1; t++) {
        ctx.beginPath();
        ctx.moveTo(sx, py + 2);
        ctx.quadraticCurveTo(sx + t * 6, py - 5, sx + t * 9, py - 11);
        ctx.stroke();
      }
      ctx.restore();
    }
  }
}

function drawArch(
  ctx: CanvasRenderingContext2D,
  worldX: number,
  label: string,
  color: string,
  camX: number,
  t: number
): void {
  const sx = START_X + (worldX - camX) * PPM;
  if (sx < -260 || sx > W + 260) return;
  const textures = getTextures(ctx);

  // Perspective arch spanning from far roadside (y=528) to foreground roadside (y=656)
  const farPostX = sx - 96;
  const farPostY = HORIZON_Y + 18;
  const nearPostX = sx + 96;
  const nearPostY = GROUND + 14;
  const topY = HORIZON_Y - 178;
  const postW = 18;

  ctx.save();

  // Checkered start/finish line painted across all 4 lanes on the road surface!
  ctx.save();
  const rows = 8;
  const stripTop = HORIZON_Y + 18;
  const stripBot = GROUND + 14;
  const rowH = (stripBot - stripTop) / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < 2; c++) {
      ctx.fillStyle =
        (r + c) % 2 === 0
          ? 'rgba(255, 248, 225, 0.78)'
          : 'rgba(52, 26, 10, 0.65)';
      ctx.fillRect(sx - 10 + c * 10, stripTop + r * rowH, 10, rowH + 0.5);
    }
  }
  ctx.restore();

  const posts = [
    { px: farPostX, py: farPostY },
    { px: nearPostX, py: nearPostY },
  ];

  // Ground shadows & timber pillars
  for (const { px, py } of posts) {
    const postH = py - topY;
    ctx.fillStyle = 'rgba(58, 30, 10, 0.28)';
    ctx.beginPath();
    ctx.ellipse(px, py + 3, 22, 6, 0, 0, TAU);
    ctx.fill();

    ctx.fillStyle = '#9e7348';
    rr(ctx, px - postW * 0.85, py - 22, postW * 1.7, 24, 5);
    ctx.fill();
    ctx.strokeStyle = '#4a2810';
    ctx.lineWidth = 2.2;
    ctx.stroke();

    rr(ctx, px - postW / 2, topY, postW, postH - 18, 6);
    if (textures.woodGrain) {
      ctx.fillStyle = textures.woodGrain;
      ctx.fill();
    } else {
      ctx.fillStyle = '#9c6635';
      ctx.fill();
    }
    ctx.strokeStyle = '#4a260e';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.fillStyle = '#e2be82';
    for (let r = 0; r < 3; r++) {
      rr(ctx, px - postW * 0.62, topY + 14 + r * 6, postW * 1.24, 4.5, 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  // Hanging lanterns
  const span = nearPostX - farPostX;
  for (let s = -1; s <= 1; s += 2) {
    const lx = sx + s * (span * 0.5 - 18);
    const ly = topY + 66 + Math.sin(t * 3.5 + s) * 1.5;
    const glow = ctx.createRadialGradient(lx, ly, 2, lx, ly, 24);
    glow.addColorStop(0, 'rgba(255, 230, 140, 0.85)');
    glow.addColorStop(1, 'rgba(255, 180, 60, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(lx, ly, 24, 0, TAU);
    ctx.fill();

    ctx.fillStyle = '#ffdf78';
    rr(ctx, lx - 5.5, ly - 7, 11, 14, 4);
    ctx.fill();
    ctx.strokeStyle = '#4a260e';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Fluttering overhead banner
  const wave = Math.sin(t * 4.2) * 3;
  ctx.beginPath();
  ctx.moveTo(farPostX - 8, topY + 2);
  ctx.quadraticCurveTo(sx, topY + 22 + wave, nearPostX + 8, topY + 2);
  ctx.lineTo(nearPostX + 8, topY + 58);
  ctx.quadraticCurveTo(sx, topY + 78 + wave, farPostX - 8, topY + 58);
  ctx.closePath();

  const banGrad = ctx.createLinearGradient(0, topY, 0, topY + 78);
  banGrad.addColorStop(0, color);
  banGrad.addColorStop(1, color === '#e0534b' ? '#b0342d' : '#286b54');
  ctx.fillStyle = banGrad;
  ctx.fill();
  ctx.strokeStyle = '#46240c';
  ctx.lineWidth = 3.2;
  ctx.stroke();

  txtOut(ctx, label, sx, topY + 42 + wave * 0.4, 25, '#fff8e6', 'center', '800', 6);
  ctx.restore();
}

function drawDistancePosts(ctx: CanvasRenderingContext2D, camX: number): void {
  const textures = getTextures(ctx);
  const postBaseY = HORIZON_Y + 12;
  for (let d = 150; d < RACE_LEN; d += 150) {
    const sx = START_X + (d - camX) * PPM;
    if (sx < -80 || sx > W + 80) continue;
    ctx.save();
    ctx.fillStyle = 'rgba(60, 30, 10, 0.25)';
    ctx.beginPath();
    ctx.ellipse(sx + 3, postBaseY + 2, 12, 4, 0, 0, TAU);
    ctx.fill();

    ctx.fillStyle = textures.woodGrain || '#8a5a30';
    rr(ctx, sx, postBaseY - 54, 7, 54, 3);
    ctx.fill();
    ctx.strokeStyle = '#4a260e';
    ctx.lineWidth = 2;
    ctx.stroke();

    const sg = ctx.createLinearGradient(0, postBaseY - 68, 0, postBaseY - 40);
    sg.addColorStop(0, '#fff0c9');
    sg.addColorStop(1, '#e4c288');
    ctx.fillStyle = sg;
    rr(ctx, sx - 22, postBaseY - 68, 52, 24, 6);
    ctx.fill();
    ctx.strokeStyle = '#5a3214';
    ctx.lineWidth = 2.2;
    ctx.stroke();

    txt(ctx, `${d} м`, sx + 4, postBaseY - 51, 13, '#4a260e', 'center', '800');
    ctx.restore();
  }
}

function drawSingleObstacleAt(
  ctx: CanvasRenderingContext2D,
  o: Obstacle,
  sx: number,
  baseY: number,
  scale = 1
): void {
  const textures = getTextures(ctx);
  const base = baseY + 2;

  ctx.save();
  ctx.translate(sx, base);
  ctx.scale(scale, scale);

  // Ground shadow
  ctx.fillStyle = 'rgba(68, 36, 14, 0.28)';
  ctx.beginPath();
  ctx.ellipse(0, 4, o.w * PPM * 0.66, 9, 0, 0, TAU);
  ctx.fill();

  if (o.type === 'rock') {
    const w = o.w * PPM * 0.94;
    const h = o.h;
    ctx.beginPath();
    ctx.moveTo(-w * 0.52, 0);
    ctx.lineTo(-w * 0.44, -h * 0.58);
    ctx.lineTo(-w * 0.18, -h * 0.94);
    ctx.lineTo(w * 0.18, -h);
    ctx.lineTo(w * 0.46, -h * 0.62);
    ctx.lineTo(w * 0.54, 0);
    ctx.closePath();

    if (textures.rockSurface) {
      ctx.save();
      ctx.clip();
      ctx.translate(-w, -h);
      ctx.fillStyle = textures.rockSurface;
      ctx.fillRect(0, 0, w * 2, h + 10);
      ctx.restore();
    }

    const rg = ctx.createLinearGradient(-w / 2, -h, w / 2, 0);
    rg.addColorStop(0, 'rgba(255, 230, 185, 0.48)');
    rg.addColorStop(0.5, 'rgba(180, 130, 80, 0.25)');
    rg.addColorStop(1, 'rgba(95, 58, 28, 0.55)');
    ctx.fillStyle = rg;
    ctx.fill();

    ctx.strokeStyle = '#4e3016';
    ctx.lineWidth = 3.2;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-w * 0.18, -h * 0.94);
    ctx.lineTo(-w * 0.04, -h * 0.46);
    ctx.lineTo(w * 0.46, -h * 0.62);
    ctx.strokeStyle = 'rgba(255, 240, 205, 0.55)';
    ctx.lineWidth = 2;
    ctx.stroke();
  } else if (o.type === 'cactus') {
    const cw = 22;
    const h2 = o.h;
    const armY = -h2 * 0.58;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.strokeStyle = '#365226';
    ctx.lineWidth = 17;
    ctx.beginPath();
    ctx.moveTo(-cw * 0.4, armY);
    ctx.quadraticCurveTo(-cw * 0.5 - 24, armY, -cw * 0.5 - 24, armY - 32);
    ctx.moveTo(cw * 0.4, armY - 14);
    ctx.quadraticCurveTo(cw * 0.5 + 22, armY - 14, cw * 0.5 + 22, armY - 44);
    ctx.stroke();

    ctx.strokeStyle = '#68914c';
    ctx.lineWidth = 11.5;
    ctx.stroke();

    rr(ctx, -cw / 2, -h2, cw, h2, 11);
    if (textures.cactusSkin) {
      ctx.save();
      ctx.clip();
      ctx.translate(-cw / 2, -h2);
      ctx.fillStyle = textures.cactusSkin;
      ctx.fillRect(0, 0, cw, h2);
      ctx.restore();
    } else {
      ctx.fillStyle = '#6d8d55';
      ctx.fill();
    }

    const cg = ctx.createLinearGradient(-cw / 2, 0, cw / 2, 0);
    cg.addColorStop(0, 'rgba(42, 68, 28, 0.35)');
    cg.addColorStop(0.35, 'rgba(180, 225, 140, 0.28)');
    cg.addColorStop(1, 'rgba(38, 60, 24, 0.45)');
    ctx.fillStyle = cg;
    ctx.fill();

    ctx.strokeStyle = '#365226';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Flower on crown
    const fy = -h2;
    for (let p = -1; p <= 1; p++) {
      ctx.beginPath();
      ctx.ellipse(p * 4.5, fy, 4.5, 7, p * 0.35, 0, TAU);
      ctx.fillStyle = p === 0 ? '#ff9ebb' : '#f2799b';
      ctx.fill();
      ctx.strokeStyle = '#5c2838';
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(0, fy + 1, 2.8, 0, TAU);
    ctx.fillStyle = '#ffe066';
    ctx.fill();
  } else {
    const bh = o.h;
    const bg = ctx.createRadialGradient(0, -bh * 0.48, 4, 0, -bh * 0.42, bh * 0.65);
    bg.addColorStop(0, 'rgba(186, 132, 68, 0.55)');
    bg.addColorStop(1, 'rgba(110, 68, 28, 0)');
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.ellipse(0, -bh * 0.45, bh * 0.68, bh * 0.48, 0, 0, TAU);
    ctx.fill();

    ctx.lineCap = 'round';
    for (let b = -3; b <= 3; b++) {
      ctx.beginPath();
      ctx.moveTo(b * 2, 0);
      ctx.quadraticCurveTo(
        b * 11,
        -bh * 0.48,
        b * 17,
        -bh * (0.68 + 0.1 * ((b & 1) ? 1 : -1))
      );
      ctx.strokeStyle = b % 2 === 0 ? '#6e4720' : '#946534';
      ctx.lineWidth = 3.2;
      ctx.stroke();
    }

    for (let q = 0; q < 7; q++) {
      const qx = (q - 3) * 11;
      const qy = -bh * (0.48 + ((q * 37) % 5) * 0.085);
      ctx.beginPath();
      ctx.arc(qx, qy, 5.5, 0, TAU);
      ctx.fillStyle = q % 2 === 0 ? '#8c5a2b' : '#b57b42';
      ctx.fill();
      ctx.strokeStyle = '#4a2a10';
      ctx.lineWidth = 1.8;
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawRacer(
  ctx: CanvasRenderingContext2D,
  r: RacerState,
  camX: number,
  t: number
): void {
  const sx = START_X + (r.x - camX) * PPM;
  if (sx < -320 || sx > W + 320) return;
  const lane = clamp(Math.round(r.lane || 0), 0, LANE_DY.length - 1);
  const groundY = getLaneGroundY(lane);
  const sc = LANE_SCALE[lane];
  const y = groundY - r.h;

  // Ground shadow anchored strictly at groundY on the racer's road lane!
  ctx.save();
  const scaleH = 1 - clamp(r.h / 420, 0, 0.52);
  ctx.globalAlpha = 0.28 * scaleH;
  ctx.fillStyle = '#42220b';
  ctx.beginPath();
  ctx.ellipse(
    sx + 4,
    groundY + 3,
    88 * sc * scaleH * 1.25,
    11 * scaleH,
    0,
    0,
    TAU
  );
  ctx.fill();
  ctx.restore();

  if (r.isPlayer) {
    ctx.save();
    ctx.globalAlpha = 0.18 + Math.sin(t * 5) * 0.04;
    const pg = ctx.createRadialGradient(sx, groundY + 2, 4, sx, groundY + 2, 114);
    pg.addColorStop(0, 'rgba(90, 245, 225, 0.65)');
    pg.addColorStop(1, 'rgba(90, 245, 225, 0)');
    ctx.fillStyle = pg;
    ctx.beginPath();
    ctx.ellipse(sx, groundY + 2, 114, 22, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  ctx.save();
  drawJerboa(ctx, {
    x: sx,
    y,
    scale: sc,
    scarf: r.scarf,
    goggle: r.goggle,
    coatColor: r.coatColor,
    furTint: r.furTint,
    showRider: true,
    pose: {
      t: t + r.seedT,
      phase: r.phase,
      air: r.airborne ? clamp(r.h / 95, 0, 1) : 0,
      vy: r.vh,
      speed: r.speed,
      stumble: r.stumble > 0 ? clamp(r.stumble / 0.95, 0, 1) : 0,
      squash: r.squash,
    },
  });
  ctx.restore();

  if (!r.isPlayer) {
    const ly = y - 348 * sc;
    ctx.save();
    ctx.fillStyle = 'rgba(46, 24, 10, 0.78)';
    rr(ctx, sx - 46, ly - 17, 92, 24, 8);
    ctx.fill();
    ctx.strokeStyle = r.scarf;
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.restore();
    txt(ctx, `${r.place} · ${r.name}`, sx, ly, 12, '#fff0d2', 'center', '700', 0.95);
  } else {
    const my = y - 256;
    ctx.save();
    ctx.fillStyle = '#5ef2df';
    ctx.strokeStyle = '#2a1608';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(sx - 9, my - 15);
    ctx.lineTo(sx + 9, my - 15);
    ctx.lineTo(sx, my - 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    txtOut(ctx, 'ТЫ', sx, my - 20, 13, '#b8fff3', 'center', '800', 4, 0.95);
  }
}

function drawSpeedLines(ctx: CanvasRenderingContext2D, p: RacerState, t: number): void {
  const k = clamp((p.speed - 24) / 14, 0, 1);
  if (k <= 0.02) return;
  const sprint = p.sprintFx > 0 ? 1 : 0;
  ctx.save();
  ctx.strokeStyle = '#fff5d8';
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  for (let i = 0; i < 16; i++) {
    const y = 210 + ((i * 47) % 420);
    const x =
      (((i * 211 - t * (920 + i * 42)) % (W + 260)) + W + 260) % (W + 260) - 130;
    const len = 34 + (i % 5) * 28 + sprint * 44;
    ctx.globalAlpha = (0.06 + k * 0.16) * (i % 3 === 0 ? 1 : 0.65);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + len, y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawVignetteAndFlash(ctx: CanvasRenderingContext2D, hitFlash: number): void {
  const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 0.95);
  vg.addColorStop(0, 'rgba(40, 20, 6, 0)');
  vg.addColorStop(1, 'rgba(28, 12, 3, 0.38)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);

  if (hitFlash > 0) {
    ctx.save();
    ctx.globalAlpha = hitFlash * 0.52;
    const fg = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.82);
    fg.addColorStop(0, 'rgba(255, 80, 40, 0)');
    fg.addColorStop(1, 'rgba(220, 45, 18, 0.85)');
    ctx.fillStyle = fg;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
}

export function renderWorldCanvas(
  ctx: CanvasRenderingContext2D,
  state: RenderContextState
): void {
  const textures = getTextures(ctx);
  const titleMode = state.mode === 'title';
  const camX = titleMode ? state.t * 1.6 : state.camX;
  const camPx = camX * PPM;

  ctx.save();
  if (!titleMode && state.shake > 0.2) {
    ctx.translate(
      (Math.random() - 0.5) * state.shake,
      (Math.random() - 0.5) * state.shake * 0.7
    );
  }

  // 1. Sky, Sun, Clouds, Birds, Mesas, and 3 Textured Dune Layers above HORIZON_Y
  drawSky(ctx, camPx, state.t);
  drawMesas(ctx, camPx);
  drawDuneLayer(ctx, camPx, 0.1, '#e6b479', textures.sandFar, 38, HORIZON_Y - 38, 0.0016, 0.9);
  drawDuneLayer(ctx, camPx, 0.17, '#dca264', textures.sandMid, 28, HORIZON_Y - 18, 0.0023, 0.95);
  drawFarCacti(ctx, camPx);
  drawDuneLayer(ctx, camPx, 0.26, '#cf9252', textures.sandNear, 20, HORIZON_Y - 2, 0.0031, 1);
  drawGround(ctx, camX);

  if (titleMode) {
    // Hero jerboa & rider showcase standing firmly on the road on the right third
    const hx = 945;
    const hy = GROUND - 8;
    const p = state.player;
    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = '#3f200a';
    ctx.beginPath();
    ctx.ellipse(hx + 6, hy + 4, 134, 15, 0, 0, TAU);
    ctx.fill();
    ctx.restore();

    drawJerboa(ctx, {
      x: hx,
      y: hy,
      scale: 1.38,
      scarf: p ? p.scarf : '#28b5a8',
      goggle: p ? p.goggle : '#3de0d0',
      coatColor: p ? p.coatColor : '#f3d9a6',
      furTint: p ? p.furTint : '#eb9238',
      showRider: true,
      pose: {
        t: state.t,
        phase: 0,
        air: 0,
        vy: 0,
        speed: 0, // Standing firmly on both feet with gentle breathing squash!
        stumble: 0,
        squash: 1 + Math.sin(state.t * 3.0) * 0.018,
      },
    });

    const shade = ctx.createLinearGradient(0, 0, 780, 0);
    shade.addColorStop(0, 'rgba(34, 17, 6, 0.78)');
    shade.addColorStop(0.58, 'rgba(34, 17, 6, 0.42)');
    shade.addColorStop(1, 'rgba(34, 17, 6, 0)');
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, 780, H);

    ctx.restore();
    drawVignetteAndFlash(ctx, 0);
    return;
  }

  // 2. Distance Posts & Start/Finish Arches
  drawDistancePosts(ctx, camX);
  drawArch(ctx, 20, 'СТАРТ', '#e0534b', camX, state.t);
  drawArch(ctx, RACE_LEN, 'ФИНИШ', '#2e9e7b', camX, state.t);

  // 3. Render all 4 lanes in back-to-front painter's order (lane 3 -> lane 2 -> lane 1 -> lane 0)
  // so every racer AND the obstacle on their lane sit strictly on the road in proper depth order!
  for (let laneIdx = 3; laneIdx >= 0; laneIdx--) {
    const laneGroundY = getLaneGroundY(laneIdx);
    const laneScale = LANE_SCALE[laneIdx] / LANE_SCALE[0];

    // Draw obstacles on this lane (full size on player lane 0, scaled companion hazards on AI lanes 1..3)
    for (let i = 0; i < state.obstacles.length; i++) {
      const o = state.obstacles[i];
      const osx = START_X + (o.x - camX) * PPM;
      if (osx > -140 && osx < W + 140) {
        if (laneIdx === 0) {
          drawSingleObstacleAt(ctx, o, osx, laneGroundY, 1.0);
        } else if ((i + laneIdx) % 2 === 0) {
          drawSingleObstacleAt(ctx, o, osx - laneIdx * 6, laneGroundY, laneScale * 0.78);
        }
      }
    }

    // Draw racer(s) on this lane
    for (let rIdx = 0; rIdx < state.racers.length; rIdx++) {
      const r = state.racers[rIdx];
      if ((r.lane || 0) === laneIdx) {
        drawRacer(ctx, r, camX, state.t);
      }
    }
  }

  // 4. Speed lines
  drawSpeedLines(ctx, state.player, state.t);

  // 5. Pooled particles (dust & sparks)
  for (let p = 0; p < state.particles.length; p++) {
    const pt = state.particles[p];
    if (!pt.active) continue;
    const px = START_X + (pt.x - camX) * PPM;
    const lifeK = clamp(pt.life / pt.max, 0, 1);
    ctx.save();
    ctx.globalAlpha = lifeK * (pt.kind === 'spark' ? 0.95 : 0.58);
    ctx.fillStyle = pt.color;
    ctx.beginPath();
    ctx.arc(
      px,
      pt.y,
      pt.size * (pt.kind === 'spark' ? 0.7 + lifeK * 0.5 : 1 + (1 - lifeK) * 0.4),
      0,
      TAU
    );
    ctx.fill();
    ctx.restore();
  }

  // 6. Floating popups
  for (let q = 0; q < state.popups.length; q++) {
    const pop = state.popups[q];
    const a = clamp(pop.life / pop.max, 0, 1);
    txtOut(ctx, pop.text, pop.x, pop.y, 32, pop.color, 'center', '800', 7, a);
  }

  ctx.restore();
  drawVignetteAndFlash(ctx, state.hitFlash);

  // 7. Countdown & Go Banner on Canvas
  if (state.goFlash > 0) {
    const a = clamp(state.goFlash / 0.8, 0, 1);
    const scl = 1 + (1 - a) * 0.28;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(W / 2, H / 2 - 36);
    ctx.scale(scl, scl);
    txtOut(ctx, 'ПОШЛИ!', 0, 0, 96, '#8ff7d8', 'center', '900', 14);
    ctx.restore();
  }

  if (state.mode === 'countdown') {
    const n = Math.ceil(state.countdown - 0.6);
    if (n > 0) {
      const frac = 1 - ((state.countdown - 0.6) % 1);
      const scale = 1 + (1 - frac) * 0.2;
      ctx.save();
      ctx.translate(W / 2, H / 2 - 40);
      ctx.scale(scale, scale);
      ctx.globalAlpha = 0.96;
      txtOut(ctx, String(n), 0, 0, 168, '#fff4d9', 'center', '900', 16);
      ctx.restore();
    }
  }
}
