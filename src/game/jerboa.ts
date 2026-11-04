import { clamp, lerp, TAU } from './rules';
import { getTextures } from './textures';

export interface JerboaPose {
  t: number;
  phase: number;
  air: number;
  vy: number;
  speed: number;
  stumble: number;
  squash: number;
  lean?: number;
}

export interface JerboaDrawOptions {
  x: number;
  y: number;
  scale?: number;
  scarf?: string;
  goggle?: string;
  coatColor?: string;
  furTint?: string;
  showRider?: boolean;
  pose?: Partial<JerboaPose>;
}

export const JERBOA_COLORS = {
  line: '#46260e',
  fur: '#eb9238',
  furDark: '#c96f1e',
  furDeep: '#a65512',
  furLight: '#f8be72',
  furRim: '#ffdf9e',
  cream: '#fce29c',
  creamLight: '#fff1c7',
  creamShade: '#e3be74',
  earIn: '#f49386',
  earInLight: '#ffb3a8',
  earInShade: '#d97366',
  earEdge: '#8c5028',
  earEdgeLight: '#ad6938',
  skin: '#f4929a',
  skinLight: '#ffb5bc',
  skinDark: '#d9747d',
  claw: '#522c12',
  tuft: '#9c5825',
  tuftLight: '#ba6e34',
  tuftDark: '#6b3812',
  nose: '#592e10',
  eyeWhite: '#fffcf2',
  iris: '#8b9b28',
  irisLight: '#b3c441',
  irisDark: '#5b6914',
  pupil: '#1c150c',
  coat: '#f2d7a4',
  coatShade: '#cfb078',
  pants: '#784f2c',
  boot: '#54341a',
  riderSkin: '#eac296',
  strap: '#543418',
};

function ell(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  rot = 0
): void {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.2, rx), Math.max(0.2, ry), rot, 0, TAU);
}

function fillStroke(
  ctx: CanvasRenderingContext2D,
  fill: string | CanvasGradient | CanvasPattern | null,
  stroke: string | null,
  lw = 4
): void {
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw;
    ctx.stroke();
  }
}

function limbPath(ctx: CanvasRenderingContext2D, pts: number[][]): void {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2;
    const my = (pts[i][1] + pts[i + 1][1]) / 2;
    ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
  }
  const last = pts[pts.length - 1];
  ctx.lineTo(last[0], last[1]);
}

function limb(
  ctx: CanvasRenderingContext2D,
  pts: number[][],
  width: number,
  color: string
): void {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  limbPath(ctx, pts);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

function limbOutlined(
  ctx: CanvasRenderingContext2D,
  pts: number[][],
  width: number,
  color: string
): void {
  limb(ctx, pts, width + 6.2, JERBOA_COLORS.line);
  limb(ctx, pts, width, color);
}

function pointOnPath(pts: number[][], u: number): [number, number] {
  let total = 0;
  const segs: number[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const d = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
    segs.push(d);
    total += d;
  }
  let target = u * total;
  for (let i = 0; i < segs.length; i++) {
    if (target <= segs[i] || i === segs.length - 1) {
      const k = segs[i] ? clamp(target / segs[i], 0, 1) : 0;
      return [lerp(pts[i][0], pts[i + 1][0], k), lerp(pts[i][1], pts[i + 1][1], k)];
    }
    target -= segs[i];
  }
  const last = pts[pts.length - 1];
  return [last[0], last[1]];
}

function strokeTaperSegment(
  ctx: CanvasRenderingContext2D,
  pts: number[][],
  w0: number,
  w1: number,
  color: string
): void {
  const segs = 10;
  let prev = pts[0];
  ctx.lineCap = 'round';
  for (let i = 1; i <= segs; i++) {
    const u = i / segs;
    const p = pointOnPath(pts, u);
    const w = lerp(w0, w1, u);
    limb(ctx, [prev, p], w, color);
    prev = p;
  }
}

function bezPoint(
  p0: [number, number],
  p1: [number, number],
  p2: [number, number],
  p3: [number, number],
  t: number
): [number, number] {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return [
    a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0],
    a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1],
  ];
}

function drawTail(ctx: CanvasRenderingContext2D, pose: JerboaPose): void {
  const C = JERBOA_COLORS;
  const { t, air, speed } = pose;
  const wave = Math.sin(t * 7.5) * 5.5 + Math.sin(t * 13.3) * 2.5;
  const lift = air * 14;
  // Graceful S-curved pink tail matching reference
  const p0: [number, number] = [-46, -132];
  const p1: [number, number] = [-96, -68 + wave * 0.6 - lift * 0.3];
  const p2: [number, number] = [-164, -64 + wave - lift * 0.7];
  const p3: [number, number] = [
    -172,
    -220 + wave * 1.2 - lift * 1.1 - clamp(speed * 0.35, 0, 10),
  ];

  ctx.save();
  ctx.lineCap = 'round';
  let prev = p0;
  const segs = 18;
  // Pass 1: Continuous dark outline
  for (let i = 1; i <= segs; i++) {
    const u = i / segs;
    const pt = bezPoint(p0, p1, p2, p3, u);
    const w = lerp(8.2, 2.8, u);
    limb(ctx, [prev, pt], w + 5.2, C.line);
    prev = pt;
  }
  // Pass 2: Seamless pink fill
  prev = p0;
  for (let j = 1; j <= segs; j++) {
    const u2 = j / segs;
    const pt2 = bezPoint(p0, p1, p2, p3, u2);
    const w2 = lerp(7.0, 2.0, u2);
    limb(ctx, [prev, pt2], w2, u2 > 0.65 ? C.skinDark : C.skin);
    prev = pt2;
  }
  // Pass 3: Soft top highlight
  prev = p0;
  for (let j = 1; j <= 12; j++) {
    const u2 = j / segs;
    const pt2 = bezPoint(p0, p1, p2, p3, u2);
    const w2 = lerp(2.2, 0.8, u2);
    limb(
      ctx,
      [
        [prev[0] + 1.2, prev[1] - 0.6],
        [pt2[0] + 1.2, pt2[1] - 0.6],
      ],
      w2,
      C.skinLight
    );
    prev = pt2;
  }

  // Feather-like brown brush tuft at tip (matches reference image)
  const tip = p3;
  ctx.save();
  ctx.translate(tip[0], tip[1]);
  ctx.rotate(-0.42 + Math.sin(t * 4.2) * 0.07);

  ctx.beginPath();
  ctx.moveTo(0, 12);
  ctx.bezierCurveTo(-12, -8, -14, -36, -6, -56);
  ctx.lineTo(-1, -48);
  ctx.lineTo(6, -68);
  ctx.lineTo(9, -56);
  ctx.lineTo(18, -76);
  ctx.lineTo(20, -62);
  ctx.lineTo(29, -74);
  ctx.bezierCurveTo(28, -50, 24, -36, 17, -28);
  ctx.lineTo(22, -25);
  ctx.bezierCurveTo(14, -12, 8, 2, 0, 12);
  ctx.closePath();

  const tg = ctx.createLinearGradient(0, 12, 24, -74);
  tg.addColorStop(0, C.tuftDark);
  tg.addColorStop(0.45, C.tuft);
  tg.addColorStop(1, C.tuftLight);
  fillStroke(ctx, tg, C.line, 3.2);

  ctx.beginPath();
  ctx.moveTo(2, 2);
  ctx.quadraticCurveTo(6, -28, 16, -58);
  ctx.strokeStyle = 'rgba(255, 210, 150, 0.35)';
  ctx.lineWidth = 2.2;
  ctx.stroke();

  ctx.restore();
  ctx.restore();
}

function earPath(
  ctx: CanvasRenderingContext2D,
  bx: number,
  by: number,
  len: number,
  wid: number,
  ang: number
): void {
  const dx = Math.cos(ang);
  const dy = Math.sin(ang);
  const px = -dy;
  const py = dx;
  const tipX = bx + dx * len;
  const tipY = by + dy * len;
  ctx.beginPath();
  ctx.moveTo(bx - px * wid * 0.38, by - py * wid * 0.38);
  ctx.bezierCurveTo(
    bx + dx * len * 0.12 - px * wid * 0.78,
    by + dy * len * 0.12 - py * wid * 0.78,
    bx + dx * len * 0.62 - px * wid * 0.72,
    by + dy * len * 0.62 - py * wid * 0.72,
    tipX - px * wid * 0.12,
    tipY - py * wid * 0.12
  );
  ctx.quadraticCurveTo(
    tipX + dx * wid * 0.22,
    tipY + dy * wid * 0.22,
    tipX + px * wid * 0.16,
    tipY + py * wid * 0.16
  );
  ctx.bezierCurveTo(
    bx + dx * len * 0.66 + px * wid * 0.68,
    by + dy * len * 0.66 + py * wid * 0.68,
    bx + dx * len * 0.22 + px * wid * 0.6,
    by + dy * len * 0.22 + py * wid * 0.6,
    bx + px * wid * 0.34,
    by + py * wid * 0.34
  );
  ctx.closePath();
}

function drawEar(
  ctx: CanvasRenderingContext2D,
  bx: number,
  by: number,
  len: number,
  wid: number,
  ang: number,
  far: boolean
): void {
  const C = JERBOA_COLORS;
  const dx = Math.cos(ang);
  const dy = Math.sin(ang);

  earPath(ctx, bx, by, len, wid, ang);
  const outerGrad = ctx.createLinearGradient(bx, by, bx + dx * len, by + dy * len);
  outerGrad.addColorStop(0, far ? '#75411e' : C.earEdgeLight);
  outerGrad.addColorStop(1, far ? '#5e3215' : C.earEdge);
  fillStroke(ctx, outerGrad, C.line, 4.2);

  earPath(ctx, bx + dx * len * 0.05, by + dy * len * 0.05, len * 0.88, wid * 0.78, ang);
  fillStroke(ctx, far ? '#6e3b1b' : '#96572d', C.line, 2.0);

  earPath(ctx, bx + dx * len * 0.11, by + dy * len * 0.11, len * 0.78, wid * 0.58, ang);
  const inGrad = ctx.createLinearGradient(bx, by, bx + dx * len, by + dy * len);
  inGrad.addColorStop(0, far ? C.earInShade : C.earIn);
  inGrad.addColorStop(0.7, far ? C.earIn : C.earInLight);
  inGrad.addColorStop(1, far ? C.earInShade : C.earIn);
  fillStroke(ctx, inGrad, C.line, 1.8);
}

// Two-pass seamless hind leg renderer (zero internal joint seams!)
function drawLeg(
  ctx: CanvasRenderingContext2D,
  hip: [number, number],
  knee: [number, number],
  ankle: [number, number],
  toe: [number, number],
  color: string,
  far: boolean
): void {
  const C = JERBOA_COLORS;
  const ang = Math.atan2(toe[1] - ankle[1], toe[0] - ankle[0]);
  const spreadAngles = [-0.28, 0, 0.26];
  const toeEnds: Array<[number, number]> = spreadAngles.map((da, i) => {
    const a = ang + da;
    const toeLen = i === 1 ? 16 : 12.5;
    return [toe[0] + Math.cos(a) * toeLen, toe[1] + Math.sin(a) * toeLen];
  });

  // Pass 1: Draw all dark outlines first
  strokeTaperSegment(ctx, [hip, knee], 21, 14.5, C.line);
  strokeTaperSegment(ctx, [knee, ankle], 14.5, 11.8, C.line);
  strokeTaperSegment(ctx, [ankle, toe], 16.5, 13.5, C.line);
  for (const endPt of toeEnds) {
    strokeTaperSegment(ctx, [toe, endPt], 11.5, 8.5, C.line);
  }

  // Pass 2: Draw seamless pink interior fills over all joints
  strokeTaperSegment(ctx, [hip, knee], 15.2, 8.8, color);
  strokeTaperSegment(ctx, [knee, ankle], 8.8, 6.2, color);
  strokeTaperSegment(ctx, [ankle, toe], 11.0, 8.0, color);
  for (const endPt of toeEnds) {
    strokeTaperSegment(ctx, [toe, endPt], 6.4, 3.6, color);
  }

  // Pass 3: Soft specular highlight on near leg
  if (!far) {
    strokeTaperSegment(
      ctx,
      [
        [hip[0] + 1.5, hip[1]],
        [knee[0] + 1.5, knee[1]],
      ],
      4.2,
      2.2,
      C.skinLight
    );
    strokeTaperSegment(
      ctx,
      [
        [ankle[0] + 1.2, ankle[1] - 1],
        [toe[0] + 1.2, toe[1] - 1],
      ],
      3.2,
      2.0,
      C.skinLight
    );
  }
}

function legPoints(
  phase: number,
  air: number,
  runAmp: number,
  far: boolean
): {
  hip: [number, number];
  knee: [number, number];
  ankle: [number, number];
  toe: [number, number];
} {
  const s = Math.sin(phase);
  const lift = Math.max(0, Math.sin(phase));
  const hip: [number, number] = far ? [-18, -102] : [-2, -104];
  const kx = (far ? 18 : 28) + s * 19 * runAmp;
  const ky = (far ? -62 : -58) - lift * 8 * runAmp;
  const ax = (far ? 0 : 12) + s * 25 * runAmp;
  const ay = (far ? -22 : -20) - lift * 20 * runAmp;
  const tx = (far ? 56 : 72) + s * 28 * runAmp;
  // Stance foot touches y = 0..+2 on ground; lifted foot rises during stride
  const ty = (far ? -2 : 1) - Math.max(0, s) * 26 * runAmp;

  const kx2 = far ? 24 : 34;
  const ky2 = -100;
  const ax2 = far ? 42 : 54;
  const ay2 = far ? -70 : -64;
  const tx2 = far ? 60 : 76;
  const ty2 = far ? -50 : -44;

  return {
    hip,
    knee: [lerp(kx, kx2, air), lerp(ky, ky2, air)],
    ankle: [lerp(ax, ax2, air), lerp(ay, ay2, air)],
    toe: [lerp(tx, tx2, air), lerp(ty, ty2, air)],
  };
}

function drawFrontPaws(ctx: CanvasRenderingContext2D, air: number, t: number): void {
  const C = JERBOA_COLORS;
  const w = Math.sin(t * 6) * 1.6;
  const defs = [
    { sh: [32, -158], hd: [50, -146 + w], rot: 0.85, sc: 0.92, far: true },
    { sh: [24, -156], hd: [40, -144 - w * 0.6], rot: 0.72, sc: 1.0, far: false },
  ];

  for (const d of defs) {
    const sh: [number, number] = [d.sh[0], d.sh[1] - air * 6];
    const hd: [number, number] = [d.hd[0], d.hd[1] - air * 8];
    const pColor = d.far ? C.skinDark : C.skin;
    ctx.save();
    limb(ctx, [sh, hd], 9.5 * d.sc, C.line);
    limb(ctx, [sh, hd], 5.8 * d.sc, pColor);
    ctx.translate(hd[0], hd[1]);
    ctx.rotate(d.rot);
    ell(ctx, 0, 0, 5.0 * d.sc, 6.8 * d.sc, 0);
    fillStroke(ctx, pColor, C.line, 2.4);
    ctx.strokeStyle = C.line;
    ctx.lineWidth = 1.5;
    for (let f = -1; f <= 1; f++) {
      ctx.beginPath();
      ctx.moveTo(2.6, f * 2.2);
      ctx.quadraticCurveTo(6.6, f * 2.6, 8.4, f * 3.3);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawRider(
  ctx: CanvasRenderingContext2D,
  o: JerboaDrawOptions,
  pose: JerboaPose
): void {
  const C = JERBOA_COLORS;
  const { t, air, phase, speed } = pose;
  const scarf = o.scarf || '#28b5a8';
  const goggle = o.goggle || scarf;
  const coatColor = o.coatColor || C.coat;
  const bob = Math.sin(phase * 2) * 1.8;
  const lean = -0.14 - Math.min(0.2, speed * 0.006) - air * 0.12;

  ctx.save();
  ctx.translate(0, bob);

  // Leather saddle blanket
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(-22, -190, 22, 9, -0.18, 0, TAU);
  fillStroke(ctx, '#8c4227', C.line, 2.8);
  ctx.restore();

  // Far leg
  limbOutlined(
    ctx,
    [
      [-30, -196],
      [-12, -184],
      [4, -176],
    ],
    9,
    C.pants
  );
  ell(ctx, 4, -176, 8.4, 6, 0.15);
  fillStroke(ctx, C.boot, C.line, 3);

  // Torso with desert nomad tunic
  ctx.save();
  ctx.translate(-28, -224);
  ctx.rotate(lean);
  ell(ctx, 0, 0, 16.5, 24, 0);
  const cg = ctx.createLinearGradient(-16, -24, 16, 24);
  cg.addColorStop(0, '#fff0c9');
  cg.addColorStop(0.5, coatColor);
  cg.addColorStop(1, C.coatShade);
  fillStroke(ctx, cg, C.line, 3.8);

  ctx.beginPath();
  ctx.moveTo(-15, 8);
  ctx.quadraticCurveTo(0, 12, 15, 7);
  ctx.strokeStyle = '#5c3618';
  ctx.lineWidth = 4.5;
  ctx.stroke();
  ctx.restore();

  // Near leg & boot
  limbOutlined(
    ctx,
    [
      [-24, -196],
      [2, -190],
      [18, -182],
    ],
    10.2,
    C.pants
  );
  ell(ctx, 18, -181, 9.2, 6.5, 0.1);
  fillStroke(ctx, C.boot, C.line, 3);

  // Arms & hands holding reins
  limbOutlined(
    ctx,
    [
      [-12, -238],
      [8, -230],
      [26, -222],
    ],
    8.2,
    coatColor
  );
  ell(ctx, 27, -222, 5.8, 5.2, 0);
  fillStroke(ctx, C.riderSkin, C.line, 2.4);

  // Head & desert hood + brass goggles
  ctx.save();
  ctx.translate(-20, -254);
  ctx.rotate(0.08);
  ell(ctx, 0, 0, 14, 14.4, 0);
  fillStroke(ctx, C.riderSkin, C.line, 3.2);

  ctx.beginPath();
  ctx.arc(0, -1, 14.4, Math.PI * 0.95, Math.PI * 2.08);
  ctx.closePath();
  const hg = ctx.createLinearGradient(-14, -15, 14, 2);
  hg.addColorStop(0, '#9e6234');
  hg.addColorStop(1, '#6b3e1c');
  fillStroke(ctx, hg, C.line, 2.6);

  ctx.strokeStyle = C.strap;
  ctx.lineWidth = 4.4;
  ctx.beginPath();
  ctx.moveTo(-13, -4);
  ctx.quadraticCurveTo(0, -8, 13, -3.5);
  ctx.stroke();

  ell(ctx, 6.8, -2, 7.4, 6.0, -0.1);
  fillStroke(ctx, goggle, C.line, 2.6);
  ctx.globalAlpha = 0.9;
  ell(ctx, 4.8, -4.2, 2.5, 1.7, -0.3);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.restore();

  // Dynamic flowing scarf
  const flap =
    Math.sin(t * 9.5) * 5.5 + Math.sin(t * 14.5) * 2.8 + air * 6.5 + speed * 0.16;
  ctx.save();
  ctx.translate(-30, -241);
  ctx.beginPath();
  ctx.moveTo(0, -5);
  ctx.bezierCurveTo(-18, -11 - flap * 0.4, -44, -2 + flap, -68, -15 + flap);
  ctx.bezierCurveTo(-52, 5 + flap * 0.7, -24, 13 + flap * 0.3, 0, 6);
  ctx.closePath();
  fillStroke(ctx, scarf, C.line, 3.2);

  ctx.globalAlpha = 0.45;
  ctx.beginPath();
  ctx.moveTo(-6, -2);
  ctx.bezierCurveTo(-22, -4, -38, 0, -56, -6 + flap * 0.65);
  ctx.strokeStyle = '#fff5d6';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.restore();

  // Braided leather rein
  ctx.strokeStyle = '#633918';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(26, -221);
  ctx.quadraticCurveTo(64, -206, 102, -188);
  ctx.stroke();

  ctx.restore();
}

export function drawJerboa(ctx: CanvasRenderingContext2D, o: JerboaDrawOptions): void {
  const C = JERBOA_COLORS;
  const textures = getTextures(ctx);
  const rawPose = o.pose || {};
  const pose: JerboaPose = {
    t: rawPose.t || 0,
    phase: rawPose.phase || 0,
    air: clamp(rawPose.air || 0, 0, 1),
    vy: rawPose.vy || 0,
    speed: rawPose.speed || 0,
    stumble: rawPose.stumble || 0,
    squash: rawPose.squash == null ? 1 : rawPose.squash,
    lean: rawPose.lean || 0,
  };

  const { t, phase, air, vy, speed, stumble, squash } = pose;
  const furBase = o.furTint || C.fur;
  const lean =
    (pose.lean || 0) +
    0.03 +
    Math.min(0.14, speed * 0.0045) +
    air * 0.06 +
    stumble * 0.6;
  const runAmp = clamp(speed / 12, 0, 1) * (1 - air);
  const bob = -Math.abs(Math.sin(phase)) * 4.5 * runAmp;

  ctx.save();
  ctx.translate(o.x, o.y + bob);
  ctx.scale(o.scale || 1, o.scale || 1);
  ctx.rotate(lean);
  ctx.scale(1 + (1 - squash) * 0.5, squash);

  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  const earFlop = clamp(-vy * 0.00032, -0.16, 0.24) + Math.sin(t * 2.5) * 0.02;
  const earLen = 116;
  const earWid = 58;
  const nearEarAng = -1.86 + earFlop;
  const farEarAng = -2.07 + earFlop * 1.15;

  // 1. Far ear
  drawEar(ctx, 30, -228, earLen * 0.95, earWid * 0.93, farEarAng, true);

  // 2. Tail
  drawTail(ctx, pose);

  // 3. Far hind leg
  const farLeg = legPoints(phase + Math.PI, air, runAmp, true);
  drawLeg(ctx, farLeg.hip, farLeg.knee, farLeg.ankle, farLeg.toe, C.skinDark, true);

  // 4. Fluffy round body with jagged fur tufts on rump/back
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(28, -182);
  ctx.bezierCurveTo(2, -196, -28, -196, -44, -182);
  ctx.lineTo(-39, -179);
  ctx.lineTo(-54, -166);
  ctx.lineTo(-48, -162);
  ctx.lineTo(-59, -145);
  ctx.lineTo(-53, -142);
  ctx.bezierCurveTo(-58, -124, -52, -108, -40, -98);
  ctx.lineTo(-34, -93);
  ctx.lineTo(-26, -98);
  ctx.lineTo(-18, -92);
  ctx.bezierCurveTo(6, -88, 34, -98, 44, -124);
  ctx.bezierCurveTo(52, -148, 46, -172, 28, -182);
  ctx.closePath();

  const bodyGrad = ctx.createRadialGradient(-8, -158, 12, -6, -142, 68);
  bodyGrad.addColorStop(0, C.furLight);
  bodyGrad.addColorStop(0.55, furBase);
  bodyGrad.addColorStop(1, C.furDark);
  fillStroke(ctx, bodyGrad, C.line, 4.8);

  if (textures.furGrain) {
    ctx.save();
    ctx.clip();
    ctx.fillStyle = textures.furGrain;
    ctx.fillRect(-70, -210, 130, 130);
    ell(ctx, -20, -168, 28, 18, -0.45);
    ctx.fillStyle = 'rgba(255, 226, 168, 0.45)';
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();

  // 5. Seamless chest & cream belly (no hard internal black ring)
  ell(ctx, 22, -150, 32, 36, -0.05);
  fillStroke(ctx, furBase, null, 0);

  ell(ctx, 16, -118, 33, 30, -0.12);
  const bellyGrad = ctx.createLinearGradient(16, -148, 16, -90);
  bellyGrad.addColorStop(0, C.creamLight);
  bellyGrad.addColorStop(0.65, C.cream);
  bellyGrad.addColorStop(1, C.creamShade);
  fillStroke(ctx, bellyGrad, null, 0);

  // Soft chest fluff
  ctx.beginPath();
  ctx.arc(34, -128, 10, -0.5, 2.4);
  ctx.arc(42, -136, 7.5, -0.3, 2.2);
  ctx.fillStyle = C.cream;
  ctx.fill();

  // 6. Near hind leg
  const nearLeg = legPoints(phase, air, runAmp, false);
  drawLeg(ctx, nearLeg.hip, nearLeg.knee, nearLeg.ankle, nearLeg.toe, C.skin, false);

  // Soft fur overlap over top of hip joint (no black outline inside torso!)
  ell(ctx, -2, -110, 16, 15, 0.1);
  fillStroke(ctx, furBase, null, 0);

  // 7. Front paws
  drawFrontPaws(ctx, air, t);

  // 8. Neck shadow
  ctx.save();
  ctx.globalAlpha = 0.22;
  ell(ctx, 34, -190, 22, 26, 0.25);
  ctx.fillStyle = C.furDark;
  ctx.fill();
  ctx.restore();

  // 9. Near ear
  drawEar(ctx, 44, -225, earLen, earWid, nearEarAng, false);

  // 10. Unified Head & Snout (clean profile without spectacle rings)
  ell(ctx, 52, -198, 38, 36, 0.1);
  const headGrad = ctx.createRadialGradient(46, -210, 8, 52, -198, 42);
  headGrad.addColorStop(0, C.furLight);
  headGrad.addColorStop(0.65, furBase);
  headGrad.addColorStop(1, C.furDark);
  fillStroke(ctx, headGrad, C.line, 4.8);

  // Tapered snout
  ctx.beginPath();
  ctx.moveTo(58, -224);
  ctx.quadraticCurveTo(112, -216, 128, -192);
  ctx.quadraticCurveTo(130, -180, 112, -175);
  ctx.quadraticCurveTo(84, -173, 66, -185);
  ctx.closePath();
  fillStroke(ctx, furBase, C.line, 4.5);

  // Seamless interior fill over head-to-snout bridge so no internal seam appears
  ell(ctx, 64, -198, 22, 22, 0.1);
  fillStroke(ctx, furBase, null, 0);

  // Soft cream cheek, eye-patch, and muzzle (no dark outline around eye patch!)
  ell(ctx, 73, -211, 18.5, 19.5, 0.08);
  fillStroke(ctx, C.cream, null, 0);
  ell(ctx, 96, -187, 24, 15.5, 0.18);
  fillStroke(ctx, C.cream, null, 0);
  ell(ctx, 66, -191, 16, 14, 0.1);
  fillStroke(ctx, C.cream, null, 0);
  ell(ctx, 115, -183, 11.5, 8.5, 0.18);
  fillStroke(ctx, C.creamLight, null, 0);

  // Nose with glossy highlight
  ctx.save();
  ctx.translate(125, -186);
  ctx.rotate(0.2);
  ell(ctx, 0, 0, 8.6, 6.6, 0);
  fillStroke(ctx, C.nose, C.line, 2.4);
  ctx.globalAlpha = 0.55;
  ell(ctx, -2.2, -2.2, 3.0, 1.9, -0.3);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.restore();

  // Spirited smile curving up toward cheek (like reference jerboa.png)
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(112, -175);
  ctx.quadraticCurveTo(96, -172, 82, -184);
  ctx.stroke();

  // Large expressive eye (single clean side-profile eye with olive-green iris)
  ell(ctx, 74, -212, 14.8, 15.6, 0.05);
  fillStroke(ctx, C.eyeWhite, C.line, 3.0);

  ell(ctx, 78, -211, 9.0, 9.8, 0);
  const ig = ctx.createLinearGradient(74, -220, 82, -202);
  ig.addColorStop(0, C.irisLight);
  ig.addColorStop(1, C.irisDark);
  ctx.fillStyle = ig;
  ctx.fill();
  ctx.strokeStyle = C.irisDark;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ell(ctx, 79, -210.5, 4.5, 5.2, 0);
  ctx.fillStyle = C.pupil;
  ctx.fill();

  ctx.globalAlpha = 0.95;
  ell(ctx, 75, -217, 3.0, 2.3, -0.4);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ell(ctx, 81, -207, 1.4, 1.2, 0);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.globalAlpha = 1;

  // Eyelid & brow
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 3.4;
  ctx.beginPath();
  ctx.moveTo(60, -223);
  ctx.quadraticCurveTo(73, -230, 88, -224);
  ctx.stroke();
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(62, -237);
  ctx.quadraticCurveTo(75, -244, 89, -237);
  ctx.stroke();

  // Warm cheek blush
  ctx.save();
  ctx.globalAlpha = 0.38;
  ell(ctx, 52, -190, 7, 4.2, -0.35);
  ctx.fillStyle = C.earIn;
  ctx.fill();
  ctx.restore();

  // Whiskers
  ctx.save();
  ctx.globalAlpha = 0.52;
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 1.4;
  const whisk = [
    [119, -178, 160, -192],
    [121, -177, 164, -177],
    [119, -175, 156, -161],
  ];
  for (let w = 0; w < whisk.length; w++) {
    const a = whisk[w];
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.quadraticCurveTo((a[0] + a[2]) / 2, (a[1] + a[3]) / 2 - 4, a[2], a[3]);
    ctx.stroke();
  }
  ctx.restore();

  // 11. Desert Nomad Rider
  if (o.showRider !== false) {
    drawRider(ctx, o, pose);
  }

  ctx.restore();
}
