/* ============================================================
   ТУШКАНЧИКИ НА СТАРТЕ — гонки по пустыне
   Управление: ПРОБЕЛ / клик — прыжок, SHIFT — спурт,
   P — пауза, M — звук, R — заново, ESC — меню.
   ============================================================ */
(function () {
  'use strict';

  /* ------------------------- константы ------------------------- */
  var W = 1280, H = 720;
  var GROUND = 604;
  var START_X = 430;
  var PPM = 15;
  var RACE_LEN = 850;
  var LANE_DY = [0, 24, 48, 72];
  var LANE_SCALE = [0.72, 0.704, 0.688, 0.672];
  var GRAV = 2600;
  var JUMP_V = 900;
  var BASE_SPEED = 24;
  var FLOW_STEP = 0.045;
  var SPRINT_MULT = 1.28;
  var PERFECT_WINDOW = 0.22;
  var FONT = '"Trebuchet MS", "Segoe UI", Tahoma, sans-serif';
  var TAU = Math.PI * 2;

  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d');

  /* --------------------------- утилиты ------------------------- */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function hash01(n) {
    var x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  }
  function rr(x, y, w, h, r) {
    var rad = Math.min(r, w * 0.5, h * 0.5);
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + w, y, x + w, y + h, rad);
    ctx.arcTo(x + w, y + h, x, y + h, rad);
    ctx.arcTo(x, y + h, x, y, rad);
    ctx.arcTo(x, y, x + w, y, rad);
    ctx.closePath();
  }
  function txt(s, x, y, size, color, align, weight, alpha) {
    ctx.save();
    ctx.font = (weight || '700') + ' ' + size + 'px ' + FONT;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'alphabetic';
    if (alpha != null) ctx.globalAlpha = alpha;
    ctx.fillStyle = color || '#fff3d8';
    ctx.fillText(s, x, y);
    ctx.restore();
  }
  function txtOut(s, x, y, size, color, align, weight, lineW) {
    ctx.save();
    ctx.font = (weight || '700') + ' ' + size + 'px ' + FONT;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.lineJoin = 'round';
    ctx.lineWidth = lineW || Math.max(4, size * 0.14);
    ctx.strokeStyle = 'rgba(52,28,12,0.9)';
    ctx.strokeText(s, x, y);
    ctx.fillStyle = color || '#fff3d8';
    ctx.fillText(s, x, y);
    ctx.restore();
  }

  /* --------------------------- звук ---------------------------- */
  var Sfx = {
    ac: null, master: null, muted: false,
    init: function () {
      try {
        if (this.ac) { if (this.ac.state === 'suspended') this.ac.resume(); return; }
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ac = new AC();
        this.master = this.ac.createGain();
        this.master.gain.value = 0.42;
        this.master.connect(this.ac.destination);
      } catch (e) { this.ac = null; }
    },
    tone: function (freq, dur, type, gain, slideTo, delay) {
      if (!this.ac || this.muted) return;
      try {
        var ac = this.ac, t0 = ac.currentTime + (delay || 0);
        var osc = ac.createOscillator(), g = ac.createGain();
        osc.type = type || 'sine';
        osc.frequency.setValueAtTime(freq, t0);
        if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), t0 + dur);
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(Math.max(0.001, gain || 0.12), t0 + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        osc.connect(g); g.connect(this.master);
        osc.start(t0); osc.stop(t0 + dur + 0.03);
      } catch (e) { /* тихо */ }
    },
    noise: function (dur, freq, gain) {
      if (!this.ac || this.muted) return;
      try {
        var ac = this.ac;
        var len = Math.max(1, Math.floor(ac.sampleRate * dur));
        var buf = ac.createBuffer(1, len, ac.sampleRate);
        var d = buf.getChannelData(0);
        for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
        var src = ac.createBufferSource(); src.buffer = buf;
        var f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq || 900;
        var g = ac.createGain(); g.gain.value = gain || 0.18;
        src.connect(f); f.connect(g); g.connect(this.master);
        src.start();
      } catch (e) { /* тихо */ }
    },
    hop: function () { this.tone(190, 0.1, 'sine', 0.1, 95); this.noise(0.07, 800, 0.06); },
    perfect: function (n) {
      var k = Math.min(6, n || 1);
      this.tone(620 + k * 45, 0.13, 'triangle', 0.1);
      this.tone(930 + k * 60, 0.16, 'sine', 0.075, null, 0.055);
    },
    stumble: function () { this.noise(0.3, 460, 0.26); this.tone(150, 0.24, 'sawtooth', 0.09, 62); },
    count: function (last) { this.tone(last ? 900 : 520, last ? 0.32 : 0.12, 'square', 0.07); },
    finish: function () {
      var s = this;
      [523, 659, 784, 1046].forEach(function (f, i) { s.tone(f, 0.34, 'triangle', 0.1, null, i * 0.105); });
    }
  };

  /* --------------------------- состояние ----------------------- */
  var G = {
    mode: 'title',
    t: 0,
    raceTime: 0,
    countdown: 3.6,
    lastCount: -1,
    goFlash: 0,
    camX: 0,
    shake: 0,
    hitFlash: 0,
    racers: [],
    player: null,
    obstacles: [],
    particles: [],
    popups: [],
    best: 0,
    newRecord: false,
    finishTimer: 0,
    results: null,
    paused: false,
    muted: false,
    auto: false,
    freeze: false,
    debug: false,
    isTouch: false,
    touchJump: false,
    touchSprint: false,
    sprintTouchUntil: 0,
    ui: {},
    refReady: false,
    titleTime: 0,
    seed: 20261104,
    hintT: 0
  };

  var keys = { sprint: false };

  var refImg = new Image();
  refImg.onload = function () { G.refReady = true; };
  refImg.src = 'assets/jerboa.png';

  /* --------------------------- трек ---------------------------- */
  function buildTrack(seed) {
    var rnd = mulberry32(seed);
    var list = [];
    var x = 130;
    while (x < RACE_LEN - 70) {
      var r = rnd();
      var type = r < 0.34 ? 'rock' : (r < 0.78 ? 'cactus' : 'bush');
      var h;
      if (type === 'rock') h = 48 + rnd() * 30;
      else if (type === 'cactus') h = 92 + rnd() * 34;
      else h = 58 + rnd() * 22;
      list.push({
        x: x, w: type === 'rock' ? 2.4 : 1.7, h: h, type: type,
        seed: rnd() * 100, hits: 0
      });
      x += 54 + rnd() * 54;
    }
    return list;
  }

  function nextObstacleAhead(x, maxDist) {
    for (var i = 0; i < G.obstacles.length; i++) {
      var o = G.obstacles[i];
      if (o.x + o.w * 0.5 > x - 2 && o.x - x < maxDist) return o;
    }
    return null;
  }

  /* --------------------------- гонщики ------------------------- */
  function Racer(name, isPlayer, base, skill, scarf, goggle, startX, seed) {
    this.name = name;
    this.isPlayer = !!isPlayer;
    this.base = base;
    this.aiSkill = skill;
    this.scarf = scarf;
    this.goggle = goggle;
    this.startX = startX;
    this.rng = mulberry32(seed * 7919 + 13);
    this.phase = this.rng() * TAU;
    this.seedT = this.rng() * 20;
    this.x = startX;
    this.speed = 0;
    this.h = 0;
    this.vh = 0;
    this.airborne = false;
    this.stumble = 0;
    this.flow = 0;
    this.stamina = 100;
    this.squash = 1;
    this.lastLand = -9;
    this.earlyJump = 0;
    this.dustT = 0;
    this.finished = false;
    this.finishTime = 0;
    this.place = 1;
    this.aiDecidedFor = null;
    this.aiWillJump = false;
    this.aiJumpGap = 6;
    this.sprintFx = 0;
    this.autoJump = false;
    this.combo = 0;
    this.lane = 0;
  }

  function makeRacers() {
    G.racers = [];
    G.player = new Racer('Ты', true, BASE_SPEED, 1, '#2e9e96', '#2e9e96', 0, 1);
    G.player.lane = 0;
    G.racers.push(G.player);
    var defs = [
      ['Вихрь', 25.7, 0.90, '#d9544b', '#d9544b', -10, 2, 1],
      ['Прыгун', 25.2, 0.82, '#4f7fd4', '#4f7fd4', -20, 3, 2],
      ['Песчинка', 24.7, 0.74, '#8e6bd0', '#8e6bd0', -30, 4, 3]
    ];
    for (var i = 0; i < defs.length; i++) {
      var d = defs[i];
      var r = new Racer(d[0], false, d[1], d[2], d[3], d[4], d[5], d[6]);
      r.lane = d[7];
      G.racers.push(r);
    }
  }

  /* --------------------------- старт --------------------------- */
  function startRace() {
    Sfx.init();
    G.mode = 'countdown';
    G.countdown = 3.6;
    G.lastCount = -1;
    G.goFlash = 0;
    G.raceTime = 0;
    G.camX = 0;
    G.shake = 0;
    G.hitFlash = 0;
    G.particles = [];
    G.popups = [];
    G.results = null;
    G.newRecord = false;
    G.finishTimer = 0;
    G.paused = false;
    G.hintT = 0;
    G.obstacles = buildTrack(G.seed);
    makeRacers();
    G.racers.forEach(function (r) { r.x = r.startX; });
    G.camX = 0;
  }

  function toMenu() {
    G.mode = 'title';
    G.paused = false;
    G.results = null;
    G.particles = [];
    G.popups = [];
    G.camX = 0;
    G.shake = 0;
  }

  /* --------------------------- ввод ---------------------------- */
  function canvasPos(e) {
    var r = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * (W / r.width),
      y: (e.clientY - r.top) * (H / r.height)
    };
  }

  function inRect(p, r) {
    return r && p.x >= r[0] && p.x <= r[0] + r[2] && p.y >= r[1] && p.y <= r[1] + r[3];
  }

  function doJumpInput() {
    if (G.mode === 'race') { G.touchJump = true; }
  }

  function onPointerDown(e) {
    e.preventDefault();
    Sfx.init();
    var p = canvasPos(e);
    if (G.mode === 'title') { startRace(); return; }
    if (G.mode === 'results') {
      if (inRect(p, G.ui.restart)) { startRace(); return; }
      if (inRect(p, G.ui.menu)) { toMenu(); return; }
      if (inRect(p, G.ui.panel)) return;
      return;
    }
    if (G.mode === 'paused') { G.paused = false; G.mode = G.resumeMode || 'race'; return; }
    if (G.mode === 'countdown') return;
    if (G.mode === 'race') {
      if (G.isTouch && p.x > W - 200 && p.y > H - 190) {
        G.touchSprint = true;
        if (G.player) G.player.sprintFx = Math.max(G.player.sprintFx, 0.2);
      } else {
        doJumpInput();
      }
    }
  }

  function onPointerUp() { G.touchSprint = false; }

  function onKeyDown(e) {
    var k = e.code;
    if (k === 'Space' || k === 'ArrowUp' || k === 'KeyW') e.preventDefault();
    if (e.repeat) return;
    Sfx.init();

    if (k === 'KeyM') {
      G.muted = !G.muted; Sfx.muted = G.muted; return;
    }
    if (G.mode === 'title') {
      if (k === 'Space' || k === 'Enter' || k === 'ArrowUp') { e.preventDefault(); startRace(); }
      return;
    }
    if (G.mode === 'results') {
      if (k === 'Space' || k === 'Enter' || k === 'KeyR') { e.preventDefault(); startRace(); return; }
      if (k === 'Escape') { toMenu(); return; }
      return;
    }
    if (k === 'KeyP' || k === 'Escape') {
      if (G.mode === 'paused') { G.paused = false; G.mode = G.resumeMode || 'race'; }
      else if (G.mode === 'race' || G.mode === 'countdown' || G.mode === 'finish') {
        G.resumeMode = G.mode; G.mode = 'paused'; G.paused = true;
      }
      return;
    }
    if (G.mode === 'paused') return;
    if (k === 'KeyR') { startRace(); return; }

    if (k === 'ShiftLeft' || k === 'ShiftRight') { keys.sprint = true; return; }
    if (k === 'Space' || k === 'ArrowUp' || k === 'KeyW') {
      doJumpInput();
    }
  }

  function onKeyUp(e) {
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') keys.sprint = false;
  }

  function bindInput() {
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    canvas.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    window.addEventListener('blur', function () {
      keys.sprint = false; G.touchSprint = false;
      if (G.mode === 'race' || G.mode === 'countdown') { G.resumeMode = G.mode; G.mode = 'paused'; G.paused = true; }
    });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && (G.mode === 'race' || G.mode === 'countdown')) {
        G.resumeMode = G.mode; G.mode = 'paused'; G.paused = true;
      }
    });
  }

  /* --------------------------- эффекты ------------------------- */
  function spawnDust(worldX, n, big) {
    for (var i = 0; i < n; i++) {
      G.particles.push({
        kind: 'dust',
        x: worldX + (Math.random() - 0.5) * 1.6,
        y: GROUND - 2 - Math.random() * 8,
        vx: -(20 + Math.random() * 90),
        vy: -(10 + Math.random() * (big ? 130 : 60)),
        life: 0.45 + Math.random() * 0.45,
        max: 1,
        size: 3 + Math.random() * (big ? 9 : 6),
        grav: 260,
        color: '#f2d6a6'
      });
    }
    if (G.particles.length > 240) G.particles.splice(0, G.particles.length - 240);
  }

  function burstSpark(worldX, py, color) {
    for (var i = 0; i < 16; i++) {
      var a = Math.random() * TAU, sp = 60 + Math.random() * 220;
      G.particles.push({
        kind: 'spark',
        x: worldX, y: py,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 60,
        life: 0.4 + Math.random() * 0.4,
        max: 1,
        size: 2 + Math.random() * 3,
        grav: 620,
        color: color || '#ffe27a'
      });
    }
    if (G.particles.length > 260) G.particles.splice(0, G.particles.length - 260);
  }

  function pushPopup(text, color, worldX, py) {
    var sx = worldX != null
      ? START_X + (worldX - G.camX) * PPM
      : START_X + (G.player ? G.player.x - G.camX : 0) * PPM;
    // одинаковые подписи заменяют друг друга, чтобы не наслаивались
    for (var i = G.popups.length - 1; i >= 0; i--) {
      if (G.popups[i].text === text) G.popups.splice(i, 1);
    }
    G.popups.push({
      text: text, color: color || '#fff3d8',
      x: sx,
      y: py != null ? py : GROUND - 368,
      life: 0.95, max: 0.95
    });
    if (G.popups.length > 6) G.popups.shift();
  }

  function updateEffects(dt) {
    var i, p;
    for (i = G.particles.length - 1; i >= 0; i--) {
      p = G.particles[i];
      p.life -= dt;
      if (p.life <= 0) { G.particles.splice(i, 1); continue; }
      p.x += p.vx * dt / PPM;
      p.y += p.vy * dt;
      p.vy += p.grav * dt;
      p.vx *= (1 - dt * 1.5);
    }
    for (i = G.popups.length - 1; i >= 0; i--) {
      var q = G.popups[i];
      q.life -= dt;
      q.y -= 26 * dt;
      if (q.life <= 0) G.popups.splice(i, 1);
    }
    G.shake *= Math.exp(-7 * dt);
    if (G.shake < 0.15) G.shake = 0;
    G.hitFlash = Math.max(0, G.hitFlash - dt * 2.2);
  }

  /* ------------------------ физика гонщика --------------------- */
  function doJump(r, perfect) {
    r.airborne = true;
    r.vh = JUMP_V * (perfect ? 1.05 : 1);
    r.h = 0.5;
    r.squash = 1.14;
    r.earlyJump = 0;
    if (perfect) {
      r.flow = Math.min(5, r.flow + 1);
      r.combo = (r.combo || 0) + 1;
      burstSpark(r.x, GROUND - r.h - 8, '#ffe27a');
      if (r.isPlayer) {
        Sfx.perfect(r.combo);
        pushPopup(r.flow >= 1.5 ? 'ИДЕАЛЬНО! ×' + Math.round(r.flow) : 'ИДЕАЛЬНО!', '#ffe89a');
        G.shake = Math.max(G.shake, 2.5);
      } else {
        Sfx.perfect(1);
      }
    } else if (r.isPlayer) {
      Sfx.hop();
    }
    spawnDust(r.x, r.isPlayer ? 9 : 6);
  }

  function land(r) {
    r.lastLand = G.raceTime;
    r.airborne = false;
    r.vh = 0;
    r.h = 0;
    r.squash = 0.8;
    spawnDust(r.x, r.isPlayer ? 14 : 9, true);
    if (r.isPlayer) G.shake = Math.max(G.shake, 2.2);

    if (r.earlyJump > 0) {
      r.earlyJump = 0;
      doJump(r, true);
      return;
    }
    r.flow = Math.max(0, r.flow - 0.42);
    r.combo = 0;
  }

  function hitObstacle(r, o) {
    r.stumble = 0.95;
    r.speed *= 0.28;
    r.h = 0;
    r.vh = 0;
    r.airborne = false;
    r.flow = 0;
    r.combo = 0;
    r.squash = 0.72;
    o.hits++;
    spawnDust(r.x, 20, true);
    if (r.isPlayer) {
      G.shake = 14;
      G.hitFlash = 0.5;
      Sfx.stumble();
      pushPopup('ОЙ!', '#ff9a7a');
    }
  }

  function checkObstacles(r) {
    if (r.stumble > 0 || r.finished) return;
    for (var i = 0; i < G.obstacles.length; i++) {
      var o = G.obstacles[i];
      if (Math.abs(o.x - (r.x + 1.1)) < o.w * 0.5 + 0.5) {
        if (r.h < o.h - 10) hitObstacle(r, o);
        break;
      }
    }
  }

  function advanceRacer(r, dt, jumpPressed, sprinting, speedMul) {
    if (r.stumble > 0) r.stumble = Math.max(0, r.stumble - dt);

    if (jumpPressed && r.stumble <= 0 && !r.airborne) {
      var sinceLand = G.raceTime - r.lastLand;
      doJump(r, sinceLand >= 0 && sinceLand <= PERFECT_WINDOW);
    } else if (jumpPressed && r.airborne) {
      r.earlyJump = 0.16;
    }

    if (r.earlyJump > 0) {
      r.earlyJump -= dt;
      if (r.earlyJump < 0) r.earlyJump = 0;
    }

    var wantSprint = sprinting && r.stamina > 0.5 && r.stumble <= 0;
    if (wantSprint) {
      r.stamina = Math.max(0, r.stamina - 34 * dt);
      r.sprintCd = 0.5;
      r.sprintFx = 0.14;
    } else {
      r.sprintCd = Math.max(0, (r.sprintCd || 0) - dt);
      if (r.sprintCd <= 0) r.stamina = Math.min(100, r.stamina + 25 * dt);
      r.sprintFx = Math.max(0, (r.sprintFx || 0) - dt);
    }

    var mult = 1 + r.flow * FLOW_STEP;
    if (wantSprint) mult *= SPRINT_MULT;
    var target = r.base * mult * (speedMul || 1);
    if (r.stumble > 0) target *= 0.3;
    r.speed += (target - r.speed) * Math.min(1, dt * (r.stumble > 0 ? 2.2 : 4.4));
    r.x += r.speed * dt;

    if (r.airborne) {
      r.vh -= GRAV * dt;
      r.h += r.vh * dt;
      r.phase += dt * 2.2;
      if (r.h <= 0) { r.h = 0; land(r); }
    } else {
      r.phase += dt * (6.2 + r.speed * 0.3);
      r.flow = Math.max(0, r.flow - 0.55 * dt);
      r.dustT -= dt;
      if (r.dustT <= 0 && r.speed > 6) {
        r.dustT = 0.16;
        spawnDust(r.x - 1.4, 2);
      }
    }

    r.squash += (1 - r.squash) * Math.min(1, dt * 8);
    checkObstacles(r);
  }

  function autoPlayer(dt) {
    var p = G.player;
    if (!p) return { jump: false, sprint: false };
    var jump = false, sprint = false;
    var o = nextObstacleAhead(p.x, 110);
    var gap = o ? o.x - p.x : 999;
    if (!p.airborne) {
      if (gap <= Math.max(5.5, p.speed * 0.37)) {
        jump = true;
      } else if (gap > 48) {
        var dtl = G.raceTime - p.lastLand;
        if (dtl > 0.02 && dtl < 0.12) jump = true;
      }
    }
    sprint = p.stamina > 40 && gap > 42;
    return { jump: jump, sprint: sprint };
  }

  function updateAI(r, dt) {
    var jump = false;
    var o = nextObstacleAhead(r.x, 90);
    if (!r.airborne) {
      if (o) {
        if (r.aiDecidedFor !== o) {
          r.aiDecidedFor = o;
          r.aiWillJump = r.rng() < (0.55 + r.aiSkill * 0.5);
          r.aiJumpGap = Math.max(4, r.speed * (0.24 + (1 - r.aiSkill) * 0.2)) + (r.rng() - 0.5) * 2.5;
        }
        if (r.aiDecidedFor === o && r.aiWillJump && (o.x - r.x) <= r.aiJumpGap) jump = true;
      }
      if (!jump && (!o || o.x - r.x > 46)) {
        var dtl = G.raceTime - r.lastLand;
        if (dtl > 0.02 && dtl < 0.13) {
          if (r.rng() < 0.3 + r.aiSkill * 0.6) jump = true;
        }
      }
    }
    if (o && (o.x - r.x) < -8 && r.aiDecidedFor === o) r.aiDecidedFor = null;

    var diff = G.player.x - r.x;
    var mul = 1 + clamp(diff * 0.0026, -0.085, 0.09);
    advanceRacer(r, dt, jump, false, mul);
  }

  /* --------------------------- обновление --------------------- */
  function sortRacersByX() {
    G.racers.sort(function (a, b) { return a.x - b.x; });
  }

  function computePlaces() {
    var sorted = G.racers.slice().sort(function (a, b) {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.x - a.x;
    });
    for (var i = 0; i < sorted.length; i++) sorted[i].place = i + 1;
  }

  function update(dt) {
    G.t += dt;
    updateEffects(dt);

    if (G.mode === 'title') {
      G.titleTime += dt;
      var hero = G.player;
      if (hero) hero.phase += dt * 2.6;
      return;
    }

    if (G.mode === 'paused') return;

    if (G.mode === 'countdown') {
      G.countdown -= dt;
      var n = Math.ceil(G.countdown - 0.6);
      if (n > 0 && n !== G.lastCount) { G.lastCount = n; Sfx.count(false); }
      if (G.countdown <= 0.6) {
        G.mode = 'race';
        G.countdown = 0;
        G.goFlash = 0.8;
        Sfx.count(true);
        pushPopup('ПОШЛИ!', '#9df0d2');
      }
      for (var i = 0; i < G.racers.length; i++) {
        var rr2 = G.racers[i];
        rr2.phase += dt * 3.4;
        rr2.squash += (1 - rr2.squash) * Math.min(1, dt * 8);
        spawnDustIdle(rr2, dt);
      }
      computePlaces();
      G.camX = G.player.x - 5;
      return;
    }

    if (G.mode === 'race') {
      G.raceTime += dt;
      G.goFlash = Math.max(0, G.goFlash - dt);
      var p = G.player;

      var jump = G.touchJump;
      G.touchJump = false;
      var sprint = (keys.sprint || G.touchSprint) && !G.auto;
      if (G.auto) {
        var ac = autoPlayer(dt);
        jump = ac.jump;
        sprint = ac.sprint;
      }
      advanceRacer(p, dt, jump, sprint, 1);

      for (var j = 1; j < G.racers.length; j++) {
        var ai = G.racers[j];
        if (ai.finished) {
          ai.speed *= Math.max(0, 1 - dt * 1.1);
          ai.x += ai.speed * dt;
          ai.phase += dt * 4;
          continue;
        }
        updateAI(ai, dt);
      }

      // финиш
      for (var f = 0; f < G.racers.length; f++) {
        var r = G.racers[f];
        if (!r.finished && r.x >= RACE_LEN) {
          r.finished = true;
          r.finishTime = G.raceTime;
          if (r.isPlayer) {
            G.mode = 'finish';
            G.finishTimer = 1.5;
            G.player.speed *= 0.6;
            Sfx.finish();
            G.shake = 6;
            G.newRecord = !G.best || r.finishTime < G.best;
            if (G.newRecord) { G.best = r.finishTime; saveBest(G.best); }
            pushPopup('ФИНИШ!', '#ffe89a');
          }
        }
      }

      G.camX += (G.player.x - G.camX) * Math.min(1, dt * 9);
      computePlaces();
      G.hintT += dt;
      return;
    }

    if (G.mode === 'finish') {
      G.finishTimer -= dt;
      G.player.phase += dt * 4;
      G.player.squash += (1 - G.player.squash) * Math.min(1, dt * 8);
      G.player.x += G.player.speed * dt * 0.35;
      G.player.speed *= Math.max(0, 1 - dt * 1.6);
      G.camX += (G.player.x - G.camX) * Math.min(1, dt * 4);
      if (G.finishTimer <= 0) {
        G.results = buildResults();
        G.mode = 'results';
        G.paused = false;
      }
      return;
    }
  }

  function spawnDustIdle(r, dt) {
    r.dustT -= dt;
    if (r.dustT <= 0) {
      r.dustT = 0.5 + Math.random() * 0.4;
      if (Math.random() < 0.6) spawnDust(r.x, 1);
    }
  }

  function buildResults() {
    computePlaces();
    var order = G.racers.slice().sort(function (a, b) { return a.place - b.place; });
    var rows = order.map(function (r) {
      var time = r.finished ? r.finishTime : G.raceTime + (RACE_LEN - r.x) / Math.max(10, r.speed);
      return {
        name: r.isPlayer ? 'ТЫ' : r.name,
        place: r.place,
        time: time,
        isPlayer: r.isPlayer,
        scarf: r.scarf
      };
    });
    return {
      rows: rows,
      playerPlace: G.player.place,
      playerTime: G.player.finishTime || G.raceTime,
      newRecord: G.newRecord
    };
  }

  /* --------------------------- фон ----------------------------- */
  function drawSky(camPx) {
    var g = ctx.createLinearGradient(0, 0, 0, GROUND);
    g.addColorStop(0, '#ef9f56');
    g.addColorStop(0.34, '#f7bd76');
    g.addColorStop(0.62, '#f9d79e');
    g.addColorStop(0.86, '#fbe8c1');
    g.addColorStop(1, '#fdf0d4');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, GROUND + 2);

    var sunX = 1010, sunY = 292;
    var glow = ctx.createRadialGradient(sunX, sunY, 8, sunX, sunY, 280);
    glow.addColorStop(0, 'rgba(255,247,210,0.9)');
    glow.addColorStop(0.3, 'rgba(255,222,150,0.42)');
    glow.addColorStop(1, 'rgba(255,200,120,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, GROUND);

    var sunGrad = ctx.createLinearGradient(0, sunY - 70, 0, sunY + 70);
    sunGrad.addColorStop(0, '#fffbe6');
    sunGrad.addColorStop(1, '#ffd484');
    ctx.beginPath();
    ctx.arc(sunX, sunY, 68, 0, TAU);
    ctx.fillStyle = sunGrad;
    ctx.fill();

    // облака
    var clouds = [[180, 118, 1.05], [560, 84, 0.72], [880, 156, 0.86], [1160, 74, 0.6]];
    for (var i = 0; i < clouds.length; i++) {
      var c = clouds[i];
      var cx = ((c[0] - camPx * 0.025) % (W + 420) + W + 420) % (W + 420) - 120;
      ctx.save();
      ctx.globalAlpha = 0.38;
      ctx.fillStyle = '#fff3d6';
      ctx.beginPath();
      ctx.ellipse(cx, c[1], 90 * c[2], 17 * c[2], 0, 0, TAU);
      ctx.ellipse(cx + 54 * c[2], c[1] - 9 * c[2], 54 * c[2], 15 * c[2], 0, 0, TAU);
      ctx.ellipse(cx - 52 * c[2], c[1] + 4 * c[2], 46 * c[2], 12 * c[2], 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    // птицы
    ctx.save();
    ctx.strokeStyle = 'rgba(92,56,30,0.42)';
    ctx.lineWidth = 2.2;
    var birds = [[0.9, 150], [0.96, 168], [1.02, 142]];
    for (var b = 0; b < birds.length; b++) {
      var bx = ((birds[b][0] * 900 + G.t * 8 - camPx * 0.02) % (W + 300)) - 150;
      var by = birds[b][1] + Math.sin(G.t * 1.6 + b) * 4;
      ctx.beginPath();
      ctx.moveTo(bx - 8, by);
      ctx.quadraticCurveTo(bx - 3, by - 5, bx, by);
      ctx.quadraticCurveTo(bx + 3, by - 5, bx + 8, by);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawMesas(camPx) {
    var shift = camPx * 0.055;
    ctx.save();
    for (var i = -1; i < 7; i++) {
      var bx = i * 330 - (shift % 330) - 60;
      var h = 90 + ((i * 53) % 5) * 22;
      var w = 150 + ((i * 37) % 4) * 40;
      ctx.fillStyle = i % 2 === 0 ? 'rgba(206,143,101,0.46)' : 'rgba(199,132,90,0.4)';
      ctx.beginPath();
      ctx.moveTo(bx, GROUND - 6);
      ctx.lineTo(bx + w * 0.14, GROUND - 6 - h * 0.55);
      ctx.lineTo(bx + w * 0.22, GROUND - 6 - h);
      ctx.lineTo(bx + w * 0.72, GROUND - 6 - h);
      ctx.lineTo(bx + w * 0.82, GROUND - 6 - h * 0.5);
      ctx.lineTo(bx + w, GROUND - 6);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function drawDuneLayer(camPx, par, color, amp, baseY, freq, alpha) {
    ctx.save();
    if (alpha != null) ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, GROUND + 4);
    for (var x = 0; x <= W; x += 12) {
      var wx = x + camPx * par;
      var y = baseY + Math.sin(wx * freq) * amp + Math.sin(wx * freq * 0.47 + 2.1) * amp * 0.7;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, GROUND + 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawFarCacti(camPx) {
    var spacing = 210;
    var shift = camPx * 0.36;
    var off = ((shift % spacing) + spacing) % spacing;
    var idx0 = Math.floor(shift / spacing);
    ctx.save();
    ctx.globalAlpha = 0.32;
    ctx.fillStyle = '#8a7448';
    for (var i = -1; i < W / spacing + 2; i++) {
      var idx = i + idx0;
      var hv = hash01(idx * 3.71);
      if (hv < 0.4) continue;
      var bx = i * spacing - off + (hv - 0.5) * 70;
      var s = 0.4 + hash01(idx * 1.7) * 0.22;
      var h = 150 * s;
      var base = GROUND - 6;
      rr(bx - 5 * s, base - h, 10 * s, h, 5 * s); ctx.fill();
      rr(bx - 24 * s, base - h * 0.7, 8 * s, 24 * s, 4 * s); ctx.fill();
      rr(bx - 24 * s, base - h * 0.7 + 18 * s, 15 * s, 7 * s, 3.5 * s); ctx.fill();
      rr(bx + 16 * s, base - h * 0.84, 8 * s, 20 * s, 4 * s); ctx.fill();
      rr(bx + 10 * s, base - h * 0.84 + 15 * s, 14 * s, 7 * s, 3.5 * s); ctx.fill();
    }
    ctx.restore();
  }

  function drawGround(camPx) {
    var g = ctx.createLinearGradient(0, GROUND, 0, H);
    g.addColorStop(0, '#e0ad6c');
    g.addColorStop(0.35, '#d19a58');
    g.addColorStop(1, '#a96f38');
    ctx.fillStyle = g;
    ctx.fillRect(0, GROUND, W, H - GROUND);

    // светлая дорожка
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = '#ffe7bd';
    ctx.fillRect(0, GROUND + 12, W, 120);
    ctx.restore();

    // линия горизонта/края трассы
    ctx.strokeStyle = 'rgba(122,72,32,0.35)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, GROUND + 1);
    ctx.lineTo(W, GROUND + 1);
    ctx.stroke();

    // мелкие камни и травинки
    var fromM = Math.floor(G.camX / 2) * 2 - 6;
    for (var m = fromM; m < G.camX + W / PPM + 8; m += 2) {
      var sx = START_X + (m - G.camX) * PPM;
      if (sx < -40 || sx > W + 40) continue;
      var h1 = hash01(m * 12.9);
      if (h1 < 0.55) continue;
      var py = GROUND + 16 + hash01(m * 3.3) * 96;
      var s = 1.6 + hash01(m * 7.1) * 3.4;
      ctx.save();
      ctx.globalAlpha = 0.22 + h1 * 0.2;
      ctx.fillStyle = '#7b4a22';
      ctx.beginPath();
      ctx.ellipse(sx, py, s, s * 0.62, 0, 0, TAU);
      ctx.fill();
      ctx.restore();

      if (h1 > 0.945) {
        ctx.save();
        ctx.globalAlpha = 0.22;
        ctx.strokeStyle = '#8a6a34';
        ctx.lineWidth = 1.3;
        for (var t = -1; t <= 1; t++) {
          ctx.beginPath();
          ctx.moveTo(sx, py + 2);
          ctx.quadraticCurveTo(sx + t * 5, py - 4, sx + t * 8, py - 9);
          ctx.stroke();
        }
        ctx.restore();
      }
    }
  }

  function drawArches(camPx) {
    drawArch(20, 'СТАРТ', '#e0534b', camPx);
    drawArch(RACE_LEN, 'ФИНИШ', '#3f8f74', camPx);
  }

  function drawArch(worldX, label, color, camPx) {
    var sx = START_X + (worldX - G.camX) * PPM;
    if (sx < -240 || sx > W + 240) return;
    var postH = 234, postW = 16, span = 270;
    ctx.save();
    // столбы
    for (var s = -1; s <= 1; s += 2) {
      var px = sx + s * span * 0.5;
      var g = ctx.createLinearGradient(px - 8, 0, px + 8, 0);
      g.addColorStop(0, '#8c5a2e');
      g.addColorStop(0.5, '#c08a4f');
      g.addColorStop(1, '#6f4421');
      ctx.fillStyle = g;
      rr(px - postW / 2, GROUND - postH, postW, postH, 5);
      ctx.fill();
      ctx.strokeStyle = 'rgba(60,32,12,0.55)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    // полотнище
    var topY = GROUND - postH + 2;
    ctx.beginPath();
    ctx.moveTo(sx - span * 0.5, topY);
    ctx.quadraticCurveTo(sx, topY + 26, sx + span * 0.5, topY);
    ctx.lineTo(sx + span * 0.5, topY + 54);
    ctx.quadraticCurveTo(sx, topY + 78, sx - span * 0.5, topY + 54);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = 'rgba(60,32,12,0.6)';
    ctx.lineWidth = 3;
    ctx.stroke();

    // клетка по краям
    ctx.save();
    ctx.globalAlpha = 0.9;
    for (var c = 0; c < 10; c++) {
      if (c % 2) continue;
      ctx.fillStyle = 'rgba(255,244,214,0.9)';
      var cw = (span - 10) / 10;
      ctx.fillRect(sx - span * 0.5 + 5 + c * cw, topY + 47, cw, 9);
    }
    ctx.restore();

    txt(label, sx, topY + 38, 24, '#fff8e6', 'center', '700');
    ctx.restore();
  }

  function drawDistancePosts(camPx) {
    for (var d = 150; d < RACE_LEN; d += 150) {
      var sx = START_X + (d - G.camX) * PPM;
      if (sx < -80 || sx > W + 80) continue;
      ctx.save();
      ctx.fillStyle = '#8a5a30';
      rr(sx, GROUND - 54, 6, 54, 3);
      ctx.fill();
      ctx.fillStyle = '#f4dcae';
      rr(sx + 6, GROUND - 66, 46, 24, 5);
      ctx.fill();
      ctx.strokeStyle = 'rgba(90,50,20,0.55)';
      ctx.lineWidth = 2;
      ctx.stroke();
      txt(d + '', sx + 29, GROUND - 48, 13, '#5a3418', 'center', '700');
      ctx.restore();
    }
  }

  /* --------------------------- препятствия -------------------- */
  function drawObstacle(o) {
    var sx = START_X + (o.x - G.camX) * PPM;
    if (sx < -120 || sx > W + 120) return;
    var base = GROUND + 2;

    ctx.save();
    // тень
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = '#5a3418';
    ctx.beginPath();
    ctx.ellipse(sx, base + 3, o.w * PPM * 0.62, 8, 0, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;

    if (o.type === 'rock') {
      var w = o.w * PPM * 0.9;
      var h = o.h;
      ctx.beginPath();
      ctx.moveTo(sx - w * 0.5, base);
      ctx.lineTo(sx - w * 0.42, base - h * 0.55);
      ctx.lineTo(sx - w * 0.16, base - h * 0.92);
      ctx.lineTo(sx + w * 0.2, base - h);
      ctx.lineTo(sx + w * 0.46, base - h * 0.6);
      ctx.lineTo(sx + w * 0.52, base);
      ctx.closePath();
      var rg = ctx.createLinearGradient(sx - w / 2, base - h, sx + w / 2, base);
      rg.addColorStop(0, '#c9a377');
      rg.addColorStop(0.55, '#a97f52');
      rg.addColorStop(1, '#835c36');
      ctx.fillStyle = rg;
      ctx.fill();
      ctx.strokeStyle = '#5f3f22';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = '#f4dcb4';
      ctx.beginPath();
      ctx.ellipse(sx - w * 0.12, base - h * 0.68, w * 0.16, h * 0.16, -0.4, 0, TAU);
      ctx.fill();
      ctx.restore();
    } else if (o.type === 'cactus') {
      var cw = 20;
      var h2 = o.h;
      ctx.strokeStyle = '#4d6b3e';
      ctx.fillStyle = '#6d8d55';
      ctx.lineWidth = 3;
      // ствол
      ctx.beginPath();
      rr(sx - cw / 2, base - h2, cw, h2, 9);
      ctx.fill();
      ctx.stroke();
      // лапы
      var armY = base - h2 * 0.62;
      ctx.beginPath();
      ctx.moveTo(sx - cw / 2, armY);
      ctx.lineTo(sx - cw / 2 - 16, armY);
      ctx.quadraticCurveTo(sx - cw / 2 - 30, armY, sx - cw / 2 - 30, armY - 30);
      ctx.lineWidth = 12;
      ctx.strokeStyle = '#5d7c49';
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(sx + cw / 2, armY - 16);
      ctx.lineTo(sx + cw / 2 + 15, armY - 16);
      ctx.quadraticCurveTo(sx + cw / 2 + 27, armY - 16, sx + cw / 2 + 27, armY - 44);
      ctx.stroke();
      // рёбра
      ctx.strokeStyle = 'rgba(58,84,44,0.55)';
      ctx.lineWidth = 1.6;
      for (var i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(sx + i * 6, base - h2 + 10);
        ctx.lineTo(sx + i * 6, base - 4);
        ctx.stroke();
      }
      // цветок
      ctx.fillStyle = '#f0a0a0';
      ctx.beginPath();
      ctx.arc(sx, base - h2 + 3, 6, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = '#5f3f22';
      ctx.lineWidth = 2;
      ctx.stroke();
    } else {
      // сухой куст
      ctx.strokeStyle = '#7d5730';
      ctx.lineWidth = 3.4;
      ctx.lineCap = 'round';
      for (var b = -2; b <= 2; b++) {
        ctx.beginPath();
        ctx.moveTo(sx, base);
        ctx.quadraticCurveTo(sx + b * 12, base - o.h * 0.5, sx + b * 22, base - o.h * (0.7 + 0.1 * (b % 2 === 0 ? 1 : -1)));
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(122,79,36,0.9)';
      for (var q = 0; q < 5; q++) {
        ctx.beginPath();
        ctx.arc(sx + (q - 2) * 16, base - o.h * (0.55 + 0.09 * q), 5, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  /* --------------------------- гонщик -------------------------- */
  function drawRacer(r) {
    var sx = START_X + (r.x - G.camX) * PPM;
    if (sx < -320 || sx > W + 320) return;
    var lane = r.lane || 0;
    var laneY = LANE_DY[lane];
    var sc = LANE_SCALE[lane];
    var y = GROUND - laneY - r.h;

    // тень
    ctx.save();
    var scaleH = 1 - clamp(r.h / 420, 0, 0.5);
    ctx.globalAlpha = 0.22 * scaleH;
    ctx.fillStyle = '#4a2a12';
    ctx.beginPath();
    ctx.ellipse(sx + 6, GROUND - laneY + 4, 92 * sc * scaleH * 1.3, 12 * scaleH, 0, 0, TAU);
    ctx.fill();
    ctx.restore();

    // подсветка игрока
    if (r.isPlayer) {
      ctx.save();
      ctx.globalAlpha = 0.16 + Math.sin(G.t * 5) * 0.04;
      var pg = ctx.createRadialGradient(sx, y - 2, 4, sx, y - 2, 120);
      pg.addColorStop(0, 'rgba(120,255,230,0.6)');
      pg.addColorStop(1, 'rgba(120,255,230,0)');
      ctx.fillStyle = pg;
      ctx.beginPath();
      ctx.ellipse(sx, y - 2, 120, 30, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    var pose = {
      t: G.t + r.seedT,
      phase: r.phase,
      air: r.airborne ? clamp(r.h / 95, 0, 1) : 0,
      vy: r.vh,
      speed: r.speed,
      stumble: r.stumble > 0 ? clamp(r.stumble / 0.95, 0, 1) : 0,
      squash: r.squash
    };

    ctx.save();
    if (lane > 0) ctx.globalAlpha = 0.94;
    Jerboa.draw(ctx, {
      x: sx, y: y, scale: sc,
      scarf: r.scarf, goggle: r.goggle,
      pose: pose
    });
    ctx.restore();

    // имя и место соперника
    if (!r.isPlayer) {
      var ly = y - 362 * sc;
      ctx.save();
      ctx.globalAlpha = 0.66;
      ctx.fillStyle = 'rgba(52,30,14,0.55)';
      rr(sx - 42, ly - 17, 84, 24, 12);
      ctx.fill();
      ctx.restore();
      txt(r.place + ' · ' + r.name, sx, ly, 12, '#ffeac4', 'center', '700', 0.85);
    } else {
      // метка игрока
      var my = y - 260;
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = '#8ff3dd';
      ctx.beginPath();
      ctx.moveTo(sx - 9, my - 16);
      ctx.lineTo(sx + 9, my - 16);
      ctx.lineTo(sx, my - 2);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      txt('ТЫ', sx, my - 22, 12, '#b7ffe9', 'center', '700', 0.9);
    }
  }

  /* --------------------------- линии скорости ------------------ */
  function drawSpeedLines() {
    var p = G.player;
    if (!p) return;
    var k = clamp((p.speed - 24) / 14, 0, 1);
    if (k <= 0.02) return;
    var sprint = p.sprintFx > 0 ? 1 : 0;
    ctx.save();
    ctx.strokeStyle = '#fff3d2';
    ctx.lineWidth = 2;
    for (var i = 0; i < 16; i++) {
      var y = 230 + ((i * 47) % 420);
      var x = ((i * 211 - G.t * (900 + i * 40)) % (W + 260) + W + 260) % (W + 260) - 130;
      var len = 30 + (i % 5) * 26 + sprint * 40;
      ctx.globalAlpha = (0.05 + k * 0.14) * (i % 3 === 0 ? 1 : 0.6);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + len, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  /* --------------------------- сцена --------------------------- */
  function drawScene(camPx, titleMode) {
    drawSky(camPx);
    drawMesas(camPx);
    drawDuneLayer(camPx, 0.1, '#e5b378', 40, GROUND - 40, 0.0016, 0.85);
    drawDuneLayer(camPx, 0.17, '#dca469', 30, GROUND - 18, 0.0023, 0.9);
    drawFarCacti(camPx);
    drawDuneLayer(camPx, 0.26, '#d1995c', 22, GROUND - 2, 0.0031, 1);
    drawGround(camPx);
    if (!titleMode) {
      drawArches(camPx);
      drawDistancePosts(camPx);
    }

    if (titleMode) return;

    // соперники по дальним дорожкам — позади препятствий и игрока
    var order = G.racers.slice().sort(function (a, b) { return (b.lane || 0) - (a.lane || 0); });
    var k;
    for (k = 0; k < order.length; k++) {
      if (!order[k].isPlayer) drawRacer(order[k]);
    }

    // препятствия на дорожке игрока
    for (var i = 0; i < G.obstacles.length; i++) {
      var osx = START_X + (G.obstacles[i].x - G.camX) * PPM;
      if (osx > -140 && osx < W + 140) drawObstacle(G.obstacles[i]);
    }

    // игрок всегда сверху
    drawRacer(G.player);

    // линии скорости
    drawSpeedLines();

    // частицы
    for (var p = 0; p < G.particles.length; p++) {
      var pt = G.particles[p];
      var px = START_X + (pt.x - G.camX) * PPM;
      var lifeK = clamp(pt.life / 0.9, 0, 1);
      ctx.save();
      ctx.globalAlpha = lifeK * (pt.kind === 'spark' ? 0.95 : 0.55);
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(px, pt.y, pt.size * (pt.kind === 'spark' ? 0.7 + lifeK * 0.5 : 1), 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    // всплывающие подписи
    for (var q = 0; q < G.popups.length; q++) {
      var pop = G.popups[q];
      var qx = pop.x;
      var a = clamp(pop.life / pop.max, 0, 1);
      txtOut(pop.text, qx, pop.y, 30, pop.color, 'center', '700', 7);
    }
  }

  /* --------------------------- HUD ----------------------------- */
  function drawHUD() {
    var p = G.player;
    if (!p) return;
    if (G.mode === 'results') return;

    // нижняя панель приборов
    ctx.save();
    ctx.fillStyle = 'rgba(48,28,13,0.42)';
    rr(14, H - 154, 256, 132, 16);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,214,160,0.12)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.restore();

    // верхняя левая карточка места
    ctx.save();
    ctx.fillStyle = 'rgba(58,34,16,0.58)';
    rr(22, 18, 196, 86, 18);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,214,160,0.16)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();

    txt('МЕСТО', 42, 46, 12, '#e9c89a', 'left', '700', 0.85);
    txtOut(p.place + ' / 4', 40, 92, 42, '#fff1cf', 'left', '700', 7);

    // прогресс
    var bx = 336, by = 38, bw = 620, bh = 11;
    ctx.save();
    ctx.fillStyle = 'rgba(58,34,16,0.5)';
    rr(bx - 8, by - 12, bw + 16, 38, 19);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.fillStyle = 'rgba(255,231,190,0.18)';
    rr(bx, by, bw, bh, 6);
    ctx.fill();
    var prog = clamp(p.x / RACE_LEN, 0, 1);
    var pg2 = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    pg2.addColorStop(0, '#ffca7a');
    pg2.addColorStop(1, '#ff8f4d');
    ctx.fillStyle = pg2;
    rr(bx, by, Math.max(6, bw * prog), bh, 6);
    ctx.fill();
    for (var m = 1; m < 4; m++) {
      ctx.fillStyle = 'rgba(58,34,16,0.4)';
      ctx.fillRect(bx + bw * m / 4, by - 2, 2, bh + 4);
    }
    ctx.restore();

    for (var i = 0; i < G.racers.length; i++) {
      var r = G.racers[i];
      var dotX = bx + bw * clamp(r.x / RACE_LEN, 0, 1);
      var dotY = by + bh / 2 + (r.isPlayer ? 0 : (i % 2 ? -7 : 7));
      ctx.save();
      ctx.beginPath();
      ctx.arc(dotX, dotY, r.isPlayer ? 7 : 5, 0, TAU);
      ctx.fillStyle = r.scarf;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = r.isPlayer ? '#fff8e0' : 'rgba(50,28,12,0.65)';
      ctx.stroke();
      ctx.restore();
    }
    txtOut('ФИНИШ', bx + bw + 18, by + 9, 13, '#ffe4b8', 'left', '700', 4);

    // скорость
    var spd = Math.round(p.speed * 3.6);
    txtOut(spd + '', W - 44, 66, 46, '#fff1cf', 'right', '700', 8);
    txt('КМ/Ч', W - 44, 92, 13, '#e9c89a', 'right', '700', 0.85);
    if (G.best) txt('РЕКОРД ' + G.best.toFixed(1) + ' с', W - 44, 118, 13, '#ffd79a', 'right', '700', 0.7);

    // поток и силы
    var flowX = 26, flowY = H - 104;
    txt('ПОТОК', flowX, flowY - 12, 12, '#ffdda9', 'left', '700', 0.9);
    for (var f = 0; f < 5; f++) {
      var on = p.flow >= f + 0.5;
      ctx.save();
      ctx.fillStyle = on ? '#ffd166' : 'rgba(58,34,16,0.4)';
      if (on) {
        ctx.shadowColor = 'rgba(255,200,90,0.7)';
        ctx.shadowBlur = 12;
      }
      rr(flowX + f * 46, flowY, 38, 17, 6);
      ctx.fill();
      ctx.restore();
    }
    var stamX = flowX, stamY = flowY + 44;
    txt('СИЛЫ', stamX, stamY - 8, 12, '#ffdda9', 'left', '700', 0.9);
    ctx.save();
    ctx.fillStyle = 'rgba(58,34,16,0.45)';
    rr(stamX, stamY, 220, 12, 6);
    ctx.fill();
    var sg = ctx.createLinearGradient(stamX, 0, stamX + 220, 0);
    sg.addColorStop(0, '#7fe0c0');
    sg.addColorStop(1, '#3fae91');
    ctx.fillStyle = sg;
    rr(stamX, stamY, Math.max(3, 220 * p.stamina / 100), 12, 6);
    ctx.fill();
    ctx.restore();

    // подсказка
    if (G.hintT < 14 && !G.isTouch) {
      var ha = clamp(14 - G.hintT, 0, 1) * 0.8;
      ctx.save();
      ctx.globalAlpha = ha;
      ctx.fillStyle = 'rgba(48,28,13,0.38)';
      rr(W / 2 - 296, H - 58, 592, 36, 18);
      ctx.fill();
      ctx.restore();
      txt('ПРОБЕЛ — прыжок     SHIFT — спурт     P — пауза', W / 2, H - 34, 15,
        '#ffe9c8', 'center', '700', ha);
    }

    // красная вспышка при столкновении
    if (G.hitFlash > 0) {
      ctx.save();
      ctx.globalAlpha = G.hitFlash * 0.5;
      var vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.8);
      vg.addColorStop(0, 'rgba(255,80,40,0)');
      vg.addColorStop(1, 'rgba(220,50,20,0.85)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }

    if (G.isTouch) drawTouchButtons();
  }

  function drawTouchButtons() {
    ctx.save();
    ctx.globalAlpha = 0.72;
    ctx.fillStyle = 'rgba(58,34,16,0.6)';
    ctx.strokeStyle = 'rgba(255,220,170,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(W - 118, H - 118, 62, 0, TAU);
    ctx.fill();
    ctx.stroke();
    txt('СПУРТ', W - 118, H - 112, 16, '#ffe4b8', 'center', '700', 0.9);

    ctx.beginPath();
    ctx.arc(W - 262, H - 92, 46, 0, TAU);
    ctx.fill();
    ctx.stroke();
    txt('ПРЫЖОК', W - 262, H - 86, 13, '#ffe4b8', 'center', '700', 0.9);
    ctx.restore();
  }

  /* --------------------------- экраны -------------------------- */
  function drawCountdown() {
    if (G.goFlash > 0) {
      var a = clamp(G.goFlash / 0.8, 0, 1);
      var scl = 1 + (1 - a) * 0.3;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(W / 2, H / 2 - 30);
      ctx.scale(scl, scl);
      txtOut('ПОШЛИ!', 0, 0, 92, '#9df0d2', 'center', '700', 12);
      ctx.restore();
    }
    if (G.mode !== 'countdown') return;
    var n = Math.ceil(G.countdown - 0.6);
    if (n <= 0) return;
    var frac = 1 - ((G.countdown - 0.6) % 1);
    var scale = 1 + (1 - frac) * 0.18;
    ctx.save();
    ctx.translate(W / 2, H / 2 - 40);
    ctx.scale(scale, scale);
    ctx.globalAlpha = 0.95;
    txtOut(n + '', 0, 0, 170, '#fff3d8', 'center', '700', 16);
    ctx.restore();
  }

  function drawTitle() {
    var hero = G.player || { phase: 0 };
    var camPx = 0;

    // сцена
    drawScene(camPx, true);

    // большой тушканчик
    var hx = 960, hy = GROUND - 4;
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = '#4a2a12';
    ctx.beginPath();
    ctx.ellipse(hx + 8, GROUND + 6, 132, 15, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
    Jerboa.draw(ctx, {
      x: hx, y: hy, scale: 1.44,
      scarf: '#2e9e96', goggle: '#2e9e96',
      pose: {
        t: G.t,
        phase: hero.phase || 0,
        air: 0,
        vy: 0,
        speed: 0,
        stumble: 0,
        squash: 1
      }
    });

    // затемнение слева под текст
    var shade = ctx.createLinearGradient(0, 0, 820, 0);
    shade.addColorStop(0, 'rgba(38,20,8,0.74)');
    shade.addColorStop(0.55, 'rgba(38,20,8,0.36)');
    shade.addColorStop(1, 'rgba(38,20,8,0)');
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, 820, H);

    // заголовок
    txtOut('ТУШКАНЧИКИ', 74, 166, 82, '#fff0cd', 'left', '700', 12);
    txtOut('НА СТАРТЕ', 76, 248, 82, '#ffcf8a', 'left', '700', 12);
    txt('ГОНКИ ПО ПУСТЫНЕ', 80, 292, 19, '#ffe1b0', 'left', '700', 0.8);

    // описание
    txt('Прыгай в такт приземления — лови поток.', 80, 344, 17, '#ffe9c8', 'left', '400', 0.9);
    txt('Перепрыгивай кактусы и обгони трёх соперников.', 80, 370, 17, '#ffe9c8', 'left', '400', 0.9);
    txt('Дистанция 850 м · Пробел — прыжок · Shift — спурт', 80, 396, 13, '#ffdca8', 'left', '400', 0.68);

    // клавиши
    var kx = 80, ky = 424;
    var rows = [
      ['ПРОБЕЛ', 'прыжок (тап по экрану)'],
      ['SHIFT', 'спурт, пока есть силы'],
      ['P / M / R', 'пауза / звук / заново']
    ];
    for (var i = 0; i < rows.length; i++) {
      var y = ky + i * 34;
      ctx.save();
      ctx.fillStyle = 'rgba(255,238,206,0.14)';
      rr(kx, y - 19, 96, 26, 7);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,225,175,0.35)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
      txt(rows[i][0], kx + 48, y, 13, '#ffeccd', 'center', '700');
      txt(rows[i][1], kx + 112, y, 16, '#ffe9c8', 'left', '400', 0.9);
    }

    // кнопка
    var pulse = 1 + Math.sin(G.t * 3) * 0.02;
    var bw = 236, bh = 64, bx = 80, by = 540;
    ctx.save();
    ctx.translate(bx + bw / 2, by + bh / 2);
    ctx.scale(pulse, pulse);
    ctx.shadowColor = 'rgba(255,170,70,0.55)';
    ctx.shadowBlur = 24;
    var bg = ctx.createLinearGradient(0, -bh / 2, 0, bh / 2);
    bg.addColorStop(0, '#ffcf7f');
    bg.addColorStop(1, '#f08a3c');
    ctx.fillStyle = bg;
    rr(-bw / 2, -bh / 2, bw, bh, 20);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(90,45,16,0.6)';
    ctx.lineWidth = 3;
    ctx.stroke();
    txt('СТАРТ', 0, 11, 32, '#4a240c', 'center', '700');
    ctx.restore();
    G.ui.startBtn = [bx, by, bw, bh];

    txt('или нажми ПРОБЕЛ', 198, 634, 15, '#ffe1b0', 'center', '400', 0.75);

    // рекорд
    if (G.best) {
      txt('ЛУЧШЕЕ ВРЕМЯ: ' + G.best.toFixed(1) + ' с', 80, 684, 14, '#ffd79a', 'left', '700', 0.8);
    } else {
      txt('РЕКОРДА ПОКА НЕТ — СТАНЬ ПЕРВЫМ', 80, 684, 13, '#ffd79a', 'left', '700', 0.6);
    }

    // карточка-референс
    if (G.refReady) {
      ctx.save();
      ctx.translate(1196, 92);
      ctx.rotate(0.06);
      ctx.fillStyle = 'rgba(255,250,238,0.94)';
      rr(-57, -57, 114, 114, 10);
      ctx.fill();
      ctx.strokeStyle = 'rgba(60,35,15,0.4)';
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.drawImage(refImg, -50, -50, 100, 100);
      ctx.restore();
      txt('ТВОЙ ТУШКАНЧИК', 1196, 170, 10, '#ffe6bd', 'center', '700', 0.75);
    }
  }

  function drawPause() {
    if (G.mode !== 'paused') return;
    ctx.save();
    ctx.fillStyle = 'rgba(30,16,7,0.6)';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    txtOut('ПАУЗА', W / 2, H / 2 - 16, 74, '#fff0cd', 'center', '700', 12);
    txt('P — продолжить', W / 2, H / 2 + 48, 20, '#ffe1b0', 'center', '400', 0.9);
    txt('R — начать заново     ESC — в меню', W / 2, H / 2 + 84, 17, '#ffe1b0', 'center', '400', 0.72);
  }

  function drawResults() {
    if (G.mode !== 'results' || !G.results) return;
    var res = G.results;
    ctx.save();
    ctx.fillStyle = 'rgba(28,15,6,0.55)';
    ctx.fillRect(0, 0, W, H);

    var pw = 720, ph = 470, px = (W - pw) / 2, py = 110;
    G.ui.panel = [px, py, pw, ph];
    ctx.fillStyle = 'rgba(46,27,13,0.95)';
    rr(px, py, pw, ph, 26);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,206,140,0.28)';
    ctx.lineWidth = 2;
    ctx.stroke();

    var medal = res.playerPlace === 1 ? '#ffd166' : res.playerPlace === 2 ? '#dfe3ea' : res.playerPlace === 3 ? '#e0a879' : '#ffb3a0';
    txt('ФИНИШ', px + pw / 2, py + 62, 20, '#ffcf8a', 'center', '700', 0.85);
    txtOut(res.playerPlace + ' МЕСТО', px + pw / 2, py + 132, 64, medal, 'center', '700', 12);

    // строки
    var rowY = py + 180;
    for (var i = 0; i < res.rows.length; i++) {
      var row = res.rows[i];
      var y = rowY + i * 40;
      ctx.save();
      if (row.isPlayer) {
        ctx.fillStyle = 'rgba(46,158,150,0.16)';
        rr(px + 44, y - 26, pw - 88, 36, 10);
        ctx.fill();
        ctx.strokeStyle = 'rgba(78,220,200,0.35)';
        ctx.lineWidth = 1.4;
        ctx.stroke();
      }
      ctx.restore();
      txt(row.place + '.', px + 66, y, 18, row.isPlayer ? '#9df0d2' : '#ffe4b8', 'left', '700', 0.95);
      txt(row.name, px + 104, y, 19, row.isPlayer ? '#d8fff4' : '#fff0d2', 'left', '700', 0.95);
      txt(row.time.toFixed(1) + ' с', px + pw - 68, y, 19, row.isPlayer ? '#d8fff4' : '#ffdfae', 'right', '700', 0.95);
    }

    // рекорд
    var by = rowY + res.rows.length * 40 + 12;
    if (res.newRecord) {
      txt('НОВЫЙ РЕКОРД!', px + pw / 2, by, 22, '#ffd166', 'center', '700', 1);
    } else {
      txt('ЛУЧШЕЕ ВРЕМЯ: ' + G.best.toFixed(1) + ' с', px + pw / 2, by, 16, '#ffd79a', 'center', '700', 0.8);
    }

    // кнопки
    var b1 = [px + 74, py + ph - 92, 268, 56];
    var b2 = [px + pw - 74 - 210, py + ph - 92, 210, 56];
    G.ui.restart = b1;
    G.ui.menu = b2;
    ctx.save();
    var bg = ctx.createLinearGradient(0, b1[1], 0, b1[1] + b1[3]);
    bg.addColorStop(0, '#ffcf7f');
    bg.addColorStop(1, '#f08a3c');
    ctx.fillStyle = bg;
    rr(b1[0], b1[1], b1[2], b1[3], 16);
    ctx.fill();
    ctx.strokeStyle = 'rgba(90,45,16,0.55)';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    txt('ЕЩЁ РАЗ  ·  ПРОБЕЛ', b1[0] + b1[2] / 2, b1[1] + 37, 19, '#4a240c', 'center', '700');
    ctx.restore();

    ctx.save();
    ctx.fillStyle = 'rgba(255,236,206,0.1)';
    rr(b2[0], b2[1], b2[2], b2[3], 16);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,225,175,0.4)';
    ctx.lineWidth = 2;
    ctx.stroke();
    txt('В МЕНЮ  ·  ESC', b2[0] + b2[2] / 2, b2[1] + 36, 17, '#ffe4b8', 'center', '700', 0.9);
    ctx.restore();
  }

  function drawVignette() {
    var vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 0.95);
    vg.addColorStop(0, 'rgba(40,20,6,0)');
    vg.addColorStop(1, 'rgba(30,14,4,0.4)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
  }

  /* --------------------------- отрисовка ---------------------- */
  function render() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    var camPx = G.camX * PPM;

    if (G.mode === 'title') {
      drawTitle();
      drawVignette();
      return;
    }

    ctx.save();
    if (G.shake > 0.2) {
      ctx.translate((Math.random() - 0.5) * G.shake, (Math.random() - 0.5) * G.shake * 0.7);
    }
    drawScene(camPx, false);
    ctx.restore();

    drawVignette();
    drawHUD();
    drawCountdown();
    drawPause();
    drawResults();

    if (G.debug) {
      var dbg = 'x=' + G.player.x.toFixed(1) + ' spd=' + G.player.speed.toFixed(1) +
        ' flow=' + G.player.flow.toFixed(2) + ' air=' + (G.player.airborne ? 1 : 0) +
        ' place=' + G.player.place + ' t=' + G.raceTime.toFixed(1);
      txt(dbg, 20, H - 150, 14, '#ffffff', 'left', '400', 0.8);
    }
  }

  /* --------------------------- цикл ---------------------------- */
  function fitCanvas() {
    var vw = window.innerWidth, vh = window.innerHeight;
    var pad = 16;
    var w = Math.min(vw - pad * 2, (vh - pad * 2) * 16 / 9);
    var h = w * 9 / 16;
    if (w < 320) { w = vw - 8; h = w * 9 / 16; }
    canvas.style.width = Math.round(w) + 'px';
    canvas.style.height = Math.round(h) + 'px';
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
  }

  function loop(now) {
    var dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
    last = now;
    if (!G.freeze) {
      update(dt);
    } else {
      G.t += dt;
    }
    render();
    requestAnimationFrame(loop);
  }

  var last = 0;

  /* --------------------------- инициализация ------------------- */
  function loadBest() {
    try {
      var v = parseFloat(localStorage.getItem('jerboa-race-best-v1'));
      return isFinite(v) && v > 0 ? v : 0;
    } catch (e) { return 0; }
  }
  function saveBest(v) {
    try { localStorage.setItem('jerboa-race-best-v1', String(v)); } catch (e) { /* ок */ }
  }

  function init() {
    fitCanvas();
    window.addEventListener('resize', fitCanvas);
    G.best = loadBest();
    G.isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

    var params = new URLSearchParams(window.location.search);
    G.auto = params.get('auto') === '1';
    G.freeze = params.get('freeze') === '1';
    G.debug = params.get('debug') === '1';
    var seek = parseFloat(params.get('seek') || '0');

    G.obstacles = buildTrack(G.seed);
    makeRacers();
    G.racers.forEach(function (r) { r.x = r.startX; });
    bindInput();

    if (G.auto) {
      startRace();
    }

    if (seek > 0) {
      if (!G.auto) startRace();
      var steps = Math.round(seek * 60);
      for (var i = 0; i < steps; i++) update(1 / 60);
    }

    render();
    requestAnimationFrame(loop);
  }

  init();
})();
