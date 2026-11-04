/* ============================================================
   jerboa.js — рисование тушканчика-гонщика и наездника
   Векторный персонаж по мотивам референса: оранжевая шёрстка,
   кремовый живот, огромные округлые уши с розовой изнанкой и
   коричневым ободком, длинные розовые лапы и хвост с кисточкой.
   ============================================================ */
(function (global) {
  'use strict';

  var TAU = Math.PI * 2;

  var C = {
    line: '#4a2a12',
    fur: '#e8913a',
    furDark: '#cb7527',
    furLight: '#f4b76a',
    cream: '#f7dfb0',
    creamShade: '#e7c793',
    earIn: '#f0a0a0',
    earInShade: '#d97f7f',
    earEdge: '#7a4a24',
    skin: '#f2a3a3',
    skinDark: '#d98585',
    claw: '#5a3418',
    tuft: '#8a4b22',
    tuftDark: '#6d3a18',
    nose: '#43240f',
    eyeWhite: '#fffaf0',
    iris: '#a9ba4d',
    irisDark: '#7d9030',
    pupil: '#221a10',
    coat: '#f0d5a2',
    coatShade: '#d2b47c',
    pants: '#7c5330',
    boot: '#5c3a20',
    riderSkin: '#e9c49a',
    strap: '#5a3a1e'
  };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }

  function ell(ctx, x, y, rx, ry, rot) {
    ctx.beginPath();
    ctx.ellipse(x, y, Math.max(0.2, rx), Math.max(0.2, ry), rot || 0, 0, TAU);
  }

  function fillStroke(ctx, fill, stroke, lw) {
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 4; ctx.stroke(); }
  }

  function limbPath(ctx, pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length - 1; i++) {
      var mx = (pts[i][0] + pts[i + 1][0]) / 2;
      var my = (pts[i][1] + pts[i + 1][1]) / 2;
      ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
    }
    var last = pts[pts.length - 1];
    ctx.lineTo(last[0], last[1]);
  }

  function limb(ctx, pts, width, color) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    limbPath(ctx, pts);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  }

  function limbOutlined(ctx, pts, width, color) {
    limb(ctx, pts, width + 6.5, C.line);
    limb(ctx, pts, width, color);
  }

  // лапа с утолщением у бедра
  function taperLimb(ctx, pts, w0, w1, color, outline) {
    var segs = 10;
    var prev = pts[0];
    var i, u, a, b, p;
    ctx.lineCap = 'round';
    if (outline) {
      prev = pts[0];
      for (i = 1; i <= segs; i++) {
        u = i / segs;
        p = pointOnPath(pts, u);
        a = lerp(w0, w1, (i - 1) / segs) + 6;
        limb(ctx, [prev, p], a, C.line);
        prev = p;
      }
    }
    prev = pts[0];
    for (i = 1; i <= segs; i++) {
      u = i / segs;
      p = pointOnPath(pts, u);
      b = lerp(w0, w1, i / segs);
      limb(ctx, [prev, p], b, color);
      prev = p;
    }
  }

  function pointOnPath(pts, u) {
    var total = 0, i, segs = [];
    for (i = 0; i < pts.length - 1; i++) {
      var d = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
      segs.push(d); total += d;
    }
    var target = u * total;
    for (i = 0; i < segs.length; i++) {
      if (target <= segs[i] || i === segs.length - 1) {
        var k = segs[i] ? clamp(target / segs[i], 0, 1) : 0;
        return [lerp(pts[i][0], pts[i + 1][0], k), lerp(pts[i][1], pts[i + 1][1], k)];
      }
      target -= segs[i];
    }
    return pts[pts.length - 1];
  }

  function bezPoint(p0, p1, p2, p3, t) {
    var u = 1 - t;
    var a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
    return [
      a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0],
      a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]
    ];
  }

  /* ---------------- хвост ---------------- */
  function drawTail(ctx, pose) {
    var t = pose.t, air = pose.air, speed = pose.speed;
    var wave = Math.sin(t * 7.5) * 5 + Math.sin(t * 13.3) * 2.4;
    var lift = air * 14;
    var p0 = [-48, -146];
    var p1 = [-112, -136 + wave * 0.7 - lift * 0.35];
    var p2 = [-176, -158 + wave - lift * 0.8];
    var p3 = [-206, -222 + wave * 1.3 - lift * 1.2 - clamp(speed * 0.4, 0, 8)];

    ctx.save();
    ctx.lineCap = 'round';
    var prev = p0;
    var segs = 16;
    for (var i = 1; i <= segs; i++) {
      var u = i / segs;
      var pt = bezPoint(p0, p1, p2, p3, u);
      var w = lerp(7.0, 1.8, u);
      limb(ctx, [prev, pt], w + 5.2, C.line);
      prev = pt;
    }
    prev = p0;
    for (var j = 1; j <= segs; j++) {
      var u2 = j / segs;
      var pt2 = bezPoint(p0, p1, p2, p3, u2);
      var w2 = lerp(5.8, 1.2, u2);
      limb(ctx, [prev, pt2], w2, u2 > 0.55 ? C.skinDark : C.skin);
      prev = pt2;
    }

    // кисточка
    var tip = p3;
    ctx.save();
    ctx.translate(tip[0], tip[1]);
    ctx.rotate(-0.8 + Math.sin(t * 4.2) * 0.06);
    ell(ctx, -6, -6, 20, 10, 0);
    fillStroke(ctx, C.tuft, C.line, 3);
    ctx.beginPath();
    ctx.moveTo(-21, -8); ctx.lineTo(-33, -19); ctx.lineTo(-17, -15); ctx.closePath();
    ctx.moveTo(-15, -15); ctx.lineTo(-26, -30); ctx.lineTo(-6, -19); ctx.closePath();
    ctx.moveTo(2, -13); ctx.lineTo(0, -29); ctx.lineTo(10, -15); ctx.closePath();
    fillStroke(ctx, C.tuft, C.line, 2.4);
    ctx.restore();
    ctx.restore();
  }

  /* ---------------- ухо ---------------- */
  function earPath(ctx, bx, by, len, wid, ang) {
    var dx = Math.cos(ang), dy = Math.sin(ang);
    var px = -dy, py = dx;
    var tipX = bx + dx * len, tipY = by + dy * len;
    ctx.beginPath();
    ctx.moveTo(bx - px * wid * 0.36, by - py * wid * 0.36);
    // задняя (внешняя) кромка
    ctx.bezierCurveTo(
      bx + dx * len * 0.10 - px * wid * 0.74, by + dy * len * 0.10 - py * wid * 0.74,
      bx + dx * len * 0.56 - px * wid * 0.70, by + dy * len * 0.56 - py * wid * 0.70,
      tipX - px * wid * 0.12, tipY - py * wid * 0.12
    );
    // округлый кончик
    ctx.quadraticCurveTo(tipX + dx * wid * 0.2, tipY + dy * wid * 0.2, tipX + px * wid * 0.16, tipY + py * wid * 0.16);
    // передняя кромка
    ctx.bezierCurveTo(
      bx + dx * len * 0.64 + px * wid * 0.64, by + dy * len * 0.64 + py * wid * 0.64,
      bx + dx * len * 0.22 + px * wid * 0.58, by + dy * len * 0.22 + py * wid * 0.58,
      bx + px * wid * 0.32, by + py * wid * 0.32
    );
    ctx.closePath();
  }

  function drawEarBack(ctx, bx, by, len, wid, ang) {
    var dx = Math.cos(ang), dy = Math.sin(ang);
    var px = -dy, py = dx;
    var tipX = bx + dx * len, tipY = by + dy * len;
    ctx.beginPath();
    ctx.moveTo(bx - px * wid * 0.36, by - py * wid * 0.36);
    ctx.bezierCurveTo(
      bx + dx * len * 0.10 - px * wid * 0.74, by + dy * len * 0.10 - py * wid * 0.74,
      bx + dx * len * 0.56 - px * wid * 0.70, by + dy * len * 0.56 - py * wid * 0.70,
      tipX - px * wid * 0.12, tipY - py * wid * 0.12
    );
    ctx.strokeStyle = C.earEdge;
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  function drawEar(ctx, bx, by, len, wid, ang, far) {
    earPath(ctx, bx, by, len, wid, ang);
    fillStroke(ctx, far ? C.furDark : C.furLight, C.earEdge, 5);
    drawEarBack(ctx, bx, by, len, wid, ang);

    var dx = Math.cos(ang), dy = Math.sin(ang);
    earPath(ctx, bx + dx * len * 0.13, by + dy * len * 0.13, len * 0.68, wid * 0.52, ang);
    fillStroke(ctx, far ? C.earInShade : C.earIn, null, 0);

    // тень у основания
    ctx.save();
    ctx.globalAlpha = 0.2;
    ell(ctx, bx + dx * 8, by + dy * 8, wid * 0.32, len * 0.14, ang + Math.PI / 2);
    ctx.fillStyle = C.furDark;
    ctx.fill();
    ctx.restore();
  }

  /* ---------------- лапы ---------------- */
  function drawFoot(ctx, ax, ay, tx, ty, color) {
    taperLimb(ctx, [[ax, ay], [tx, ty]], 11, 8, color, true);
    var ang = Math.atan2(ty - ay, tx - ax);
    var nx = Math.cos(ang + Math.PI / 2), ny = Math.sin(ang + Math.PI / 2);
    for (var i = -1; i <= 1; i++) {
      var px = tx + nx * i * 4.6;
      var py = ty + ny * i * 4.6;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px + Math.cos(ang) * 8, py + Math.sin(ang) * 8);
      ctx.lineTo(px + nx * i * 3 + Math.cos(ang + 0.55) * 2, py + ny * i * 3 + Math.sin(ang + 0.55) * 2);
      ctx.closePath();
      ctx.fillStyle = C.claw;
      ctx.fill();
    }
  }

  function drawLeg(ctx, hip, knee, ankle, toe, color) {
    taperLimb(ctx, [hip, knee], 15, 8.5, color, true);
    taperLimb(ctx, [knee, ankle], 8.5, 5.6, color, true);
    drawFoot(ctx, ankle[0], ankle[1], toe[0], toe[1], color);
  }

  function legPoints(phase, air, run, far) {
    var s = Math.sin(phase), lift = Math.max(0, Math.sin(phase));
    var hip = far ? [-18, -102] : [-2, -104];
    var kx = (far ? 18 : 28) + s * 19 * run;
    var ky = (far ? -64 : -60) - lift * 7 * run;
    var ax = (far ? 0 : 12) + s * 25 * run;
    var ay = (far ? -26 : -24) - lift * 20 * run;
    var tx = (far ? 64 : 80) + s * 30 * run;
    var ty = (far ? -8 : -6) - Math.max(0, s) * 26 * run;

    // поджатые в прыжке лапы
    var kx2 = far ? 24 : 34, ky2 = -100;
    var ax2 = far ? 42 : 54, ay2 = far ? -70 : -64;
    var tx2 = far ? 64 : 80, ty2 = far ? -50 : -44;

    return {
      hip: hip,
      knee: [lerp(kx, kx2, air), lerp(ky, ky2, air)],
      ankle: [lerp(ax, ax2, air), lerp(ay, ay2, air)],
      toe: [lerp(tx, tx2, air), lerp(ty, ty2, air)]
    };
  }

  function drawFrontPaws(ctx, air, t) {
    var w = Math.sin(t * 6) * 1.6;
    var defs = [
      { sh: [28, -166], hd: [42, -154 + w], rot: 0.75, sc: 1 },
      { sh: [32, -158], hd: [52, -145 - w * 0.6], rot: 0.95, sc: 0.92 }
    ];
    for (var i = 0; i < defs.length; i++) {
      var d = defs[i];
      var sh = [d.sh[0], d.sh[1] - air * 6];
      var hd = [d.hd[0], d.hd[1] - air * 8];
      ctx.save();
      limb(ctx, [sh, hd], 9, C.line);
      limb(ctx, [sh, hd], 5.5, C.skin);
      ctx.translate(hd[0], hd[1]);
      ctx.rotate(d.rot);
      ell(ctx, 0, 0, 4.8 * d.sc, 6.4 * d.sc, 0);
      fillStroke(ctx, C.skin, C.line, 2.4);
      ctx.strokeStyle = C.line;
      ctx.lineWidth = 1.4;
      for (var f = -1; f <= 1; f++) {
        ctx.beginPath();
        ctx.moveTo(2.6, f * 2.2);
        ctx.quadraticCurveTo(6.4, f * 2.6, 8, f * 3.2);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  /* ---------------- наездник ---------------- */
  function drawRider(ctx, o, pose) {
    var t = pose.t, air = pose.air, phase = pose.phase, speed = pose.speed;
    var scarf = o.scarf || '#2e9e96';
    var goggle = o.goggle || scarf;
    var bob = Math.sin(phase * 2) * 1.6;
    var lean = -0.14 - Math.min(0.2, speed * 0.006) - air * 0.12;

    ctx.save();
    ctx.translate(0, bob);

    // дальняя нога
    limbOutlined(ctx, [[-30, -196], [-12, -184], [4, -176]], 9, C.pants);
    ell(ctx, 4, -176, 8.2, 6, 0.15);
    fillStroke(ctx, C.boot, C.line, 3);

    // корпус
    ctx.save();
    ctx.translate(-28, -222);
    ctx.rotate(lean);
    ell(ctx, 0, 0, 16, 23, 0);
    fillStroke(ctx, C.coat, C.line, 4);
    ctx.save();
    ctx.globalAlpha = 0.5;
    ell(ctx, -5, 4, 8.5, 14, 0.2);
    ctx.fillStyle = C.coatShade;
    ctx.fill();
    ctx.restore();
    ctx.restore();

    // ближняя нога
    limbOutlined(ctx, [[-24, -196], [2, -190], [18, -182]], 10, C.pants);
    ell(ctx, 18, -181, 9, 6.4, 0.1);
    fillStroke(ctx, C.boot, C.line, 3);

    // руки и поводья
    limbOutlined(ctx, [[-12, -238], [8, -230], [26, -222]], 8, C.coat);
    ell(ctx, 27, -222, 5.6, 5, 0);
    fillStroke(ctx, C.riderSkin, C.line, 2.4);

    // голова
    ctx.save();
    ctx.translate(-20, -252);
    ctx.rotate(0.08);
    ell(ctx, 0, 0, 13.8, 14.2, 0);
    fillStroke(ctx, C.riderSkin, C.line, 3.2);
    // капюшон
    ctx.beginPath();
    ctx.arc(0, -1, 13.8, Math.PI * 0.98, Math.PI * 2.05);
    ctx.closePath();
    fillStroke(ctx, '#7a4a26', C.line, 2.2);
    // очки
    ctx.strokeStyle = C.strap;
    ctx.lineWidth = 4.2;
    ctx.beginPath();
    ctx.moveTo(-13, -4);
    ctx.quadraticCurveTo(0, -8, 13, -3.5);
    ctx.stroke();
    ell(ctx, 6.5, -2, 7, 5.8, -0.1);
    fillStroke(ctx, goggle, C.line, 2.4);
    ctx.globalAlpha = 0.85;
    ell(ctx, 4.6, -4, 2.2, 1.6, -0.3);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();

    // шарф
    var flap = Math.sin(t * 9) * 5 + Math.sin(t * 14) * 2.5 + air * 6 + speed * 0.14;
    ctx.save();
    ctx.translate(-30, -240);
    ctx.beginPath();
    ctx.moveTo(0, -4);
    ctx.bezierCurveTo(-18, -10 - flap * 0.4, -42, -2 + flap, -64, -14 + flap);
    ctx.bezierCurveTo(-50, 4 + flap * 0.7, -24, 12 + flap * 0.3, 0, 6);
    ctx.closePath();
    fillStroke(ctx, scarf, C.line, 3);
    ctx.globalAlpha = 0.32;
    ctx.beginPath();
    ctx.moveTo(-6, -2);
    ctx.bezierCurveTo(-22, -4, -38, 0, -52, -5 + flap * 0.6);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.restore();

    // повод
    ctx.strokeStyle = '#7a4a26';
    ctx.lineWidth = 2.1;
    ctx.beginPath();
    ctx.moveTo(26, -221);
    ctx.quadraticCurveTo(64, -208, 100, -190);
    ctx.stroke();
    ctx.restore();
  }

  /* ---------------- весь персонаж ---------------- */
  function draw(ctx, o) {
    var pose = o.pose || {};
    var t = pose.t || 0;
    var phase = pose.phase || 0;
    var air = clamp(pose.air || 0, 0, 1);
    var vy = pose.vy || 0;
    var speed = pose.speed || 0;
    var stumble = pose.stumble || 0;
    var squash = pose.squash == null ? 1 : pose.squash;
    var lean = (pose.lean || 0) + 0.03 + Math.min(0.14, speed * 0.0045) + air * 0.06 + stumble * 0.6;
    var run = 1 - air;
    var bob = -Math.abs(Math.sin(phase)) * 4 * run;

    ctx.save();
    ctx.translate(o.x, o.y + bob);
    ctx.scale(o.scale || 1, o.scale || 1);
    ctx.rotate(lean);
    ctx.scale(1 + (1 - squash) * 0.5, squash);

    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    var earFlop = clamp(-vy * 0.00032, -0.15, 0.22) + Math.sin(t * 2.4) * 0.016;
    var earLen = 112, earWid = 58;
    var nearEarAng = -1.87 + earFlop;
    var farEarAng = -2.06 + earFlop * 1.15;

    // уши (дальнее)
    drawEar(ctx, 30, -228, earLen * 0.96, earWid * 0.94, farEarAng, true);

    // хвост
    drawTail(ctx, pose);

    // дальняя лапа
    var farLeg = legPoints(phase + Math.PI, air, run, true);
    drawLeg(ctx, farLeg.hip, farLeg.knee, farLeg.ankle, farLeg.toe, C.skinDark);

    // тело
    ell(ctx, -4, -142, 54, 50, -0.16);
    fillStroke(ctx, C.fur, C.line, 5);

    // грудь
    ell(ctx, 22, -150, 32, 36, -0.05);
    fillStroke(ctx, C.fur, null, 0);

    // блик на спине
    ctx.save();
    ctx.globalAlpha = 0.5;
    ell(ctx, -24, -162, 27, 22, -0.5);
    ctx.fillStyle = C.furLight;
    ctx.fill();
    ctx.restore();

    // живот
    ell(ctx, 16, -118, 33, 30, -0.12);
    fillStroke(ctx, C.cream, null, 0);
    ctx.save();
    ctx.globalAlpha = 0.5;
    ell(ctx, 11, -104, 22, 13, -0.1);
    ctx.fillStyle = C.creamShade;
    ctx.fill();
    ctx.restore();

    // грудной пушок
    ctx.beginPath();
    ctx.arc(34, -128, 10, -0.5, 2.4);
    ctx.arc(42, -136, 7.5, -0.3, 2.2);
    ctx.fillStyle = C.cream;
    ctx.fill();

    // ближняя лапа
    var nearLeg = legPoints(phase, air, run, false);
    drawLeg(ctx, nearLeg.hip, nearLeg.knee, nearLeg.ankle, nearLeg.toe, C.skin);

    // передние лапки
    drawFrontPaws(ctx, air, t);

    // тень шеи
    ctx.save();
    ctx.globalAlpha = 0.22;
    ell(ctx, 34, -190, 22, 26, 0.25);
    ctx.fillStyle = C.furDark;
    ctx.fill();
    ctx.restore();

    // ближнее ухо
    drawEar(ctx, 44, -225, earLen, earWid, nearEarAng, false);

    // голова
    ell(ctx, 52, -198, 38, 36, 0.1);
    fillStroke(ctx, C.fur, C.line, 5);

    // вытянутая мордочка
    ctx.beginPath();
    ctx.moveTo(58, -224);
    ctx.quadraticCurveTo(112, -216, 128, -192);
    ctx.quadraticCurveTo(130, -180, 112, -176);
    ctx.quadraticCurveTo(84, -174, 68, -186);
    ctx.closePath();
    fillStroke(ctx, C.fur, C.line, 4.5);

    // кремовая мордочка
    ell(ctx, 96, -188, 23, 15, 0.18);
    fillStroke(ctx, C.cream, null, 0);
    ell(ctx, 66, -192, 14, 13, 0.1);
    fillStroke(ctx, C.cream, null, 0);
    ell(ctx, 114, -184, 10, 8, 0.2);
    fillStroke(ctx, C.cream, null, 0);

    // нос
    ctx.save();
    ctx.translate(124, -186);
    ctx.rotate(0.22);
    ell(ctx, 0, 0, 8.2, 6.4, 0);
    fillStroke(ctx, C.nose, C.line, 2.2);
    ctx.globalAlpha = 0.5;
    ell(ctx, -2.2, -2.2, 2.8, 1.9, -0.3);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.restore();

    // рот
    ctx.strokeStyle = C.line;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(112, -173);
    ctx.quadraticCurveTo(105, -166, 96, -170);
    ctx.stroke();

    // глаз
    ell(ctx, 74, -212, 14.6, 15.4, 0.05);
    fillStroke(ctx, C.eyeWhite, C.line, 3);
    ell(ctx, 78, -211, 8.8, 9.6, 0);
    ctx.fillStyle = C.iris;
    ctx.fill();
    ctx.strokeStyle = C.irisDark;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ell(ctx, 79, -210.5, 4.4, 5, 0);
    ctx.fillStyle = C.pupil;
    ctx.fill();
    ctx.globalAlpha = 0.95;
    ell(ctx, 75, -217, 2.9, 2.2, -0.4);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.globalAlpha = 1;

    // веко и бровь
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

    // румянец
    ctx.save();
    ctx.globalAlpha = 0.4;
    ell(ctx, 50, -190, 6.5, 4, -0.4);
    ctx.fillStyle = C.earIn;
    ctx.fill();
    ctx.restore();

    // вибриссы
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = C.line;
    ctx.lineWidth = 1.4;
    var whisk = [[119, -178, 160, -192], [121, -177, 164, -177], [119, -175, 156, -161]];
    for (var w = 0; w < whisk.length; w++) {
      var a = whisk[w];
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.quadraticCurveTo((a[0] + a[2]) / 2, (a[1] + a[3]) / 2 - 4, a[2], a[3]);
      ctx.stroke();
    }
    ctx.restore();

    // наездник
    drawRider(ctx, o, pose);

    ctx.restore();
  }

  global.Jerboa = {
    draw: draw,
    colors: C
  };
})(window);
