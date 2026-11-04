import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import * as esbuild from 'esbuild';

// Minimal Pure-JS ZIP creator (STORE / DEFLATE) so it works everywhere without external zip binaries
function createZipBuffer(files) {
  const localHeaders = [];
  const centralHeaders = [];
  let offset = 0;

  // CRC32 table
  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    crcTable[n] = c >>> 0;
  }
  function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
  }

  for (const file of files) {
    const nameBuf = Buffer.from(file.name, 'utf8');
    const rawBuf = Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data, 'utf8');
    const crc = crc32(rawBuf);
    const deflated = zlib.deflateRawSync(rawBuf);
    const useDeflate = deflated.length < rawBuf.length;
    const compBuf = useDeflate ? deflated : rawBuf;
    const method = useDeflate ? 8 : 0;

    const lh = Buffer.alloc(30 + nameBuf.length);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(0x0800, 6); // UTF-8 flag
    lh.writeUInt16LE(method, 8);
    lh.writeUInt16LE(0, 10);
    lh.writeUInt16LE(0, 12);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(compBuf.length, 18);
    lh.writeUInt32LE(rawBuf.length, 22);
    lh.writeUInt16LE(nameBuf.length, 26);
    lh.writeUInt16LE(0, 28);
    nameBuf.copy(lh, 30);

    localHeaders.push(lh, compBuf);

    const ch = Buffer.alloc(46 + nameBuf.length);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0x0800, 8); // UTF-8 flag
    ch.writeUInt16LE(method, 10);
    ch.writeUInt16LE(0, 12);
    ch.writeUInt16LE(0, 14);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(compBuf.length, 20);
    ch.writeUInt32LE(rawBuf.length, 24);
    ch.writeUInt16LE(nameBuf.length, 28);
    ch.writeUInt16LE(0, 30);
    ch.writeUInt16LE(0, 32);
    ch.writeUInt16LE(0, 34);
    ch.writeUInt16LE(0, 36);
    ch.writeUInt32LE(0, 38);
    ch.writeUInt32LE(offset, 42);
    nameBuf.copy(ch, 46);

    centralHeaders.push(ch);
    offset += lh.length + compBuf.length;
  }

  const centralSize = centralHeaders.reduce((acc, b) => acc + b.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localHeaders, ...centralHeaders, eocd]);
}

async function main() {
  const pngBuf = fs.readFileSync('public/assets/jerboa.png');
  const b64Img = `data:image/png;base64,${pngBuf.toString('base64')}`;

  // Bundle standalone vanilla runner using our TypeScript game modules (rules, textures, jerboa, renderer, sound)
  const standaloneEntry = `
import {
  W, H, HORIZON_Y, GROUND, START_X, PPM, RACE_LEN, LANE_DY, LANE_SCALE, TAU,
  PLAYER_SKINS, clamp, getLaneGroundY, buildTrack, createRacers, advanceRacer,
  settleFinishedRacer, stepAIRacer, decideAutoPlayer, computePlaces, buildResults
} from '../src/game/rules.ts';
import { Sfx } from '../src/game/sound.ts';
import { renderWorldCanvas, rr, txt, txtOut } from '../src/game/renderer.ts';

(function() {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const MAX_PARTICLES = 260;
  const particles = Array.from({ length: MAX_PARTICLES }, () => ({
    active: false, kind: 'dust', x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 4, grav: 260, color: '#f2d6a6'
  }));
  let particleCursor = 0;

  const refImg = new Image();
  let refReady = false;
  refImg.onload = () => { refReady = true; };
  refImg.src = window.__JERBOA_REF_SRC__ || 'assets/jerboa.png';

  function loadBest() {
    try {
      const v = parseFloat(localStorage.getItem('jerboa-race-best-v1') || '');
      return Number.isFinite(v) && v > 0 ? v : 0;
    } catch { return 0; }
  }
  function saveBest(v) {
    try { localStorage.setItem('jerboa-race-best-v1', String(v)); } catch {}
  }

  const initRacers = createRacers(0);
  const G = {
    mode: 'title',
    resumeMode: 'race',
    t: 0,
    raceTime: 0,
    countdown: 3.6,
    lastCount: -1,
    goFlash: 0,
    camX: 0,
    shake: 0,
    hitFlash: 0,
    hitstop: 0,
    finishTimer: 0,
    seed: 20261104,
    skinIdx: 0,
    best: loadBest(),
    newRecord: false,
    auto: false,
    freeze: false,
    muted: false,
    obstacles: buildTrack(20261104),
    racers: initRacers.racers,
    player: initRacers.player,
    particles,
    popups: [],
    results: null,
    jumpQueued: false,
    sprintHeld: false,
    touchSprintHeld: false,
    ui: {}
  };

  function spawnDust(worldX, count, big = false, groundY = GROUND) {
    for (let i = 0; i < count; i++) {
      const p = G.particles[particleCursor];
      particleCursor = (particleCursor + 1) % MAX_PARTICLES;
      p.active = true;
      p.kind = 'dust';
      p.x = worldX + (Math.random() - 0.5) * 1.6;
      p.y = groundY - 2 - Math.random() * 6;
      p.vx = -(20 + Math.random() * 90);
      p.vy = -(12 + Math.random() * (big ? 130 : 62));
      p.max = 0.48 + Math.random() * 0.42;
      p.life = p.max;
      p.size = 3.2 + Math.random() * (big ? 8.5 : 5.5);
      p.grav = 260;
      p.color = Math.random() > 0.35 ? '#f5dab0' : '#e6be86';
    }
  }

  function burstSpark(worldX, py, color = '#ffe27a') {
    for (let i = 0; i < 18; i++) {
      const p = G.particles[particleCursor];
      particleCursor = (particleCursor + 1) % MAX_PARTICLES;
      const a = Math.random() * TAU;
      const sp = 65 + Math.random() * 220;
      p.active = true;
      p.kind = 'spark';
      p.x = worldX;
      p.y = py;
      p.vx = Math.cos(a) * sp;
      p.vy = Math.sin(a) * sp - 60;
      p.max = 0.42 + Math.random() * 0.38;
      p.life = p.max;
      p.size = 2.4 + Math.random() * 3.2;
      p.grav = 620;
      p.color = color;
    }
  }

  function pushPopup(text, color = '#fff3d8', worldX, py) {
    const sx = worldX != null ? START_X + (worldX - G.camX) * PPM : START_X + (G.player.x - G.camX) * PPM;
    for (let i = G.popups.length - 1; i >= 0; i--) {
      if (G.popups[i].text === text) G.popups.splice(i, 1);
    }
    G.popups.push({ text, color, x: sx, y: py != null ? py : GROUND - 365, life: 0.95, max: 0.95 });
    if (G.popups.length > 6) G.popups.shift();
  }

  function startRace(fromGesture = false) {
    if (fromGesture) Sfx.unlockFromGesture(); else Sfx.init();
    const { racers, player } = createRacers(G.skinIdx);
    G.obstacles = buildTrack(G.seed);
    G.racers = racers;
    G.player = player;
    G.mode = 'countdown';
    G.resumeMode = 'countdown';
    G.countdown = 3.6;
    G.lastCount = -1;
    G.goFlash = 0;
    G.raceTime = 0;
    G.camX = player.x - 5;
    G.shake = 0;
    G.hitFlash = 0;
    G.hitstop = 0;
    G.finishTimer = 0;
    G.newRecord = false;
    G.results = null;
    G.jumpQueued = false;
    G.sprintHeld = false;
    G.touchSprintHeld = false;
    G.popups = [];
    for (let i = 0; i < G.particles.length; i++) G.particles[i].active = false;
  }

  function cycleSkin() {
    G.skinIdx = (G.skinIdx + 1) % PLAYER_SKINS.length;
    const sk = PLAYER_SKINS[G.skinIdx];
    G.player.scarf = sk.scarf;
    G.player.goggle = sk.goggle;
    G.player.coatColor = sk.coatColor;
    G.player.furTint = sk.furTint;
  }

  function update(dt) {
    G.t += dt;
    for (let i = 0; i < G.particles.length; i++) {
      const p = G.particles[i];
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) { p.active = false; continue; }
      p.x += (p.vx * dt) / PPM;
      p.y += p.vy * dt;
      p.vy += p.grav * dt;
      p.vx *= 1 - dt * 1.5;
    }
    for (let i = G.popups.length - 1; i >= 0; i--) {
      const q = G.popups[i];
      q.life -= dt;
      q.y -= 26 * dt;
      if (q.life <= 0) G.popups.splice(i, 1);
    }
    G.shake *= Math.exp(-7 * dt);
    if (G.shake < 0.15) G.shake = 0;
    G.hitFlash = Math.max(0, G.hitFlash - dt * 2.2);
    if (G.hitstop > 0) { G.hitstop = Math.max(0, G.hitstop - dt); return; }
    if (G.mode === 'title' || G.mode === 'paused') return;
    if (G.mode === 'results') {
      for (let i = 0; i < G.racers.length; i++) settleFinishedRacer(G.racers[i], dt, G.raceTime);
      return;
    }
    if (G.mode === 'countdown') {
      G.countdown -= dt;
      const n = Math.ceil(G.countdown - 0.6);
      if (n > 0 && n !== G.lastCount) { G.lastCount = n; Sfx.count(false); }
      if (G.countdown <= 0.6) {
        G.mode = 'race';
        G.countdown = 0;
        G.goFlash = 0.8;
        Sfx.count(true);
        pushPopup('ПОШЛИ!', '#8ff7d8');
      }
      for (let i = 0; i < G.racers.length; i++) {
        const r = G.racers[i];
        r.squash += (1 - r.squash) * Math.min(1, dt * 8);
        r.dustT -= dt;
        if (r.dustT <= 0) {
          r.dustT = 0.5 + Math.random() * 0.4;
          if (Math.random() < 0.6) spawnDust(r.x, 1, false, getLaneGroundY(r.lane));
        }
      }
      computePlaces(G.racers);
      G.camX = G.player.x - 5;
      return;
    }
    if (G.mode === 'race') {
      G.raceTime += dt;
      G.goFlash = Math.max(0, G.goFlash - dt);
      const p = G.player;
      const pGroundY = getLaneGroundY(p.lane);
      let jump = G.jumpQueued;
      G.jumpQueued = false;
      let sprint = (G.sprintHeld || G.touchSprintHeld) && !G.auto;
      if (G.auto) {
        const dec = decideAutoPlayer(p, G.obstacles, G.raceTime);
        jump = dec.jump; sprint = dec.sprint;
      }
      const pEv = advanceRacer(p, dt, G.raceTime, G.obstacles, jump, sprint, 1);
      if (pEv.jumped) {
        if (pEv.perfect) {
          burstSpark(p.x, pGroundY - p.h - 8, '#ffe27a');
          Sfx.perfect(p.combo);
          pushPopup(p.flow >= 1.5 ? 'ИДЕАЛЬНО! ×' + Math.round(p.flow) : 'ИДЕАЛЬНО!', '#ffe89a');
          G.shake = Math.max(G.shake, 2.6);
        } else Sfx.hop();
        spawnDust(p.x, 9, false, pGroundY);
      }
      if (pEv.landed && !pEv.jumped) {
        Sfx.land();
        spawnDust(p.x, 14, true, pGroundY);
        G.shake = Math.max(G.shake, 2.2);
      }
      if (pEv.spawnedRunDust) spawnDust(p.x - 1.4, 2, false, pGroundY);
      if (pEv.hitObstacle) {
        spawnDust(p.x, 22, true, pGroundY);
        burstSpark(p.x + 1, pGroundY - 28, '#ff9a7a');
        G.shake = 14; G.hitFlash = 0.55; G.hitstop = 0.045;
        Sfx.stumble(); pushPopup('ОЙ!', '#ff9a7a');
      }
      for (let j = 1; j < G.racers.length; j++) {
        const ai = G.racers[j];
        const aiGroundY = getLaneGroundY(ai.lane);
        if (ai.finished) {
          if (settleFinishedRacer(ai, dt, G.raceTime)) spawnDust(ai.x, 8, true, aiGroundY);
          continue;
        }
        const aiEv = stepAIRacer(ai, p.x, dt, G.raceTime, G.obstacles);
        if (aiEv.jumped) {
          spawnDust(ai.x, 5, false, aiGroundY);
          if (aiEv.perfect) burstSpark(ai.x, aiGroundY - ai.h - 8, '#ffe27a');
        }
        if (aiEv.landed) spawnDust(ai.x, 8, true, aiGroundY);
        if (aiEv.spawnedRunDust) spawnDust(ai.x - 1.4, 1, false, aiGroundY);
        if (aiEv.hitObstacle) spawnDust(ai.x, 12, true, aiGroundY);
      }
      for (let f = 0; f < G.racers.length; f++) {
        const r = G.racers[f];
        if (!r.finished && r.x >= RACE_LEN) {
          r.finished = true;
          r.finishTime = G.raceTime;
          if (r.isPlayer) {
            G.mode = 'finish';
            G.finishTimer = 1.35;
            p.speed *= 0.65;
            Sfx.finish();
            G.shake = 6;
            G.newRecord = !G.best || r.finishTime < G.best;
            if (G.newRecord) { G.best = r.finishTime; saveBest(G.best); }
            pushPopup('ФИНИШ!', '#ffe89a');
          }
        }
      }
      G.camX += (p.x - G.camX) * Math.min(1, dt * 9);
      computePlaces(G.racers);
      return;
    }
    if (G.mode === 'finish') {
      G.finishTimer -= dt;
      if (settleFinishedRacer(G.player, dt, G.raceTime)) {
        spawnDust(G.player.x, 12, true, getLaneGroundY(G.player.lane));
      }
      for (let j = 1; j < G.racers.length; j++) {
        const ai = G.racers[j];
        if (ai.finished) settleFinishedRacer(ai, dt, G.raceTime);
        else {
          stepAIRacer(ai, G.player.x, dt, G.raceTime, G.obstacles);
          if (ai.x >= RACE_LEN) { ai.finished = true; ai.finishTime = G.raceTime + (1.35 - G.finishTimer); }
        }
      }
      G.camX += (G.player.x - G.camX) * Math.min(1, dt * 4);
      if (G.finishTimer <= 0) {
        G.results = buildResults(G.racers, G.player, G.raceTime, G.newRecord);
        G.mode = 'results';
      }
    }
  }

  function drawCanvasOverlays() {
    const p = G.player;
    if (G.mode === 'title') {
      txtOut(ctx, 'ТУШКАНЧИКИ', 74, 162, 76, '#fff2d4', 'left', '900', 12);
      txtOut(ctx, 'НА СТАРТЕ', 76, 240, 76, '#ffca7a', 'left', '900', 12);
      txt(ctx, 'ГОНКИ ПО ПУСТЫНЕ · 850 М · 4 ДОРОЖКИ', 80, 282, 17, '#ffdca8', 'left', '800', 0.9);
      txt(ctx, 'Прыгай в такт приземления — лови золотой поток скорости.', 80, 328, 17, '#ffe9c8', 'left', '600', 0.95);
      txt(ctx, 'Перепрыгивай сагуаро и валуны, удерживай спурт и обгони соперников!', 80, 354, 17, '#ffe9c8', 'left', '600', 0.95);

      const sk = PLAYER_SKINS[G.skinIdx];
      ctx.save();
      ctx.fillStyle = 'rgba(54, 28, 12, 0.85)';
      rr(ctx, 80, 384, 340, 42, 12);
      ctx.fill();
      ctx.strokeStyle = sk.scarf;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
      txt(ctx, 'ЭКИПИРОВКА [C]: ' + sk.title.toUpperCase(), 98, 410, 14, '#fff1cf', 'left', '800');
      G.ui.skinBtn = [80, 384, 340, 42];

      const bx = 80, by = 456, bw = 240, bh = 62;
      ctx.save();
      ctx.fillStyle = '#f29d38';
      rr(ctx, bx, by, bw, bh, 16);
      ctx.fill();
      ctx.strokeStyle = '#ffe0a3';
      ctx.lineWidth = 3;
      ctx.stroke();
      txt(ctx, 'СТАРТ · ПРОБЕЛ', bx + bw / 2, by + 39, 22, '#2e1505', 'center', '900');
      ctx.restore();
      G.ui.startBtn = [bx, by, bw, bh];

      txt(ctx, 'ПРОБЕЛ / КЛИК — прыжок · SHIFT — спурт · C — цвет · P — пауза · M — звук', 80, 682, 14, '#ffe4b5', 'left', '700', 0.85);
      if (refReady) {
        ctx.save();
        ctx.translate(1180, 96);
        ctx.rotate(0.05);
        ctx.fillStyle = '#fff9eb';
        rr(ctx, -58, -58, 116, 116, 12);
        ctx.fill();
        ctx.strokeStyle = '#6e3f19';
        ctx.lineWidth = 2.5;
        ctx.stroke();
        ctx.drawImage(refImg, -50, -50, 100, 100);
        ctx.restore();
      }
      return;
    }

    if (G.mode === 'countdown' || G.mode === 'race' || G.mode === 'finish') {
      // Top Left Place Plaque
      ctx.save();
      ctx.fillStyle = 'rgba(54, 28, 12, 0.88)';
      rr(ctx, 22, 18, 210, 78, 14);
      ctx.fill();
      ctx.strokeStyle = 'rgba(235, 182, 112, 0.4)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
      txt(ctx, 'МЕСТО', 38, 42, 12, '#e9c89a', 'left', '800');
      txtOut(ctx, p.place + ' / 4', 38, 82, 36, '#fff3d6', 'left', '900', 6);
      txt(ctx, Math.round(G.raceTime) + ' с', 162, 78, 22, '#ffe4b5', 'left', '800');

      // Top Center Progress
      const bx = 330, by = 38, bw = 600, bh = 12;
      ctx.save();
      ctx.fillStyle = 'rgba(54, 28, 12, 0.88)';
      rr(ctx, bx - 16, by - 16, bw + 32, 44, 14);
      ctx.fill();
      ctx.fillStyle = '#241205';
      rr(ctx, bx, by, bw, bh, 6);
      ctx.fill();
      const prog = clamp(p.x / RACE_LEN, 0, 1);
      ctx.fillStyle = '#f29d38';
      rr(ctx, bx, by, Math.max(6, bw * prog), bh, 6);
      ctx.fill();
      for (let i = 0; i < G.racers.length; i++) {
        const r = G.racers[i];
        const dx = bx + bw * clamp(r.x / RACE_LEN, 0, 1);
        ctx.beginPath();
        ctx.arc(dx, by + bh / 2, r.isPlayer ? 7.5 : 5.5, 0, TAU);
        ctx.fillStyle = r.scarf;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = r.isPlayer ? '#fffbe6' : '#2b1506';
        ctx.stroke();
      }
      ctx.restore();

      // Top Right Speed
      ctx.save();
      ctx.fillStyle = 'rgba(54, 28, 12, 0.88)';
      rr(ctx, W - 188, 18, 166, 78, 14);
      ctx.fill();
      ctx.strokeStyle = 'rgba(235, 182, 112, 0.4)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
      txt(ctx, 'СКОРОСТЬ · КМ/Ч', W - 38, 42, 12, '#e9c89a', 'right', '800');
      txtOut(ctx, String(Math.round(p.speed * 3.6)), W - 38, 82, 38, '#fff3d6', 'right', '900', 6);

      // Bottom Left Flow & Stamina
      ctx.save();
      ctx.fillStyle = 'rgba(54, 28, 12, 0.88)';
      rr(ctx, 22, H - 118, 254, 98, 14);
      ctx.fill();
      ctx.strokeStyle = 'rgba(235, 182, 112, 0.4)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
      txt(ctx, 'ПОТОК СКОРОСТИ ×' + (Math.floor(p.flow) + 1), 38, H - 94, 12, '#ffdda9', 'left', '800');
      for (let f = 0; f < 5; f++) {
        const on = p.flow >= f + 0.5;
        ctx.fillStyle = on ? '#ffd166' : '#211004';
        rr(ctx, 38 + f * 44, H - 86, 38, 14, 4);
        ctx.fill();
      }
      txt(ctx, 'СИЛЫ ДЛЯ СПУРТА', 38, H - 48, 12, '#ffdda9', 'left', '800');
      ctx.fillStyle = '#211004';
      rr(ctx, 38, H - 40, 218, 12, 5);
      ctx.fill();
      ctx.fillStyle = '#38c9a8';
      rr(ctx, 38, H - 40, Math.max(4, 218 * (p.stamina / 100)), 12, 5);
      ctx.fill();
    }

    if (G.mode === 'paused') {
      ctx.fillStyle = 'rgba(20, 9, 2, 0.72)';
      ctx.fillRect(0, 0, W, H);
      txtOut(ctx, 'ПАУЗА', W / 2, H / 2 - 20, 72, '#fff2d4', 'center', '900', 12);
      txt(ctx, 'P — продолжить · R — заново · ESC — в меню', W / 2, H / 2 + 40, 20, '#ffe4b5', 'center', '700');
    }

    if (G.mode === 'results' && G.results) {
      const res = G.results;
      ctx.fillStyle = 'rgba(20, 9, 2, 0.72)';
      ctx.fillRect(0, 0, W, H);
      const pw = 640, ph = 430, px = (W - pw) / 2, py = 135;
      ctx.fillStyle = 'rgba(52, 28, 12, 0.96)';
      rr(ctx, px, py, pw, ph, 24);
      ctx.fill();
      ctx.strokeStyle = 'rgba(242, 192, 120, 0.45)';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      txt(ctx, 'ФИНИШНЫЙ ПРОТОКОЛ · 850 М', W / 2, py + 52, 16, '#ffcf8a', 'center', '800');
      txtOut(ctx, res.playerPlace + ' МЕСТО', W / 2, py + 116, 58, '#ffd166', 'center', '900', 10);

      for (let i = 0; i < res.rows.length; i++) {
        const row = res.rows[i];
        const y = py + 168 + i * 42;
        if (row.isPlayer) {
          ctx.fillStyle = 'rgba(40, 181, 168, 0.22)';
          rr(ctx, px + 44, y - 26, pw - 88, 36, 10);
          ctx.fill();
        }
        txt(ctx, row.place + '. ' + row.name, px + 64, y, 19, row.isPlayer ? '#d8fff8' : '#ffeac8', 'left', '800');
        txt(ctx, row.time.toFixed(1) + ' с', px + pw - 64, y, 19, row.isPlayer ? '#d8fff8' : '#ffeac8', 'right', '800');
      }

      const b1 = [px + 64, py + ph - 78, 250, 52];
      const b2 = [px + pw - 64 - 210, py + ph - 78, 210, 52];
      G.ui.restart = b1; G.ui.menu = b2;
      ctx.fillStyle = '#f29d38';
      rr(ctx, b1[0], b1[1], b1[2], b1[3], 14);
      ctx.fill();
      txt(ctx, 'ЕЩЁ РАЗ · ПРОБЕЛ', b1[0] + b1[2] / 2, b1[1] + 33, 18, '#2e1505', 'center', '900');

      ctx.fillStyle = 'rgba(88, 48, 20, 0.9)';
      rr(ctx, b2[0], b2[1], b2[2], b2[3], 14);
      ctx.fill();
      txt(ctx, 'В МЕНЮ · ESC', b2[0] + b2[2] / 2, b2[1] + 33, 17, '#ffe9c4', 'center', '800');
    }
  }

  function fitCanvas() {
    const vw = window.innerWidth, vh = window.innerHeight;
    const w = Math.min(vw, vh * 16 / 9);
    const h = w * 9 / 16;
    canvas.style.width = Math.round(w) + 'px';
    canvas.style.height = Math.round(h) + 'px';
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
  }

  function inRect(p, r) {
    return r && p.x >= r[0] && p.x <= r[0] + r[2] && p.y >= r[1] && p.y <= r[1] + r[3];
  }

  window.addEventListener('resize', fitCanvas);
  fitCanvas();

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    Sfx.unlockFromGesture();
    const rect = canvas.getBoundingClientRect();
    const p = { x: (e.clientX - rect.left) * (W / rect.width), y: (e.clientY - rect.top) * (H / rect.height) };
    if (G.mode === 'title') {
      if (inRect(p, G.ui.skinBtn)) { cycleSkin(); return; }
      startRace(true);
      return;
    }
    if (G.mode === 'results') {
      if (inRect(p, G.ui.restart)) { startRace(true); return; }
      if (inRect(p, G.ui.menu)) { G.mode = 'title'; return; }
      return;
    }
    if (G.mode === 'paused') { G.mode = G.resumeMode || 'race'; return; }
    if (G.mode === 'race') G.jumpQueued = true;
  });

  window.addEventListener('keydown', (e) => {
    const k = e.code;
    if (k === 'Space' || k === 'ArrowUp' || k === 'KeyW') e.preventDefault();
    if (e.repeat) return;
    Sfx.unlockFromGesture();
    if (k === 'KeyM') { G.muted = !G.muted; Sfx.setMuted(G.muted); return; }
    if (G.mode === 'title') {
      if (k === 'KeyC') { cycleSkin(); return; }
      if (k === 'Space' || k === 'Enter' || k === 'ArrowUp') startRace(true);
      return;
    }
    if (G.mode === 'results') {
      if (k === 'Space' || k === 'Enter' || k === 'KeyR') startRace(true);
      if (k === 'Escape') G.mode = 'title';
      return;
    }
    if (k === 'KeyP' || k === 'Escape') {
      if (G.mode === 'paused') G.mode = G.resumeMode || 'race';
      else { G.resumeMode = G.mode; G.mode = 'paused'; }
      return;
    }
    if (k === 'KeyR') { startRace(true); return; }
    if (k === 'ShiftLeft' || k === 'ShiftRight') G.sprintHeld = true;
    if (k === 'Space' || k === 'ArrowUp' || k === 'KeyW') {
      if (G.mode === 'race') G.jumpQueued = true;
    }
  });

  window.addEventListener('keyup', (e) => {
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') G.sprintHeld = false;
  });

  let last = 0;
  function loop(now) {
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
    last = now;
    if (!G.freeze) update(dt); else G.t += dt;

    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    renderWorldCanvas(ctx, G);
    drawCanvasOverlays();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
`;

  fs.writeFileSync('scripts/_standalone_entry.ts', standaloneEntry);
  const bundled = await esbuild.build({
    entryPoints: ['scripts/_standalone_entry.ts'],
    bundle: true,
    format: 'iife',
    target: ['es2020'],
    write: false,
  });
  fs.unlinkSync('scripts/_standalone_entry.ts');
  const bundledJs = bundled.outputFiles[0].text;

  const standaloneCss = `* { box-sizing: border-box; margin: 0; padding: 0; }
html, body {
  width: 100%; height: 100%; overflow: hidden;
  background: #1b0e05; color: #fff3d8;
  font-family: "Rubik", "Trebuchet MS", "Segoe UI", sans-serif;
  user-select: none; -webkit-user-select: none; touch-action: manipulation;
}
main.stage { width: 100vw; height: 100vh; display: flex; align-items: center; justify-content: center; }
canvas#game { display: block; border-radius: 12px; box-shadow: 0 24px 70px rgba(0,0,0,0.65); cursor: pointer; }
`;

  const indexHtmlMulti = `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <title>Тушканчики на старте — гонки по пустыне</title>
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <main class="stage">
    <canvas id="game" width="1280" height="720"></canvas>
  </main>
  <script src="game.js"></script>
</body>
</html>`;

  const standaloneSingleHtml = `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <title>Тушканчики на старте — гонки по пустыне (Standalone)</title>
  <style>${standaloneCss}</style>
</head>
<body>
  <main class="stage">
    <canvas id="game" width="1280" height="720"></canvas>
  </main>
  <script>window.__JERBOA_REF_SRC__ = "${b64Img}";</script>
  <script>${bundledJs}</script>
</body>
</html>`;

  const readmeMd = `# Тушканчики на старте — гонки по пустыне (Обновлённая версия)

## Что исправлено и улучшено
1. **Исправлен баг с соперниками в воздухе**:
   - Линия горизонта (\`HORIZON_Y = 512\`) отделена от полотна четырёхполосной трассы (\`512..720\`). Все 4 дорожки гонщиков (\`y = 548, 578, 610, 642\`) теперь находятся строго на песчаной дороге, а не висят в небе или барханах.
   - Добавлена функция \`settleFinishedRacer\`: гонщики (и ИИ, и игрок), пересекающие финишную черту в прыжке, корректно приземляются под действием гравитации и плавно тормозят, никогда не зависая в воздухе.
   - Анимация бега синхронизирована с реальной скоростью: на старте и после остановки тушканчики уверенно стоят обеими лапами на земле.
2. **Обновлены все текстуры и персонажи**:
   - Процедурные текстуры ветровой ряби на 3 слоях дюн, геологических пластов на столовых горах, песчаниковой трассы с 4 колеями, текстуры дерева, камня, кактусов сагуаро и меха тушканчика.
   - Двухпроходная бесшовная отрисовка лап и хвоста без внутренних чёрных швов на суставах.
   - Выбор экипировки (клавиша \`C\` или клик на стартовом экране).

## Как запустить
- **Без сервера (в один клик)**: откройте файл \`jerboa-race-standalone.html\` в любом браузере.
- **Обычная веб-папка**: откройте \`index.html\` или запустите локальный сервер (\`npx serve .\`).
`;

  fs.writeFileSync('public/jerboa-race-standalone.html', standaloneSingleHtml);

  const zipFiles = [
    { name: 'jerboa-race-standalone.html', data: standaloneSingleHtml },
    { name: 'index.html', data: indexHtmlMulti },
    { name: 'style.css', data: standaloneCss },
    { name: 'game.js', data: bundledJs },
    { name: 'README.md', data: readmeMd },
    { name: 'assets/jerboa.png', data: pngBuf },
    { name: 'src/App.tsx', data: fs.readFileSync('src/App.tsx') },
    { name: 'src/index.css', data: fs.readFileSync('src/index.css') },
    { name: 'src/game/rules.ts', data: fs.readFileSync('src/game/rules.ts') },
    { name: 'src/game/rules.test.ts', data: fs.readFileSync('src/game/rules.test.ts') },
    { name: 'src/game/textures.ts', data: fs.readFileSync('src/game/textures.ts') },
    { name: 'src/game/jerboa.ts', data: fs.readFileSync('src/game/jerboa.ts') },
    { name: 'src/game/renderer.ts', data: fs.readFileSync('src/game/renderer.ts') },
    { name: 'src/game/sound.ts', data: fs.readFileSync('src/game/sound.ts') },
  ];

  const zipBuf = createZipBuffer(zipFiles);
  fs.writeFileSync('public/jerboa-desert-race-fixed.zip', zipBuf);
  console.log('Created public/jerboa-desert-race-fixed.zip:', zipBuf.length, 'bytes');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
