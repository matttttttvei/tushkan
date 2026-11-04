import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  W,
  H,
  GROUND,
  START_X,
  PPM,
  RACE_LEN,
  TAU,
  PLAYER_SKINS,
  clamp,
  getLaneGroundY,
  buildTrack,
  createRacers,
  advanceRacer,
  settleFinishedRacer,
  stepAIRacer,
  decideAutoPlayer,
  computePlaces,
  buildResults,
  Obstacle,
  RacerState,
  RaceResults,
} from './game/rules';
import { Sfx } from './game/sound';
import { renderWorldCanvas, Particle, PopupText } from './game/renderer';

type GameMode = 'title' | 'countdown' | 'race' | 'finish' | 'paused' | 'results';

interface HudSnapshot {
  place: number;
  speedKmh: number;
  flow: number;
  combo: number;
  stamina: number;
  staminaGhost: number;
  progress: number;
  raceTime: number;
  racerDots: Array<{ name: string; progress: number; scarf: string; isPlayer: boolean }>;
}

const MAX_PARTICLES = 260;

function createParticlePool(): Particle[] {
  const pool: Particle[] = [];
  for (let i = 0; i < MAX_PARTICLES; i++) {
    pool.push({
      active: false,
      kind: 'dust',
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      life: 0,
      max: 1,
      size: 4,
      grav: 260,
      color: '#f2d6a6',
    });
  }
  return pool;
}

function loadBestTime(): number {
  try {
    const v = parseFloat(localStorage.getItem('jerboa-race-best-v1') || '');
    return Number.isFinite(v) && v > 0 ? v : 0;
  } catch {
    return 0;
  }
}

function saveBestTime(v: number): void {
  try {
    localStorage.setItem('jerboa-race-best-v1', String(v));
  } catch {
    // ignore storage quota errors
  }
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [mode, setMode] = useState<GameMode>('title');
  const [muted, setMuted] = useState(false);
  const [skinIdx, setSkinIdx] = useState(0);
  const [bestTime, setBestTime] = useState<number>(() => loadBestTime());
  const [results, setResults] = useState<RaceResults | null>(null);
  const [hud, setHud] = useState<HudSnapshot>({
    place: 1,
    speedKmh: 0,
    flow: 0,
    combo: 0,
    stamina: 100,
    staminaGhost: 100,
    progress: 0,
    raceTime: 0,
    racerDots: [],
  });

  // Mutable simulation ref decoupled from React reconciliation
  const simRef = useRef<{
    mode: GameMode;
    resumeMode: GameMode;
    t: number;
    raceTime: number;
    countdown: number;
    lastCount: number;
    goFlash: number;
    camX: number;
    shake: number;
    hitFlash: number;
    hitstop: number;
    finishTimer: number;
    seed: number;
    skinIdx: number;
    best: number;
    newRecord: boolean;
    auto: boolean;
    freeze: boolean;
    obstacles: Obstacle[];
    racers: RacerState[];
    player: RacerState;
    particles: Particle[];
    particleCursor: number;
    popups: PopupText[];
    jumpQueued: boolean;
    sprintHeld: boolean;
    touchSprintHeld: boolean;
    lastHudSync: number;
  } | null>(null);

  if (!simRef.current) {
    const initSeed = 20261104;
    const { racers, player } = createRacers(0);
    simRef.current = {
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
      seed: initSeed,
      skinIdx: 0,
      best: loadBestTime(),
      newRecord: false,
      auto: false,
      freeze: false,
      obstacles: buildTrack(initSeed),
      racers,
      player,
      particles: createParticlePool(),
      particleCursor: 0,
      popups: [],
      jumpQueued: false,
      sprintHeld: false,
      touchSprintHeld: false,
      lastHudSync: 0,
    };
  }

  // Sync document.body.dataset.state for ultra-mode / game shell contract
  useEffect(() => {
    const bodyState =
      mode === 'title'
        ? 'title'
        : mode === 'paused'
          ? 'paused'
          : mode === 'results'
            ? 'gameover'
            : 'playing';
    document.body.dataset.state = bodyState;
    document.body.dataset.mode = mode;
  }, [mode]);

  const selectSkin = useCallback((idx: number) => {
    const nextIdx = (idx + PLAYER_SKINS.length) % PLAYER_SKINS.length;
    setSkinIdx(nextIdx);
    const sim = simRef.current;
    if (sim) {
      sim.skinIdx = nextIdx;
      const skin = PLAYER_SKINS[nextIdx];
      sim.player.scarf = skin.scarf;
      sim.player.goggle = skin.goggle;
      sim.player.coatColor = skin.coatColor;
      sim.player.furTint = skin.furTint;
    }
  }, []);

  const spawnDust = useCallback(
    (worldX: number, count: number, big = false, groundY = GROUND) => {
      const sim = simRef.current;
      if (!sim) return;
      for (let i = 0; i < count; i++) {
        const p = sim.particles[sim.particleCursor];
        sim.particleCursor = (sim.particleCursor + 1) % MAX_PARTICLES;
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
    },
    []
  );

  const burstSpark = useCallback((worldX: number, py: number, color = '#ffe27a') => {
    const sim = simRef.current;
    if (!sim) return;
    for (let i = 0; i < 18; i++) {
      const p = sim.particles[sim.particleCursor];
      sim.particleCursor = (sim.particleCursor + 1) % MAX_PARTICLES;
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
  }, []);

  const pushPopup = useCallback((text: string, color = '#fff3d8', worldX?: number, py?: number) => {
    const sim = simRef.current;
    if (!sim) return;
    const sx =
      worldX != null
        ? START_X + (worldX - sim.camX) * PPM
        : START_X + (sim.player.x - sim.camX) * PPM;
    for (let i = sim.popups.length - 1; i >= 0; i--) {
      if (sim.popups[i].text === text) sim.popups.splice(i, 1);
    }
    sim.popups.push({
      text,
      color,
      x: sx,
      y: py != null ? py : GROUND - 365,
      life: 0.95,
      max: 0.95,
    });
    if (sim.popups.length > 6) sim.popups.shift();
  }, []);

  const syncHudSnapshot = useCallback((sim: NonNullable<typeof simRef.current>) => {
    const p = sim.player;
    setHud({
      place: p.place,
      speedKmh: Math.round(p.speed * 3.6),
      flow: p.flow,
      combo: p.combo,
      stamina: Math.round(p.stamina),
      staminaGhost: Math.round(p.staminaGhost),
      progress: clamp(p.x / RACE_LEN, 0, 1),
      raceTime: sim.raceTime,
      racerDots: sim.racers.map((r) => ({
        name: r.name,
        progress: clamp(r.x / RACE_LEN, 0, 1),
        scarf: r.scarf,
        isPlayer: r.isPlayer,
      })),
    });
  }, []);

  const startRace = useCallback(
    (fromGesture = false) => {
      const sim = simRef.current;
      if (!sim) return;
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      if (fromGesture) Sfx.unlockFromGesture();
      else Sfx.init();

      const { racers, player } = createRacers(sim.skinIdx);
      sim.obstacles = buildTrack(sim.seed);
      sim.racers = racers;
      sim.player = player;
      sim.mode = 'countdown';
      sim.resumeMode = 'countdown';
      sim.countdown = 3.6;
      sim.lastCount = -1;
      sim.goFlash = 0;
      sim.raceTime = 0;
      sim.camX = player.x - 5;
      sim.shake = 0;
      sim.hitFlash = 0;
      sim.hitstop = 0;
      sim.finishTimer = 0;
      sim.newRecord = false;
      sim.jumpQueued = false;
      sim.sprintHeld = false;
      sim.touchSprintHeld = false;
      sim.popups = [];
      for (let i = 0; i < sim.particles.length; i++) sim.particles[i].active = false;

      document.body.dataset.state = 'playing';
      setResults(null);
      setMode('countdown');
      syncHudSnapshot(sim);
    },
    [syncHudSnapshot]
  );

  const toMenu = useCallback(() => {
    const sim = simRef.current;
    if (!sim) return;
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    sim.mode = 'title';
    sim.shake = 0;
    sim.hitFlash = 0;
    sim.popups = [];
    sim.jumpQueued = false;
    sim.sprintHeld = false;
    sim.touchSprintHeld = false;
    document.body.dataset.state = 'title';
    setResults(null);
    setMode('title');
  }, []);

  const togglePause = useCallback(() => {
    const sim = simRef.current;
    if (!sim) return;
    if (sim.mode === 'paused') {
      sim.mode = sim.resumeMode || 'race';
      document.body.dataset.state = 'playing';
      setMode(sim.mode);
    } else if (sim.mode === 'race' || sim.mode === 'countdown' || sim.mode === 'finish') {
      sim.resumeMode = sim.mode;
      sim.mode = 'paused';
      sim.sprintHeld = false;
      sim.touchSprintHeld = false;
      document.body.dataset.state = 'paused';
      setMode('paused');
    }
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      Sfx.setMuted(next);
      return next;
    });
  }, []);

  const triggerJump = useCallback(() => {
    const sim = simRef.current;
    if (!sim) return;
    Sfx.unlockFromGesture();
    if (sim.mode === 'race') {
      sim.jumpQueued = true;
    }
  }, []);

  // Core simulation step
  const stepSimulation = useCallback(
    (dt: number) => {
      const sim = simRef.current;
      if (!sim) return;

      sim.t += dt;

      for (let i = 0; i < sim.particles.length; i++) {
        const p = sim.particles[i];
        if (!p.active) continue;
        p.life -= dt;
        if (p.life <= 0) {
          p.active = false;
          continue;
        }
        p.x += (p.vx * dt) / PPM;
        p.y += p.vy * dt;
        p.vy += p.grav * dt;
        p.vx *= 1 - dt * 1.5;
      }
      for (let i = sim.popups.length - 1; i >= 0; i--) {
        const q = sim.popups[i];
        q.life -= dt;
        q.y -= 26 * dt;
        if (q.life <= 0) sim.popups.splice(i, 1);
      }

      sim.shake *= Math.exp(-7 * dt);
      if (sim.shake < 0.15) sim.shake = 0;
      sim.hitFlash = Math.max(0, sim.hitFlash - dt * 2.2);

      if (sim.hitstop > 0) {
        sim.hitstop = Math.max(0, sim.hitstop - dt);
        return;
      }

      if (sim.mode === 'title' || sim.mode === 'paused') {
        return;
      }

      // Even on results screen, ensure any racer still in the air lands smoothly on the road!
      if (sim.mode === 'results') {
        for (let i = 0; i < sim.racers.length; i++) {
          settleFinishedRacer(sim.racers[i], dt, sim.raceTime);
        }
        return;
      }

      if (sim.mode === 'countdown') {
        sim.countdown -= dt;
        const n = Math.ceil(sim.countdown - 0.6);
        if (n > 0 && n !== sim.lastCount) {
          sim.lastCount = n;
          Sfx.count(false);
        }
        if (sim.countdown <= 0.6) {
          sim.mode = 'race';
          sim.countdown = 0;
          sim.goFlash = 0.8;
          Sfx.count(true);
          pushPopup('ПОШЛИ!', '#8ff7d8');
          setMode('race');
        }
        for (let i = 0; i < sim.racers.length; i++) {
          const r = sim.racers[i];
          r.squash += (1 - r.squash) * Math.min(1, dt * 8);
          r.dustT -= dt;
          if (r.dustT <= 0) {
            r.dustT = 0.5 + Math.random() * 0.4;
            if (Math.random() < 0.6) spawnDust(r.x, 1, false, getLaneGroundY(r.lane));
          }
        }
        computePlaces(sim.racers);
        sim.camX = sim.player.x - 5;
        return;
      }

      if (sim.mode === 'race') {
        sim.raceTime += dt;
        sim.goFlash = Math.max(0, sim.goFlash - dt);
        const p = sim.player;
        const pGroundY = getLaneGroundY(p.lane);

        let jump = sim.jumpQueued;
        sim.jumpQueued = false;
        let sprint = (sim.sprintHeld || sim.touchSprintHeld) && !sim.auto;
        if (sim.auto) {
          const decision = decideAutoPlayer(p, sim.obstacles, sim.raceTime);
          jump = decision.jump;
          sprint = decision.sprint;
        }

        const pEvents = advanceRacer(
          p,
          dt,
          sim.raceTime,
          sim.obstacles,
          jump,
          sprint,
          1
        );

        if (pEvents.jumped) {
          if (pEvents.perfect) {
            burstSpark(p.x, pGroundY - p.h - 8, '#ffe27a');
            Sfx.perfect(p.combo);
            pushPopup(
              p.flow >= 1.5 ? `ИДЕАЛЬНО! ×${Math.round(p.flow)}` : 'ИДЕАЛЬНО!',
              '#ffe89a'
            );
            sim.shake = Math.max(sim.shake, 2.6);
          } else {
            Sfx.hop();
          }
          spawnDust(p.x, 9, false, pGroundY);
        }
        if (pEvents.landed && !pEvents.jumped) {
          Sfx.land();
          spawnDust(p.x, 14, true, pGroundY);
          sim.shake = Math.max(sim.shake, 2.2);
        }
        if (pEvents.spawnedRunDust) {
          spawnDust(p.x - 1.4, 2, false, pGroundY);
        }
        if (pEvents.hitObstacle) {
          spawnDust(p.x, 22, true, pGroundY);
          burstSpark(p.x + 1, pGroundY - 28, '#ff9a7a');
          sim.shake = 14;
          sim.hitFlash = 0.55;
          sim.hitstop = 0.045;
          Sfx.stumble();
          pushPopup('ОЙ!', '#ff9a7a');
        }

        // Advance AI racers on lanes 1, 2, 3
        for (let j = 1; j < sim.racers.length; j++) {
          const ai = sim.racers[j];
          const aiGroundY = getLaneGroundY(ai.lane);
          if (ai.finished) {
            const landed = settleFinishedRacer(ai, dt, sim.raceTime);
            if (landed) spawnDust(ai.x, 8, true, aiGroundY);
            continue;
          }
          const aiEv = stepAIRacer(ai, p.x, dt, sim.raceTime, sim.obstacles);
          if (aiEv.jumped) {
            spawnDust(ai.x, 5, false, aiGroundY);
            if (aiEv.perfect) burstSpark(ai.x, aiGroundY - ai.h - 8, '#ffe27a');
          }
          if (aiEv.landed) spawnDust(ai.x, 8, true, aiGroundY);
          if (aiEv.spawnedRunDust) spawnDust(ai.x - 1.4, 1, false, aiGroundY);
          if (aiEv.hitObstacle) spawnDust(ai.x, 12, true, aiGroundY);
        }

        // Check finish line
        for (let f = 0; f < sim.racers.length; f++) {
          const r = sim.racers[f];
          if (!r.finished && r.x >= RACE_LEN) {
            r.finished = true;
            r.finishTime = sim.raceTime;
            if (r.isPlayer) {
              sim.mode = 'finish';
              sim.finishTimer = 1.35;
              p.speed *= 0.65;
              Sfx.finish();
              sim.shake = 6;
              sim.newRecord = !sim.best || r.finishTime < sim.best;
              if (sim.newRecord) {
                sim.best = r.finishTime;
                saveBestTime(sim.best);
                setBestTime(sim.best);
              }
              pushPopup('ФИНИШ!', '#ffe89a');
              setMode('finish');
            }
          }
        }

        sim.camX += (p.x - sim.camX) * Math.min(1, dt * 9);
        computePlaces(sim.racers);
        return;
      }

      if (sim.mode === 'finish') {
        sim.finishTimer -= dt;
        // Settle player back to the ground and decelerate
        const pLanded = settleFinishedRacer(sim.player, dt, sim.raceTime);
        if (pLanded) {
          spawnDust(sim.player.x, 12, true, getLaneGroundY(sim.player.lane));
        }

        // Continue updating AI racers so they also land and cross the finish line naturally
        for (let j = 1; j < sim.racers.length; j++) {
          const ai = sim.racers[j];
          const aiGroundY = getLaneGroundY(ai.lane);
          if (ai.finished) {
            const landed = settleFinishedRacer(ai, dt, sim.raceTime);
            if (landed) spawnDust(ai.x, 8, true, aiGroundY);
          } else {
            stepAIRacer(ai, sim.player.x, dt, sim.raceTime, sim.obstacles);
            if (ai.x >= RACE_LEN) {
              ai.finished = true;
              ai.finishTime = sim.raceTime + ( 1.35 - sim.finishTimer );
            }
          }
        }

        sim.camX += (sim.player.x - sim.camX) * Math.min(1, dt * 4);
        if (sim.finishTimer <= 0) {
          const finalRes = buildResults(
            sim.racers,
            sim.player,
            sim.raceTime,
            sim.newRecord
          );
          sim.mode = 'results';
          document.body.dataset.state = 'gameover';
          setResults(finalRes);
          setMode('results');
        }
      }
    },
    [burstSpark, pushPopup, spawnDust]
  );

  // Handle URL parameters (?auto=1, ?autostart=1, ?seek=12, ?freeze=1) & animation loop
  useEffect(() => {
    const sim = simRef.current;
    if (!sim) return;

    const params = new URLSearchParams(window.location.search);
    const autoParam = params.get('auto') === '1';
    const autostartParam = params.get('autostart') === '1';
    const freezeParam = params.get('freeze') === '1';
    const seekSec = parseFloat(params.get('seek') || '0');

    sim.auto = autoParam;
    sim.freeze = freezeParam;

    if (autoParam || autostartParam || seekSec > 0) {
      startRace(false);
      if (seekSec > 0) {
        const steps = Math.round(seekSec * 60);
        for (let i = 0; i < steps; i++) {
          stepSimulation(1 / 60);
        }
        syncHudSnapshot(sim);
      }
    }

    let rafId = 0;
    let last = 0;

    const loop = (now: number) => {
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
      last = now;

      if (!sim.freeze) {
        stepSimulation(dt);
      } else {
        sim.t += dt;
      }

      if (now - sim.lastHudSync > 45) {
        sim.lastHudSync = now;
        if (sim.mode === 'race' || sim.mode === 'countdown' || sim.mode === 'finish') {
          syncHudSnapshot(sim);
        }
      }

      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const dpr = Math.min(1.5, window.devicePixelRatio || 1);
          if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
            canvas.width = Math.round(W * dpr);
            canvas.height = Math.round(H * dpr);
          }
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          renderWorldCanvas(ctx, {
            t: sim.t,
            camX: sim.camX,
            shake: sim.shake,
            hitFlash: sim.hitFlash,
            goFlash: sim.goFlash,
            countdown: sim.countdown,
            mode: sim.mode,
            racers: sim.racers,
            player: sim.player,
            obstacles: sim.obstacles,
            particles: sim.particles,
            popups: sim.popups,
          });
        }
      }

      if (!sim.freeze) {
        rafId = requestAnimationFrame(loop);
      }
    };

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [startRace, stepSimulation, syncHudSnapshot]);

  // Keyboard & focus-loss input hygiene
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const k = e.code;
      if (k === 'Space' || k === 'ArrowUp' || k === 'KeyW') {
        e.preventDefault();
      }
      if (e.repeat) return;

      const sim = simRef.current;
      if (!sim) return;

      if (k === 'KeyM') {
        toggleMute();
        return;
      }
      if (sim.mode === 'title') {
        if (k === 'KeyC') {
          selectSkin(sim.skinIdx + 1);
          return;
        }
        if (k === 'Space' || k === 'Enter' || k === 'ArrowUp') {
          e.preventDefault();
          startRace(true);
        }
        return;
      }
      if (sim.mode === 'results') {
        if (k === 'Space' || k === 'Enter' || k === 'KeyR') {
          e.preventDefault();
          startRace(true);
          return;
        }
        if (k === 'Escape') {
          toMenu();
          return;
        }
        return;
      }
      if (k === 'KeyP' || k === 'Escape') {
        togglePause();
        return;
      }
      if (sim.mode === 'paused') {
        if (k === 'KeyR') startRace(true);
        return;
      }
      if (k === 'KeyR') {
        startRace(true);
        return;
      }
      if (k === 'ShiftLeft' || k === 'ShiftRight') {
        sim.sprintHeld = true;
        return;
      }
      if (k === 'Space' || k === 'ArrowUp' || k === 'KeyW') {
        triggerJump();
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const sim = simRef.current;
      if (!sim) return;
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        sim.sprintHeld = false;
      }
    };

    const onBlur = () => {
      const sim = simRef.current;
      if (!sim) return;
      sim.sprintHeld = false;
      sim.touchSprintHeld = false;
      sim.jumpQueued = false;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [selectSkin, startRace, toMenu, toggleMute, togglePause, triggerJump]);

  const isPlayingHudVisible = mode === 'countdown' || mode === 'race' || mode === 'finish';
  const activeSkin = PLAYER_SKINS[skinIdx] || PLAYER_SKINS[0];

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#1b0e05] flex items-center justify-center select-none">
      {/* 16:9 Stage Container */}
      <div className="relative w-full h-full max-w-[177.78vh] max-h-[56.25vw] aspect-video shadow-2xl overflow-hidden bg-[#2b1608]">
        {/* Isolated 60fps World Canvas */}
        <canvas
          ref={canvasRef}
          onPointerDown={() => {
            if (mode === 'race') triggerJump();
          }}
          className="w-full h-full block cursor-pointer"
        />

        {/* ==================== TITLE SCREEN OVERLAY ==================== */}
        {mode === 'title' && (
          <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-6 sm:p-10 md:p-11">
            {/* Top Row: Best Record + Archive Download Button + Reference Portrait */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3 pointer-events-auto">
                <div className="wood-plaque px-4 py-2 rounded-lg flex items-center gap-2.5">
                  <svg className="w-5 h-5 text-[#ffd166]" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
                  </svg>
                  <span className="text-xs sm:text-sm font-bold tracking-wider uppercase text-[#ffe6bc] tabular-nums">
                    {bestTime > 0
                      ? `Рекорд: ${bestTime.toFixed(1)} с`
                      : 'Дистанция: 850 м · 4 дорожки'}
                  </span>
                </div>

                {/* Direct Download Archive (.ZIP) & Standalone HTML Links */}
                <a
                  href="/jerboa-desert-race-fixed.zip"
                  download="jerboa-desert-race-fixed.zip"
                  className="btn-desert-secondary px-3.5 py-2 rounded-lg text-xs sm:text-sm font-extrabold uppercase tracking-wider flex items-center gap-2 no-underline"
                  title="Скачать полный архив игры (.zip)"
                >
                  <svg className="w-4 h-4 text-[#ffd166]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                    <path d="M21 15V19A2 2 0 0 1 19 21H5A2 2 0 0 1 3 19V15" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  <span>Скачать архив (.ZIP)</span>
                </a>
              </div>

              {/* Polaroid Reference Card of the Jerboa */}
              <div className="hidden sm:flex flex-col items-center bg-[#fff9eb] p-2 pb-2.5 rounded-xl border-2 border-[#6e3f19] shadow-xl rotate-3">
                <img
                  src="/assets/jerboa.png"
                  alt="Референс тушканчика"
                  className="w-20 h-20 md:w-24 md:h-24 object-contain rounded-lg bg-[#fffdf7]"
                />
                <span className="mt-1 text-[10px] font-extrabold tracking-wider text-[#5a3214] uppercase">
                  Твой тушканчик
                </span>
              </div>
            </div>

            {/* Left-Third Negative Space Hero Title Lockup & CTA */}
            <div className="max-w-xl my-auto flex flex-col items-start gap-3.5">
              <div className="flex flex-col items-start">
                <div className="flex items-center gap-2.5 mb-1">
                  <svg className="w-7 h-7 text-[#ffcf70]" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M13 3L6 14H12L11 21L18 10H12L13 3Z" />
                  </svg>
                  <span className="text-xs sm:text-sm font-extrabold tracking-[0.22em] uppercase text-[#ffdca8]">
                    Гонки по пустыне
                  </span>
                </div>
                <h1 className="text-4xl sm:text-6xl md:text-7xl font-black uppercase leading-[0.94] tracking-tight text-[#fff2d4] stroke-title">
                  Тушканчики
                  <span className="block text-[#ffca7a]">на старте</span>
                </h1>
              </div>

              <p className="text-sm sm:text-base text-[#ffe9c8]/95 font-medium max-w-md leading-snug">
                Прыгай в такт приземления — лови золотой поток скорости. Перепрыгивай сагуаро и валуны, удерживай спурт и обгони троих соперников!
              </p>

              {/* Team / Scarf Color Selector */}
              <div className="wood-plaque px-3.5 py-2 rounded-xl flex items-center gap-3 pointer-events-auto">
                <span className="text-xs font-extrabold uppercase tracking-wider text-[#e9c89a]">
                  Экипировка:
                </span>
                <div className="flex items-center gap-2">
                  {PLAYER_SKINS.map((sk, idx) => (
                    <button
                      key={sk.id}
                      type="button"
                      onClick={() => selectSkin(idx)}
                      title={sk.title}
                      className={`w-6 h-6 rounded-md cursor-pointer transition-transform ${
                        idx === skinIdx
                          ? 'scale-115 border-2 border-white shadow-[0_0_8px_rgba(255,255,255,0.65)]'
                          : 'opacity-75 hover:opacity-100 border border-black/40'
                      }`}
                      style={{ backgroundColor: sk.scarf }}
                    />
                  ))}
                </div>
                <span className="text-xs font-bold text-[#fff1cf]">{activeSkin.title}</span>
              </div>

              {/* Primary CTA Handshake */}
              <div className="flex items-center gap-3.5 pt-1 pointer-events-auto">
                <button
                  type="button"
                  data-start="true"
                  onClick={() => startRace(true)}
                  className="btn-desert-primary px-8 py-3.5 sm:px-10 sm:py-4 rounded-xl text-xl sm:text-2xl font-black uppercase tracking-wide cursor-pointer flex items-center gap-3"
                >
                  <span>Старт</span>
                  <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5V19L19 12L8 5Z" />
                  </svg>
                </button>

                <button
                  type="button"
                  onClick={toggleMute}
                  className="btn-desert-secondary px-4 py-3.5 sm:py-4 rounded-xl text-sm font-bold uppercase tracking-wider cursor-pointer flex items-center gap-2"
                  title="Звук (M)"
                >
                  {muted ? 'Звук: Выкл' : 'Звук: Вкл'}
                </button>
              </div>
            </div>

            {/* Bottom Safe Margin Flat Inline Control Hint */}
            <div className="flex items-center justify-between text-xs sm:text-sm text-[#ffe4b5]/85 font-semibold tracking-wide">
              <span>
                ПРОБЕЛ / КЛИК — прыжок · SHIFT — спурт · C — цвет · P — пауза
              </span>
              <span className="hidden md:inline text-[#ffd28a]">
                Идеальный прыжок в момент приземления ускоряет поток ×1–×5
              </span>
            </div>
          </div>
        )}

        {/* ==================== PLAYING HUD OVERLAY ==================== */}
        {isPlayingHudVisible && (
          <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-4 sm:p-6">
            {/* Top Perimeter Bar */}
            <div className="flex items-start justify-between gap-4">
              {/* Top-Left Cluster: Place & Timer */}
              <div className="wood-plaque px-4 py-2.5 rounded-xl flex items-center gap-4">
                <div>
                  <div className="text-[11px] font-extrabold uppercase tracking-wider text-[#e9c89a]">
                    Место
                  </div>
                  <div className="text-2xl sm:text-4xl font-black text-[#fff3d6] font-mono-num leading-none mt-0.5">
                    {hud.place} <span className="text-lg sm:text-xl text-[#d9b07c]">/ 4</span>
                  </div>
                </div>
                <div className="h-9 w-[1px] bg-[#ffe0a8]/20" />
                <div>
                  <div className="text-[11px] font-extrabold uppercase tracking-wider text-[#e9c89a]">
                    Время
                  </div>
                  <div className="text-lg sm:text-2xl font-extrabold text-[#ffe4b5] font-mono-num leading-none mt-1">
                    {Math.round(hud.raceTime)} с
                  </div>
                </div>
              </div>

              {/* Top-Center Cluster: Desert Rally Distance Progress Bar */}
              <div className="hidden md:flex flex-col flex-1 max-w-xl wood-plaque px-5 py-3 rounded-xl">
                <div className="flex items-center justify-between text-[11px] font-extrabold uppercase tracking-wider text-[#f2cfa0] mb-2">
                  <span>Старт</span>
                  <span className="font-mono-num">
                    {Math.round(hud.progress * RACE_LEN)} / {RACE_LEN} м
                  </span>
                  <span className="text-[#8ff7d8]">Финиш</span>
                </div>
                <div className="relative h-3 bg-[#241205] rounded-md border border-[#ffd89a]/25 overflow-visible">
                  <div
                    className="h-full rounded-l-md bg-[#f29d38] transition-[width] duration-75"
                    style={{ width: `${Math.max(2, hud.progress * 100)}%` }}
                  />
                  {[25, 50, 75].map((q) => (
                    <div
                      key={q}
                      className="absolute top-0 bottom-0 w-[2px] bg-[#ffd89a]/25"
                      style={{ left: `${q}%` }}
                    />
                  ))}
                  {hud.racerDots.map((dot, idx) => (
                    <div
                      key={dot.name}
                      className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 rounded-full transition-[left] duration-75"
                      style={{
                        left: `${dot.progress * 100}%`,
                        width: dot.isPlayer ? '15px' : '11px',
                        height: dot.isPlayer ? '15px' : '11px',
                        backgroundColor: dot.scarf,
                        border: dot.isPlayer ? '2.5px solid #fffbe6' : '1.5px solid #2b1506',
                        zIndex: dot.isPlayer ? 10 : idx + 1,
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* Top-Right Cluster: Speedometer + Utility Icon Buttons */}
              <div className="flex items-start gap-2.5">
                <div className="wood-plaque px-4 py-2 rounded-xl text-right">
                  <div className="text-[11px] font-extrabold uppercase tracking-wider text-[#e9c89a]">
                    Скорость · КМ/Ч
                  </div>
                  <div className="text-2xl sm:text-4xl font-black text-[#fff3d6] font-mono-num leading-none mt-0.5">
                    {hud.speedKmh}
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-1.5 pointer-events-auto">
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={(e) => {
                      e.currentTarget.blur();
                      toggleMute();
                    }}
                    title="Звук [M]"
                    className="wood-plaque w-10 h-10 rounded-lg flex items-center justify-center text-[#ffe6bc] hover:text-white cursor-pointer"
                  >
                    {muted ? (
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                        <path d="M11 5L6 9H2V15H6L11 19V5Z" />
                        <path d="M23 9L17 15M17 9L23 15" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                        <path d="M11 5L6 9H2V15H6L11 19V5Z" />
                        <path d="M15.54 8.46C16.48 9.4 17 10.67 17 12C17 13.33 16.48 14.6 15.54 15.54" />
                      </svg>
                    )}
                  </button>
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={(e) => {
                      e.currentTarget.blur();
                      togglePause();
                    }}
                    title="Пауза [P]"
                    className="wood-plaque w-10 h-10 rounded-lg flex items-center justify-center text-[#ffe6bc] hover:text-white cursor-pointer"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                      <rect x="6" y="4" width="4" height="16" rx="1" />
                      <rect x="14" y="4" width="4" height="16" rx="1" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={(e) => {
                      e.currentTarget.blur();
                      startRace(true);
                    }}
                    title="Заново [R]"
                    className="wood-plaque w-10 h-10 rounded-lg flex items-center justify-center text-[#ffe6bc] hover:text-white cursor-pointer"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <path d="M3 12A9 9 0 1 0 6 5.3L3 8" />
                      <path d="M3 3V8H8" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            {/* Bottom Perimeter Bar */}
            <div className="flex items-end justify-between gap-4">
              <div className="wood-plaque px-4 py-3 rounded-xl w-64 sm:w-72">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#ffdda9]">
                    Поток скорости
                  </span>
                  <span className="text-xs font-black text-[#ffd166] font-mono-num">
                    ×{Math.floor(hud.flow) + 1}
                  </span>
                </div>
                <div className="grid grid-cols-5 gap-1.5 mb-3">
                  {[0, 1, 2, 3, 4].map((idx) => {
                    const isFull = hud.flow >= idx + 0.85;
                    const isPartial = !isFull && hud.flow > idx + 0.15;
                    return (
                      <div
                        key={idx}
                        className={`h-3.5 rounded transition-all ${
                          isFull
                            ? 'bg-[#ffd166] border border-[#fff6cc] shadow-[0_0_10px_rgba(255,209,102,0.75)]'
                            : isPartial
                              ? 'bg-[#d98a2b] border border-[#ffd166]/60'
                              : 'bg-[#211004] border border-[#ffe0a8]/20'
                        }`}
                      />
                    );
                  })}
                </div>

                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#ffdda9]">
                    Силы для спурта
                  </span>
                  <span className="text-xs font-bold text-[#8ff7d8] font-mono-num">
                    {hud.stamina}%
                  </span>
                </div>
                <div className="relative h-3 bg-[#211004] rounded border border-[#ffe0a8]/20 overflow-hidden">
                  <div
                    className="absolute inset-y-0 left-0 bg-[#ffd166]/45 transition-[width] duration-150"
                    style={{ width: `${hud.staminaGhost}%` }}
                  />
                  <div
                    className="relative h-full bg-[#38c9a8] transition-[width] duration-75"
                    style={{ width: `${hud.stamina}%` }}
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 pointer-events-auto">
                <button
                  type="button"
                  tabIndex={-1}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    triggerJump();
                  }}
                  className="btn-desert-secondary px-5 py-3.5 rounded-xl font-extrabold text-sm sm:text-base uppercase tracking-wider cursor-pointer"
                >
                  Прыжок · Пробел
                </button>
                <button
                  type="button"
                  tabIndex={-1}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    if (simRef.current) simRef.current.touchSprintHeld = true;
                  }}
                  onPointerUp={() => {
                    if (simRef.current) simRef.current.touchSprintHeld = false;
                  }}
                  onPointerLeave={() => {
                    if (simRef.current) simRef.current.touchSprintHeld = false;
                  }}
                  className="btn-desert-primary px-5 py-3.5 rounded-xl font-black text-sm sm:text-base uppercase tracking-wider cursor-pointer"
                >
                  Спурт · Shift
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ==================== PAUSE MODAL ==================== */}
        {mode === 'paused' && (
          <div className="absolute inset-0 bg-[#140902]/75 flex items-center justify-center p-6 pointer-events-auto">
            <div className="wood-modal w-full max-w-md rounded-2xl p-8 flex flex-col items-center text-center">
              <div className="text-xs font-extrabold uppercase tracking-[0.2em] text-[#ffcf8a] mb-1">
                Гонка приостановлена
              </div>
              <h2 className="text-4xl sm:text-5xl font-black uppercase text-[#fff2d4] stroke-title mb-6">
                Пауза
              </h2>

              <div className="w-full grid grid-cols-2 gap-3 mb-6">
                <div className="bg-[#241205]/80 border border-[#ffd89a]/20 rounded-xl p-3">
                  <div className="text-[11px] font-bold uppercase text-[#d9b07c]">Текущее место</div>
                  <div className="text-2xl font-black text-[#fff3d6] font-mono-num">
                    {hud.place} / 4
                  </div>
                </div>
                <div className="bg-[#241205]/80 border border-[#ffd89a]/20 rounded-xl p-3">
                  <div className="text-[11px] font-bold uppercase text-[#d9b07c]">Дистанция</div>
                  <div className="text-2xl font-black text-[#ffd166] font-mono-num">
                    {Math.round(hud.progress * RACE_LEN)} м
                  </div>
                </div>
              </div>

              <div className="w-full flex flex-col gap-3">
                <button
                  type="button"
                  onClick={togglePause}
                  className="btn-desert-primary w-full py-3.5 rounded-xl text-lg font-black uppercase tracking-wider cursor-pointer"
                >
                  Продолжить · P
                </button>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => startRace(true)}
                    className="btn-desert-secondary py-3 rounded-xl text-sm font-extrabold uppercase tracking-wider cursor-pointer"
                  >
                    Заново · R
                  </button>
                  <button
                    type="button"
                    onClick={toMenu}
                    className="btn-desert-secondary py-3 rounded-xl text-sm font-extrabold uppercase tracking-wider cursor-pointer"
                  >
                    В меню · Esc
                  </button>
                </div>
                <a
                  href="/jerboa-desert-race-fixed.zip"
                  download="jerboa-desert-race-fixed.zip"
                  className="btn-desert-secondary w-full py-2.5 rounded-xl text-xs font-extrabold uppercase tracking-wider flex items-center justify-center gap-2 no-underline mt-1"
                >
                  <span>Скачать архив игры (.ZIP)</span>
                </a>
              </div>
            </div>
          </div>
        )}

        {/* ==================== RESULTS / VICTORY MODAL ==================== */}
        {mode === 'results' && results && (
          <div className="absolute inset-0 bg-[#140902]/75 flex items-center justify-center p-4 sm:p-6 pointer-events-auto">
            <div className="wood-modal w-full max-w-xl rounded-2xl p-6 sm:p-8 flex flex-col items-center">
              <div className="text-xs font-extrabold uppercase tracking-[0.22em] text-[#ffcf8a]">
                Финишный протокол · 850 м
              </div>
              <h2
                className="text-4xl sm:text-6xl font-black uppercase stroke-title mt-1 mb-2"
                style={{
                  color:
                    results.playerPlace === 1
                      ? '#ffd166'
                      : results.playerPlace === 2
                        ? '#e2e8f0'
                        : results.playerPlace === 3
                          ? '#e6a875'
                          : '#ffb3a0',
                }}
              >
                {results.playerPlace} место
              </h2>

              {results.newRecord ? (
                <div className="px-3.5 py-1 rounded-md bg-[#ffd166]/20 border border-[#ffd166] text-[#ffd166] text-xs font-black uppercase tracking-wider mb-4">
                  Новый рекорд трассы: {results.playerTime.toFixed(1)} с!
                </div>
              ) : (
                <div className="text-xs font-bold text-[#ffd79a]/80 uppercase tracking-wider mb-4 tabular-nums">
                  Время заезда: {results.playerTime.toFixed(1)} с
                  {bestTime > 0 ? ` · Рекорд: ${bestTime.toFixed(1)} с` : ''}
                </div>
              )}

              {/* Standings Table */}
              <div className="w-full flex flex-col gap-2 mb-6">
                {results.rows.map((row) => (
                  <div
                    key={row.name}
                    className={`flex items-center justify-between px-4 py-2.5 rounded-xl border ${
                      row.isPlayer
                        ? 'bg-[#28b5a8]/20 border-[#5ef2df]/60 text-[#d8fff8]'
                        : 'bg-[#221105]/75 border-[#ffd89a]/15 text-[#ffeac8]'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-6 text-lg font-black font-mono-num">
                        {row.place}.
                      </span>
                      <span
                        className="w-3.5 h-3.5 rounded-full border border-white/50"
                        style={{ backgroundColor: row.scarf }}
                      />
                      <span className="text-base sm:text-lg font-extrabold">
                        {row.name}
                      </span>
                    </div>
                    <span className="text-base sm:text-lg font-black font-mono-num">
                      {row.time.toFixed(1)} с
                    </span>
                  </div>
                ))}
              </div>

              {/* Action Buttons */}
              <div className="w-full flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  data-start="true"
                  onClick={() => startRace(true)}
                  className="btn-desert-primary flex-1 py-3.5 rounded-xl text-lg font-black uppercase tracking-wider cursor-pointer"
                >
                  Ещё раз · Пробел
                </button>
                <button
                  type="button"
                  onClick={toMenu}
                  className="btn-desert-secondary sm:w-40 py-3.5 rounded-xl text-base font-extrabold uppercase tracking-wider cursor-pointer"
                >
                  В меню · Esc
                </button>
                <a
                  href="/jerboa-desert-race-fixed.zip"
                  download="jerboa-desert-race-fixed.zip"
                  className="btn-desert-secondary sm:w-44 py-3.5 rounded-xl text-sm font-extrabold uppercase tracking-wider flex items-center justify-center gap-2 no-underline"
                >
                  <span>Скачать .ZIP</span>
                </a>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
