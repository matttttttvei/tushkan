import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  RACE_LEN,
  PERFECT_WINDOW,
  HORIZON_Y,
  getLaneGroundY,
  buildTrack,
  createRacers,
  advanceRacer,
  settleFinishedRacer,
  computePlaces,
  buildResults,
  decideAutoPlayer,
} from './rules.ts';

describe('Jerboa Desert Race — Pure Rules, Lanes & Physics', () => {
  it('buildTrack generates deterministic obstacles within track bounds', () => {
    const t1 = buildTrack(20261104);
    const t2 = buildTrack(20261104);
    assert.ok(t1.length >= 7, 'Track should contain obstacles');
    assert.deepEqual(t1, t2, 'Track generation must be deterministic for same seed');
    for (const obs of t1) {
      assert.ok(obs.x >= 130 && obs.x < RACE_LEN - 70, `Obstacle x=${obs.x} out of bounds`);
      assert.ok(['rock', 'cactus', 'bush'].includes(obs.type));
    }
  });

  it('all 4 racer lanes sit strictly on the road below HORIZON_Y (never in the sky)', () => {
    for (let lane = 0; lane < 4; lane++) {
      const y = getLaneGroundY(lane);
      assert.ok(
        y > HORIZON_Y + 25,
        `Lane ${lane} ground Y (${y}) must be below horizon (${HORIZON_Y})`
      );
    }
  });

  it('settleFinishedRacer brings an airborne finished racer back to the ground (h = 0)', () => {
    const { racers } = createRacers();
    const ai = racers[1];
    ai.finished = true;
    ai.airborne = true;
    ai.h = 110;
    ai.vh = 200;
    ai.speed = 25;

    for (let i = 0; i < 90; i++) {
      settleFinishedRacer(ai, 1 / 60, 30 + i / 60);
    }
    assert.equal(ai.airborne, false, 'Finished racer must land and not stay airborne');
    assert.equal(ai.h, 0, 'Finished racer height must settle to 0');
  });

  it('advanceRacer accelerates, jumps, and grants flow on perfect landing window', () => {
    const { player } = createRacers();
    const obstacles = buildTrack(20261104);
    advanceRacer(player, 0.05, 1.0, [], false, false, 1);
    assert.ok(player.speed > 0, 'Player should accelerate');
    assert.ok(player.x > 0, 'Player should move forward');

    player.lastLand = 2.0;
    const ev = advanceRacer(player, 0.016, 2.0 + PERFECT_WINDOW * 0.5, obstacles, true, false, 1);
    assert.equal(ev.jumped, true);
    assert.equal(ev.perfect, true);
    assert.equal(player.airborne, true);
    assert.equal(player.flow, 1);
    assert.equal(player.combo, 1);
  });

  it('sprint consumes stamina and boosts target speed, and ghost bar trails smoothly', () => {
    const { player: sprinter } = createRacers();
    const { player: walker } = createRacers();
    for (let i = 0; i < 20; i++) {
      advanceRacer(sprinter, 0.02, i * 0.02, [], false, true, 1);
      advanceRacer(walker, 0.02, i * 0.02, [], false, false, 1);
    }
    assert.ok(sprinter.stamina < 100, 'Sprint should drain stamina');
    assert.ok(sprinter.staminaGhost >= sprinter.stamina, 'Ghost bar trails stamina');
    assert.ok(sprinter.speed > walker.speed, 'Sprinter should move faster than non-sprinter');
  });

  it('colliding with an obstacle while low triggers stumble and resets flow', () => {
    const { player } = createRacers();
    player.flow = 3;
    player.speed = 25;
    const obstacle = { x: 10, w: 2.4, h: 70, type: 'rock' as const, seed: 1, hits: 0 };
    player.x = 9.0;
    player.h = 0;
    const ev = advanceRacer(player, 0.016, 3.0, [obstacle], false, false, 1);
    assert.equal(ev.hitObstacle, obstacle);
    assert.ok(player.stumble > 0, 'Player should be stumbling');
    assert.equal(player.flow, 0, 'Flow should reset on stumble');
    assert.equal(obstacle.hits, 1);
  });

  it('computePlaces and buildResults order racers accurately by finish time and distance', () => {
    const { racers, player } = createRacers();
    player.x = 850;
    player.finished = true;
    player.finishTime = 31.4;
    racers[1].x = 820;
    racers[2].x = 850;
    racers[2].finished = true;
    racers[2].finishTime = 30.8;
    racers[3].x = 790;

    computePlaces(racers);
    assert.equal(racers[2].place, 1);
    assert.equal(player.place, 2);
    assert.equal(racers[1].place, 3);
    assert.equal(racers[3].place, 4);

    const res = buildResults(racers, player, 31.4, true);
    assert.equal(res.playerPlace, 2);
    assert.equal(res.rows[0].name, 'Прыгун');
    assert.equal(res.rows[1].isPlayer, true);
  });

  it('autoPlayer successfully progresses along the track', () => {
    const { player } = createRacers();
    const obstacles = buildTrack(20261104);
    let t = 0;
    for (let i = 0; i < 600; i++) {
      t += 1 / 60;
      const decision = decideAutoPlayer(player, obstacles, t);
      advanceRacer(player, 1 / 60, t, obstacles, decision.jump, decision.sprint, 1);
    }
    assert.ok(player.x > 200, `Auto player should cover >200m in 10s, got ${player.x}`);
  });
});
