export const W = 1280;
export const H = 720;
// Horizon where dunes meet the packed desert road
export const HORIZON_Y = 512;
// Foreground player lane ground Y
export const GROUND = 642;
export const START_X = 430;
export const PPM = 15;
export const RACE_LEN = 850;
// 4 distinct racing lanes on the road surface (all strictly below HORIZON_Y = 512)
// Lane 0 = player (y=642), Lane 1 = y=610, Lane 2 = y=578, Lane 3 = y=548
export const LANE_DY = [0, 32, 64, 94] as const;
export const LANE_SCALE = [0.74, 0.70, 0.66, 0.62] as const;
export const GRAV = 2600;
export const JUMP_V = 900;
export const BASE_SPEED = 24;
export const FLOW_STEP = 0.045;
export const SPRINT_MULT = 1.28;
export const PERFECT_WINDOW = 0.22;
export const TAU = Math.PI * 2;

export function getLaneGroundY(lane: number): number {
  const idx = clamp(Math.round(lane || 0), 0, LANE_DY.length - 1);
  return GROUND - LANE_DY[idx];
}

export interface PlayerSkinPreset {
  id: string;
  title: string;
  scarf: string;
  goggle: string;
  coatColor: string;
  furTint: string;
}

export const PLAYER_SKINS: PlayerSkinPreset[] = [
  {
    id: 'teal',
    title: 'Бирюзовый Ветер',
    scarf: '#28b5a8',
    goggle: '#3de0d0',
    coatColor: '#f3d9a6',
    furTint: '#eb9238',
  },
  {
    id: 'gold',
    title: 'Золотой Самум',
    scarf: '#f5a623',
    goggle: '#ffe066',
    coatColor: '#fff0c4',
    furTint: '#f09c3e',
  },
  {
    id: 'crimson',
    title: 'Алый Мираж',
    scarf: '#e03e52',
    goggle: '#ff7588',
    coatColor: '#edd2b0',
    furTint: '#d97b29',
  },
  {
    id: 'emerald',
    title: 'Изумрудный Оазис',
    scarf: '#2bb673',
    goggle: '#6bffb8',
    coatColor: '#e8dec0',
    furTint: '#e38834',
  },
];

export type ObstacleType = 'rock' | 'cactus' | 'bush';

export interface Obstacle {
  x: number;
  w: number;
  h: number;
  type: ObstacleType;
  seed: number;
  hits: number;
}

export interface RacerState {
  name: string;
  isPlayer: boolean;
  base: number;
  aiSkill: number;
  scarf: string;
  goggle: string;
  coatColor: string;
  furTint: string;
  startX: number;
  rng: () => number;
  phase: number;
  seedT: number;
  x: number;
  speed: number;
  h: number;
  vh: number;
  airborne: boolean;
  stumble: number;
  flow: number;
  stamina: number;
  staminaGhost: number;
  squash: number;
  lastLand: number;
  earlyJump: number;
  coyoteTime: number;
  dustT: number;
  finished: boolean;
  finishTime: number;
  place: number;
  aiDecidedFor: Obstacle | null;
  aiWillJump: boolean;
  aiJumpGap: number;
  sprintCd: number;
  sprintFx: number;
  combo: number;
  lane: number;
}

export interface ResultRow {
  name: string;
  place: number;
  time: number;
  isPlayer: boolean;
  scarf: string;
  maxCombo?: number;
}

export interface RaceResults {
  rows: ResultRow[];
  playerPlace: number;
  playerTime: number;
  newRecord: boolean;
}

export interface AdvanceEvents {
  jumped: boolean;
  perfect: boolean;
  landed: boolean;
  hitObstacle: Obstacle | null;
  spawnedRunDust: boolean;
}

export function clamp(v: number, a: number, b: number): number {
  return v < a ? a : v > b ? b : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function mulberry32(a: number): () => number {
  let state = a | 0;
  return function () {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash01(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export function buildTrack(seed: number): Obstacle[] {
  const rnd = mulberry32(seed);
  const list: Obstacle[] = [];
  let x = 130;
  while (x < RACE_LEN - 70) {
    const r = rnd();
    const type: ObstacleType = r < 0.34 ? 'rock' : r < 0.78 ? 'cactus' : 'bush';
    let h: number;
    if (type === 'rock') h = 48 + rnd() * 30;
    else if (type === 'cactus') h = 92 + rnd() * 34;
    else h = 58 + rnd() * 22;

    list.push({
      x,
      w: type === 'rock' ? 2.4 : 1.7,
      h,
      type,
      seed: rnd() * 100,
      hits: 0,
    });
    x += 54 + rnd() * 54;
  }
  return list;
}

export function nextObstacleAhead(
  obstacles: Obstacle[],
  x: number,
  maxDist: number
): Obstacle | null {
  for (let i = 0; i < obstacles.length; i++) {
    const o = obstacles[i];
    if (o.x + o.w * 0.5 > x - 2 && o.x - x < maxDist) return o;
  }
  return null;
}

export function createRacer(
  name: string,
  isPlayer: boolean,
  base: number,
  skill: number,
  scarf: string,
  goggle: string,
  coatColor: string,
  furTint: string,
  startX: number,
  seed: number,
  lane: number
): RacerState {
  const rng = mulberry32(seed * 7919 + 13);
  return {
    name,
    isPlayer,
    base,
    aiSkill: skill,
    scarf,
    goggle,
    coatColor,
    furTint,
    startX,
    rng,
    phase: rng() * TAU,
    seedT: rng() * 20,
    x: startX,
    speed: 0,
    h: 0,
    vh: 0,
    airborne: false,
    stumble: 0,
    flow: 0,
    stamina: 100,
    staminaGhost: 100,
    squash: 1,
    lastLand: -9,
    earlyJump: 0,
    coyoteTime: 0,
    dustT: 0,
    finished: false,
    finishTime: 0,
    place: 1,
    aiDecidedFor: null,
    aiWillJump: false,
    aiJumpGap: 6,
    sprintCd: 0,
    sprintFx: 0,
    combo: 0,
    lane,
  };
}

export function createRacers(skinIndex = 0): { racers: RacerState[]; player: RacerState } {
  const skin = PLAYER_SKINS[skinIndex % PLAYER_SKINS.length] || PLAYER_SKINS[0];
  const player = createRacer(
    'Ты',
    true,
    BASE_SPEED,
    1,
    skin.scarf,
    skin.goggle,
    skin.coatColor,
    skin.furTint,
    0,
    1,
    0
  );
  const defs: Array<[string, number, number, string, string, string, string, number, number, number]> = [
    ['Вихрь', 25.7, 0.9, '#e04f44', '#ff7369', '#ebd09e', '#e28432', -10, 2, 1],
    ['Прыгун', 25.2, 0.82, '#447ce0', '#6ea2ff', '#e5cfa6', '#df8c3d', -20, 3, 2],
    ['Песчинка', 24.7, 0.74, '#9462de', '#b88aff', '#f0d8b4', '#ed9947', -30, 4, 3],
  ];
  const racers: RacerState[] = [player];
  for (let i = 0; i < defs.length; i++) {
    const d = defs[i];
    racers.push(createRacer(d[0], false, d[1], d[2], d[3], d[4], d[5], d[6], d[7], d[8], d[9]));
  }
  return { racers, player };
}

export function executeJump(r: RacerState, perfect: boolean): void {
  r.airborne = true;
  r.vh = JUMP_V * (perfect ? 1.05 : 1);
  r.h = 0.5;
  r.squash = 1.16;
  r.earlyJump = 0;
  r.coyoteTime = 0;
  if (perfect) {
    r.flow = Math.min(5, r.flow + 1);
    r.combo = (r.combo || 0) + 1;
  }
}

export function executeLand(r: RacerState, raceTime: number): { autoHopped: boolean } {
  r.lastLand = raceTime;
  r.airborne = false;
  r.vh = 0;
  r.h = 0;
  r.squash = 0.78;

  if (r.earlyJump > 0 && !r.finished) {
    r.earlyJump = 0;
    executeJump(r, true);
    return { autoHopped: true };
  }
  r.earlyJump = 0;
  r.flow = Math.max(0, r.flow - 0.42);
  r.combo = 0;
  return { autoHopped: false };
}

// Safely settles a finished racer back to the ground and decelerates smoothly
export function settleFinishedRacer(r: RacerState, dt: number, raceTime: number): boolean {
  let landed = false;
  r.speed *= Math.max(0, 1 - dt * 1.45);
  if (r.speed < 0.2) r.speed = 0;
  r.x += r.speed * dt;
  r.squash += (1 - r.squash) * Math.min(1, dt * 8);

  if (r.airborne || r.h > 0) {
    r.vh -= GRAV * dt;
    r.h += r.vh * dt;
    r.phase += dt * 2.0;
    if (r.h <= 0) {
      r.h = 0;
      r.vh = 0;
      r.airborne = false;
      r.earlyJump = 0;
      r.lastLand = raceTime;
      r.squash = 0.8;
      landed = true;
    }
  } else {
    r.h = 0;
    r.vh = 0;
    if (r.speed > 0.5) {
      r.phase += dt * (2.5 + r.speed * 0.28);
    }
  }
  return landed;
}

export function applyObstacleHit(r: RacerState, o: Obstacle): void {
  r.stumble = 0.95;
  r.speed *= 0.28;
  r.h = 0;
  r.vh = 0;
  r.airborne = false;
  r.flow = 0;
  r.combo = 0;
  r.squash = 0.72;
  o.hits++;
}

export function checkRacerObstacles(r: RacerState, obstacles: Obstacle[]): Obstacle | null {
  if (r.stumble > 0 || r.finished) return null;
  for (let i = 0; i < obstacles.length; i++) {
    const o = obstacles[i];
    if (Math.abs(o.x - (r.x + 1.1)) < o.w * 0.5 + 0.5) {
      if (r.h < o.h - 10) {
        applyObstacleHit(r, o);
        return o;
      }
      break;
    }
  }
  return null;
}

export function advanceRacer(
  r: RacerState,
  dt: number,
  raceTime: number,
  obstacles: Obstacle[],
  jumpPressed: boolean,
  sprinting: boolean,
  speedMul = 1
): AdvanceEvents {
  const events: AdvanceEvents = {
    jumped: false,
    perfect: false,
    landed: false,
    hitObstacle: null,
    spawnedRunDust: false,
  };

  if (r.stumble > 0) r.stumble = Math.max(0, r.stumble - dt);

  if (jumpPressed && r.stumble <= 0 && !r.airborne) {
    const sinceLand = raceTime - r.lastLand;
    const isPerfect = sinceLand >= 0 && sinceLand <= PERFECT_WINDOW;
    executeJump(r, isPerfect);
    events.jumped = true;
    events.perfect = isPerfect;
  } else if (jumpPressed && r.airborne) {
    r.earlyJump = 0.16;
  }

  if (r.earlyJump > 0) {
    r.earlyJump = Math.max(0, r.earlyJump - dt);
  }

  const wantSprint = sprinting && r.stamina > 0.5 && r.stumble <= 0;
  if (wantSprint) {
    r.stamina = Math.max(0, r.stamina - 34 * dt);
    r.sprintCd = 0.5;
    r.sprintFx = 0.14;
  } else {
    r.sprintCd = Math.max(0, (r.sprintCd || 0) - dt);
    if (r.sprintCd <= 0) r.stamina = Math.min(100, r.stamina + 25 * dt);
    r.sprintFx = Math.max(0, (r.sprintFx || 0) - dt);
  }

  if (r.staminaGhost > r.stamina) {
    r.staminaGhost = Math.max(r.stamina, r.staminaGhost - 28 * dt);
  } else {
    r.staminaGhost = r.stamina;
  }

  let mult = 1 + r.flow * FLOW_STEP;
  if (wantSprint) mult *= SPRINT_MULT;
  let target = r.base * mult * speedMul;
  if (r.stumble > 0) target *= 0.3;

  r.speed += (target - r.speed) * Math.min(1, dt * (r.stumble > 0 ? 2.2 : 4.4));
  r.x += r.speed * dt;

  if (r.airborne) {
    r.vh -= GRAV * dt;
    r.h += r.vh * dt;
    r.phase += dt * 2.2;
    if (r.h <= 0) {
      r.h = 0;
      events.landed = true;
      const landRes = executeLand(r, raceTime);
      if (landRes.autoHopped) {
        events.jumped = true;
        events.perfect = true;
      }
    }
  } else {
    r.h = 0;
    r.vh = 0;
    if (r.speed > 0.5) {
      r.phase += dt * (4.2 + r.speed * 0.32);
    }
    r.flow = Math.max(0, r.flow - 0.55 * dt);
    r.dustT -= dt;
    if (r.dustT <= 0 && r.speed > 6) {
      r.dustT = 0.16;
      events.spawnedRunDust = true;
    }
  }

  r.squash += (1 - r.squash) * Math.min(1, dt * 8);
  const hit = checkRacerObstacles(r, obstacles);
  if (hit) events.hitObstacle = hit;

  return events;
}

export function decideAutoPlayer(
  p: RacerState,
  obstacles: Obstacle[],
  raceTime: number
): { jump: boolean; sprint: boolean } {
  let jump = false;
  const o = nextObstacleAhead(obstacles, p.x, 110);
  const gap = o ? o.x - p.x : 999;
  if (!p.airborne) {
    if (gap <= Math.max(5.5, p.speed * 0.37)) {
      jump = true;
    } else if (gap > 48) {
      const dtl = raceTime - p.lastLand;
      if (dtl > 0.02 && dtl < 0.12) jump = true;
    }
  }
  const sprint = p.stamina > 40 && gap > 42;
  return { jump, sprint };
}

export function stepAIRacer(
  r: RacerState,
  playerX: number,
  dt: number,
  raceTime: number,
  obstacles: Obstacle[]
): AdvanceEvents {
  let jump = false;
  const o = nextObstacleAhead(obstacles, r.x, 90);
  if (!r.airborne) {
    if (o) {
      if (r.aiDecidedFor !== o) {
        r.aiDecidedFor = o;
        r.aiWillJump = r.rng() < 0.55 + r.aiSkill * 0.5;
        r.aiJumpGap =
          Math.max(4, r.speed * (0.24 + (1 - r.aiSkill) * 0.2)) + (r.rng() - 0.5) * 2.5;
      }
      if (r.aiDecidedFor === o && r.aiWillJump && o.x - r.x <= r.aiJumpGap) {
        jump = true;
      }
    }
    if (!jump && (!o || o.x - r.x > 46)) {
      const dtl = raceTime - r.lastLand;
      if (dtl > 0.02 && dtl < 0.13) {
        if (r.rng() < 0.3 + r.aiSkill * 0.6) jump = true;
      }
    }
  }
  if (o && o.x - r.x < -8 && r.aiDecidedFor === o) {
    r.aiDecidedFor = null;
  }

  const diff = playerX - r.x;
  const mul = 1 + clamp(diff * 0.0026, -0.085, 0.09);
  return advanceRacer(r, dt, raceTime, obstacles, jump, false, mul);
}

export function computePlaces(racers: RacerState[]): void {
  const sorted = racers.slice().sort((a, b) => {
    if (a.finished && b.finished) return a.finishTime - b.finishTime;
    if (a.finished) return -1;
    if (b.finished) return 1;
    return b.x - a.x;
  });
  for (let i = 0; i < sorted.length; i++) {
    sorted[i].place = i + 1;
  }
}

export function buildResults(
  racers: RacerState[],
  player: RacerState,
  raceTime: number,
  newRecord: boolean
): RaceResults {
  computePlaces(racers);
  const order = racers.slice().sort((a, b) => a.place - b.place);
  // Current elapsed clock is at least the maximum finishTime among all finished racers
  let latestClock = raceTime;
  for (let i = 0; i < racers.length; i++) {
    if (racers[i].finished && racers[i].finishTime > latestClock) {
      latestClock = racers[i].finishTime;
    }
  }

  let prevTime = 0;
  const rows: ResultRow[] = order.map((r, idx) => {
    let time = r.finished
      ? r.finishTime
      : latestClock + Math.max(0.15, (RACE_LEN - r.x) / Math.max(14, r.speed));
    if (idx > 0 && time < prevTime + 0.1) {
      time = prevTime + 0.1;
    }
    prevTime = time;
    return {
      name: r.isPlayer ? 'ТЫ' : r.name,
      place: r.place,
      time,
      isPlayer: r.isPlayer,
      scarf: r.scarf,
    };
  });
  return {
    rows,
    playerPlace: player.place,
    playerTime: player.finishTime || raceTime,
    newRecord,
  };
}
