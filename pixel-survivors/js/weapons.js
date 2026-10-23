'use strict';
// 武器行为：开火逻辑 + 各类投射物的运动与命中
(function () {
  const PS = window.PS;
  const U = PS.U;
  const W = (PS.weapons = {});
  const B = {}; // 武器类型 → 行为
  const PROJ = {}; // 投射物类型 → 每帧更新

  function addProj(g, p) {
    p.uid = g.uid++;
    p.t = 0;
    p.dead = false;
    if (p.once) p.hitSet = new Set();
    if (!p.once && p.hitDelay === undefined) p.hitDelay = 0.5;
    g.projs.push(p);
    return p;
  }
  W.addProj = addProj;

  function queueShots(w, n, interval) {
    for (let i = 0; i < n; i++) w.queue.push({ t: i * interval, i, n });
  }

  function nearestEnemy(g, x, y, maxD) {
    let best = null, bd = maxD * maxD;
    for (const e of g.enemies) {
      if (e.dead || e.intangible) continue;
      const dx = e.x - x, dy = e.y - y, d2 = dx * dx + dy * dy;
      if (d2 < bd) { bd = d2; best = e; }
    }
    return best;
  }
  const tmp = [];
  function randomInView(g, margin) {
    const c = g.cam;
    tmp.length = 0;
    for (const e of g.enemies) {
      if (e.dead || e.intangible) continue;
      if (e.x > c.x - margin && e.x < c.x + c.w + margin && e.y > c.y - margin && e.y < c.y + c.h + margin) tmp.push(e);
    }
    return tmp.length ? tmp[Math.floor(Math.random() * tmp.length)] : null;
  }
  W.nearestEnemy = nearestEnemy;

  // 穿透型命中（每个敌人只命中一次）
  function hitPierce(g, p) {
    g.forEnemiesInCircle(p.x, p.y, p.r, (e) => {
      if (!g.canHit(p, e)) return;
      const sp = Math.hypot(p.vx, p.vy) || 1;
      g.damageEnemy(e, p.dmg, p.w, p.vx / sp, p.vy / sp, p.kb);
      if (--p.pierce <= 0) {
        p.dead = true;
        return false;
      }
    });
  }
  // 持续型命中（按间隔重复命中）
  function hitRepeat(g, p, cx, cy) {
    g.forEnemiesInCircle(p.x, p.y, p.r, (e) => {
      if (!g.canHit(p, e)) return;
      let nx, ny;
      if (cx !== undefined) {
        const dx = e.x - cx, dy = e.y - cy, d = Math.hypot(dx, dy) || 1;
        nx = dx / d;
        ny = dy / d;
      } else {
        const sp = Math.hypot(p.vx || 0, p.vy || 0) || 1;
        nx = (p.vx || 0) / sp;
        ny = (p.vy || 0) / sp;
      }
      g.damageEnemy(e, p.dmg, p.w, nx, ny, p.kb);
    });
  }

  // ---------------- 鞭子：横扫 ----------------
  B.slash = {
    fire(g, w) {
      queueShots(w, g.wAmount(w), 0.12);
    },
    shot(g, w, q) {
      const P = g.P;
      const side = (q.i % 2 === 0 ? 1 : -1) * P.facing;
      const row = Math.floor(q.i / 2);
      const area = g.wArea(w);
      addProj(g, {
        kind: 'slash', w, side, oy: -2 - row * 9, len: 60 * area, hh: 16 * area, life: 0.24, once: true,
        dmg: g.wDmg(w), kb: w.st.kb, x: P.x, y: P.y, evo: !!w.def.evolved,
      });
      PS.audio.sfx('whip');
    },
  };
  PROJ.slash = (g, p) => {
    const P = g.P;
    p.x = P.x + p.side * (p.len / 2 + 2);
    p.y = P.y + p.oy;
    if (p.t > 0.12) return;
    const hl = p.len / 2, hh = p.hh / 2;
    g.forEnemiesInCircle(p.x, p.y, hl + 2, (e) => {
      if (Math.abs(e.y - p.y) > hh + e.r || Math.abs(e.x - p.x) > hl + e.r) return;
      if (!g.canHit(p, e)) return;
      g.damageEnemy(e, p.dmg, p.w, p.side, 0, p.kb);
    });
  };

  // ---------------- 魔杖：最近敌人 ----------------
  B.nearest = {
    fire(g, w) {
      queueShots(w, g.wAmount(w), w.def.evolved ? 0 : 0.1);
    },
    shot(g, w, q) {
      const P = g.P;
      const t = nearestEnemy(g, P.x, P.y, 320);
      let ang = t ? Math.atan2(t.y - P.y, t.x - P.x) : Math.random() * Math.PI * 2;
      if (w.def.evolved && q.n > 1) ang += (q.i - (q.n - 1) / 2) * 0.14;
      const nx = Math.cos(ang), ny = Math.sin(ang);
      const sp = 210 * g.wSpeed(w), area = g.wArea(w);
      addProj(g, {
        kind: 'bullet', w, x: P.x, y: P.y - 2, vx: nx * sp, vy: ny * sp, life: 2.0, r: 3 * area, once: true,
        pierce: w.st.pierce, dmg: g.wDmg(w), kb: w.st.kb, spr: w.def.pspr, rot: ang, scale: 1, trail: w.def.evolved ? '#ffe08a' : '#6dc2ca',
      });
      PS.audio.sfx('shoot');
    },
  };

  // ---------------- 飞刀：面朝方向 ----------------
  B.facing = {
    fire(g, w) {
      queueShots(w, g.wAmount(w), w.def.evolved ? 0.025 : 0.07);
    },
    shot(g, w) {
      const P = g.P;
      const off = U.rand(-5, 5);
      let nx = P.dirX, ny = P.dirY;
      // 自动瞄准：移动时瞄准前方半圆内最近的敌人，站立不动时瞄准任意方向最近的敌人
      let best = null, bd = 260 * 260;
      for (const e of g.enemies) {
        if (e.dead || e.intangible) continue;
        const dx = e.x - P.x, dy = e.y - P.y, d2 = dx * dx + dy * dy;
        if (d2 < bd && (!P.moving || dx * nx + dy * ny > 0)) { bd = d2; best = e; }
      }
      if (best) {
        const d = Math.sqrt(bd) || 1;
        nx = (best.x - P.x) / d;
        ny = (best.y - P.y) / d;
      }
      const sp = 330 * g.wSpeed(w), area = g.wArea(w);
      addProj(g, {
        kind: 'bullet', w, x: P.x - ny * off, y: P.y - 2 + nx * off, vx: nx * sp, vy: ny * sp, life: 1.1, r: 3 * area, once: true,
        pierce: w.st.pierce, dmg: g.wDmg(w), kb: w.st.kb, spr: w.def.evolved ? 'p_knife' : 'p_knife', rot: Math.atan2(ny, nx), scale: 1,
        tint: w.def.evolved,
      });
      PS.audio.sfx('knife');
    },
  };

  // ---------------- 战斧：抛物线 ----------------
  B.axe = {
    fire(g, w) {
      queueShots(w, g.wAmount(w), 0.12);
    },
    shot(g, w, q) {
      const P = g.P;
      const area = g.wArea(w);
      const vx = P.facing * U.rand(15, 55) + (q.i - (q.n - 1) / 2) * 38;
      const vy = -U.rand(215, 250) * g.wSpeed(w);
      addProj(g, {
        kind: 'axe', w, x: P.x, y: P.y - 4, vx, vy, grav: 430, life: 3, r: 7 * area, once: true, pierce: w.st.pierce,
        dmg: g.wDmg(w), kb: w.st.kb, spr: 'p_axe', rot: 0, spin: 11 * (vx >= 0 ? 1 : -1), scale: area,
      });
      PS.audio.sfx('axe');
    },
  };
  PROJ.axe = (g, p, dt) => {
    p.vy += p.grav * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rot += p.spin * dt;
    hitPierce(g, p);
  };

  // ---------------- 死亡螺旋：放射旋转巨斧 ----------------
  B.spiral = {
    fire(g, w) {
      const P = g.P;
      const n = g.wAmount(w), area = g.wArea(w), sp = 125 * g.wSpeed(w);
      const off = Math.random() * Math.PI * 2;
      for (let i = 0; i < n; i++) {
        const a = off + (i / n) * Math.PI * 2;
        addProj(g, {
          kind: 'axe', w, x: P.x, y: P.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, grav: 0, life: 2.4, r: 9 * area, once: true,
          pierce: 999, dmg: g.wDmg(w), kb: w.st.kb, spr: 'i_spiral', rot: 0, spin: 12, scale: Math.min(2.2, area * 0.8),
        });
      }
      PS.audio.sfx('axe');
    },
    shot() {},
  };

  // ---------------- 十字回旋 ----------------
  B.boom = {
    fire(g, w) {
      queueShots(w, g.wAmount(w), 0.15);
    },
    shot(g, w, q) {
      const P = g.P;
      const t = nearestEnemy(g, P.x, P.y, 360);
      let ang = t ? Math.atan2(t.y - P.y, t.x - P.x) : Math.atan2(P.dirY, P.dirX);
      // 第一发精确瞄准，其余略微散开
      if (q && q.i > 0) ang += (q.i % 2 ? 1 : -1) * Math.ceil(q.i / 2) * 0.18;
      const sp = 235 * g.wSpeed(w), area = g.wArea(w);
      // 根据目标距离调整减速度，保证十字能飞到目标处再折返（最远约 210 像素）
      const range = t ? U.clamp(Math.hypot(t.x - P.x, t.y - P.y) + 14, 80, 210) : 92;
      addProj(g, {
        kind: 'boom', w, x: P.x, y: P.y, dx: Math.cos(ang), dy: Math.sin(ang), v: sp, acc: -(sp * sp) / (2 * range), life: 3.2, r: 6 * area,
        hitDelay: w.st.hitDelay, dmg: g.wDmg(w), kb: w.st.kb, spr: w.def.evolved ? 'i_heaven' : 'p_cross', rot: 0, scale: area,
      });
      PS.audio.sfx('shoot');
    },
  };
  PROJ.boom = (g, p, dt) => {
    p.v += p.acc * dt;
    p.vx = p.dx * p.v;
    p.vy = p.dy * p.v;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rot += 14 * dt;
    hitRepeat(g, p);
  };

  // ---------------- 圣水：投掷后形成圣域 ----------------
  B.pool = {
    fire(g, w) {
      queueShots(w, g.wAmount(w), 0.15);
    },
    shot(g, w) {
      const P = g.P;
      let tx, ty;
      const t = randomInView(g, -20);
      if (t && U.dist2(t.x, t.y, P.x, P.y) < 190 * 190) {
        tx = t.x;
        ty = t.y;
      } else {
        const a = Math.random() * Math.PI * 2, d = U.rand(40, 110);
        tx = P.x + Math.cos(a) * d;
        ty = P.y + Math.sin(a) * d;
      }
      addProj(g, { kind: 'flask', w, sx: P.x, sy: P.y, x: P.x, y: P.y, tx, ty, life: 0.4, rot: 0, spr: w.def.evolved ? 'i_sanctum' : 'p_flask' });
    },
  };
  PROJ.flask = (g, p) => {
    const k = Math.min(1, p.t / p.life);
    p.x = U.lerp(p.sx, p.tx, k);
    p.y = U.lerp(p.sy, p.ty, k) - Math.sin(k * Math.PI) * 30;
    p.rot += 0.3;
    if (p.t >= p.life && !p.spawned) {
      p.spawned = true;
      const w = p.w;
      const area = g.wArea(w);
      addProj(g, {
        kind: 'pool', w, x: p.tx, y: p.ty, r: 20 * area, life: g.wDur(w), hitDelay: w.st.hitDelay, dmg: g.wDmg(w), kb: 0,
        chase: !!w.st.chase, evo: !!w.def.evolved,
      });
      for (let i = 0; i < 6; i++) g.addPart(p.tx, p.ty, U.rand(-50, 50), U.rand(-70, -20), 0.4, '#b8e8f0', 1, 200);
      PS.audio.sfx('freeze');
    }
  };
  PROJ.pool = (g, p, dt) => {
    if (p.chase) {
      const P = g.P;
      const dx = P.x - p.x, dy = P.y - p.y, d = Math.hypot(dx, dy) || 1;
      if (d > 10) {
        p.x += (dx / d) * 32 * dt;
        p.y += (dy / d) * 32 * dt;
      }
      p.r += 5 * dt;
    }
    if (Math.random() < 0.25) {
      const a = Math.random() * Math.PI * 2, rr = Math.random() * p.r;
      g.addPart(p.x + Math.cos(a) * rr, p.y + Math.sin(a) * rr, 0, -15, 0.5, p.evo ? '#f3a0b4' : '#b8e8f0', 1);
    }
    hitRepeat(g, p, p.x, p.y);
  };

  // ---------------- 大蒜：光环 ----------------
  B.aura = {
    persistent: () => true,
    tick(g, w) {
      if (!w.aura || w.aura.dead) {
        w.aura = addProj(g, { kind: 'aura', w, persistent: true, x: g.P.x, y: g.P.y, r: 10, hitDelay: 1, dmg: 0, kb: 0, evo: !!w.def.evolved });
      }
      const a = w.aura;
      a.r = 26 * g.wArea(w);
      a.dmg = g.wDmg(w);
      a.hitDelay = w.st.hitDelay;
      a.kb = w.st.kb;
      a.evo = !!w.def.evolved;
    },
    fire() {},
    shot() {},
  };
  PROJ.aura = (g, p) => {
    p.x = g.P.x;
    p.y = g.P.y;
    hitRepeat(g, p, p.x, p.y);
  };

  // ---------------- 圣经：环绕 ----------------
  B.orbit = {
    persistent: (w) => !!w.st.permanent,
    extraCd: (g, w) => g.wDur(w),
    tick(g, w) {
      if (!w.st.permanent) return;
      const n = g.wAmount(w);
      if (!w.books || w.books.length !== n || w.books.some((b) => b.dead)) {
        if (w.books) for (const b of w.books) b.dead = true;
        w.books = [];
        for (let i = 0; i < n; i++) {
          w.books.push(addProj(g, { kind: 'orbit', w, persistent: true, ang: (i / n) * Math.PI * 2, R: 40, angSpd: 3, r: 6, hitDelay: 0.4, dmg: 0, kb: 0, x: g.P.x, y: g.P.y, spr: 'i_vespers' }));
        }
      }
      for (const b of w.books) {
        b.R = 40 * g.wArea(w);
        b.angSpd = 3.0 * g.wSpeed(w);
        b.r = 6 * Math.sqrt(g.wArea(w));
        b.dmg = g.wDmg(w);
        b.kb = w.st.kb;
        b.hitDelay = w.st.hitDelay;
      }
    },
    fire(g, w) {
      if (w.st.permanent) return;
      const n = g.wAmount(w), area = g.wArea(w), dur = g.wDur(w);
      for (let i = 0; i < n; i++) {
        addProj(g, {
          kind: 'orbit', w, ang: (i / n) * Math.PI * 2, R: 40 * area, angSpd: 3.0 * g.wSpeed(w), life: dur, r: 6 * Math.sqrt(area),
          hitDelay: w.st.hitDelay, dmg: g.wDmg(w), kb: w.st.kb, x: g.P.x, y: g.P.y, spr: 'p_book',
        });
      }
    },
    shot() {},
  };
  PROJ.orbit = (g, p, dt) => {
    p.ang += p.angSpd * dt;
    p.x = g.P.x + Math.cos(p.ang) * p.R;
    p.y = g.P.y + Math.sin(p.ang) * p.R * 0.85;
    hitRepeat(g, p, g.P.x, g.P.y);
  };

  // ---------------- 落雷 ----------------
  function strikeAt(g, w, x, y) {
    const area = g.wArea(w);
    const r = 15 * area;
    const dmg = g.wDmg(w);
    g.forEnemiesInCircle(x, y, r, (e) => {
      g.damageEnemy(e, dmg, w, 0, 0, 0);
    });
    g.addFx({ kind: 'bolt', x, y, life: 0.22, seed: Math.random() * 1000, evo: !!w.def.evolved });
    g.addFx({ kind: 'ring', x, y, r0: 2, r1: r, life: 0.25, color: w.def.evolved ? '#b8e8f0' : '#ffe08a' });
    for (let i = 0; i < 4; i++) g.addPart(x, y, U.rand(-60, 60), U.rand(-80, -10), 0.3, '#ffe08a', 1, 200);
    PS.audio.sfx('thunder');
  }
  B.strike = {
    fire(g, w) {
      queueShots(w, g.wAmount(w), 0.07);
    },
    shot(g, w) {
      const P = g.P;
      const t = randomInView(g, -8);
      let x, y;
      if (t) { x = t.x; y = t.y; } else {
        x = P.x + U.rand(-120, 120);
        y = P.y + U.rand(-80, 80);
      }
      strikeAt(g, w, x, y);
      if (w.st.double) addProj(g, { kind: 'delay', w, x, y, life: 0.28, fn: () => strikeAt(g, w, x, y) });
    },
  };
  PROJ.delay = (g, p) => {
    if (p.t >= p.life && !p.done) {
      p.done = true;
      p.fn();
    }
  };

  // ---------------- 火球 ----------------
  B.fireball = {
    fire(g, w) {
      queueShots(w, g.wAmount(w), 0.08);
    },
    shot(g, w, q) {
      const P = g.P;
      // 每轮第一发瞄准最近的敌人，其余随机攻击画面内的敌人
      const first = !q || q.i === 0;
      const t = first ? nearestEnemy(g, P.x, P.y, 360) || randomInView(g, -10) : randomInView(g, -10);
      let ang = t ? Math.atan2(t.y - P.y, t.x - P.x) + (first ? 0 : U.rand(-0.12, 0.12)) : Math.random() * Math.PI * 2;
      const sp = 140 * g.wSpeed(w), area = g.wArea(w);
      const evo = !!w.def.evolved;
      addProj(g, {
        kind: 'fireball', w, x: P.x, y: P.y - 2, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: 2.8, r: (evo ? 7 : 4) * area,
        once: true, pierce: w.st.pierce, dmg: g.wDmg(w), kb: w.st.kb, exR: (evo ? 30 : 18) * area, spr: w.def.pspr, rot: ang, scale: 1, evo,
      });
      PS.audio.sfx('shoot');
    },
  };
  function explode(g, p, x, y) {
    const nx = p.vx, ny = p.vy, sp = Math.hypot(nx, ny) || 1;
    g.forEnemiesInCircle(x, y, p.exR, (e) => {
      g.damageEnemy(e, p.dmg, p.w, nx / sp, ny / sp, p.kb);
    });
    g.addFx({ kind: 'ring', x, y, r0: 3, r1: p.exR, life: 0.28, color: '#ff9f43' });
    for (let i = 0; i < (p.evo ? 12 : 6); i++) g.addPart(x, y, U.rand(-70, 70), U.rand(-80, 20), U.rand(0.2, 0.45), i % 2 ? '#ff9f43' : '#ffe08a', 2, 60);
    PS.audio.sfx('explode');
  }
  PROJ.fireball = (g, p, dt) => {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (Math.random() < 0.6) g.addPart(p.x + U.rand(-2, 2), p.y + U.rand(-2, 2), -p.vx * 0.1, -p.vy * 0.1 - 10, 0.3, Math.random() < 0.5 ? '#ff9f43' : '#d04648', p.evo ? 2 : 1);
    g.forEnemiesInCircle(p.x, p.y, p.r, (e) => {
      if (!g.canHit(p, e)) return;
      explode(g, p, p.x, p.y);
      if (--p.pierce <= 0) {
        p.dead = true;
        return false;
      }
    });
  };

  // ---------------- 寒冰新星 ----------------
  B.nova = {
    fire(g, w) {
      queueShots(w, g.wAmount(w), 0.35);
    },
    shot(g, w) {
      const P = g.P;
      addProj(g, {
        kind: 'nova', w, x: P.x, y: P.y, R: 64 * g.wArea(w), life: 0.55, grow: 0.4, once: true, r: 0, dmg: g.wDmg(w),
        kb: w.st.kb, slow: g.wDur(w), freeze: w.st.freeze || 0, evo: !!w.def.evolved,
      });
      PS.audio.sfx('freeze');
    },
  };
  PROJ.nova = (g, p) => {
    p.r = p.R * Math.min(1, p.t / p.grow);
    g.forEnemiesInCircle(p.x, p.y, p.r, (e) => {
      if (!g.canHit(p, e)) return;
      const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy) || 1;
      g.damageEnemy(e, p.dmg, p.w, dx / d, dy / d, p.kb);
      if (e.dead || e.prop) return;
      if (e.boss) e.slowT = Math.max(e.slowT, p.slow * 0.5);
      else if (Math.random() < p.freeze) e.frozenT = Math.max(e.frozenT, p.slow * 0.6);
      else e.slowT = Math.max(e.slowT, p.slow);
    });
  };

  // ---------------- 符文：边缘弹射 ----------------
  B.bounce = {
    fire(g, w) {
      queueShots(w, g.wAmount(w), 0.1);
    },
    shot(g, w) {
      const P = g.P;
      const a = Math.random() * Math.PI * 2;
      const sp = 170 * g.wSpeed(w), area = g.wArea(w);
      addProj(g, {
        kind: 'rune', w, x: P.x, y: P.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: g.wDur(w), r: 5 * area,
        hitDelay: w.st.hitDelay, dmg: g.wDmg(w), kb: w.st.kb, spr: w.def.evolved ? 'i_void' : 'p_rune', rot: 0, scale: Math.min(2, area),
        evo: !!w.def.evolved,
      });
      PS.audio.sfx('shoot');
    },
  };
  PROJ.rune = (g, p, dt) => {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    const c = g.cam;
    if ((p.x < c.x + 4 && p.vx < 0) || (p.x > c.x + c.w - 4 && p.vx > 0)) p.vx = -p.vx;
    if ((p.y < c.y + 4 && p.vy < 0) || (p.y > c.y + c.h - 4 && p.vy > 0)) p.vy = -p.vy;
    p.rot += 6 * dt;
    if (Math.random() < 0.4) g.addPart(p.x, p.y, 0, 0, 0.25, p.evo ? '#9b4dbb' : '#6dc2ca', 1);
    hitRepeat(g, p);
  };

  // ---------------- 通用直线弹 ----------------
  PROJ.bullet = (g, p, dt) => {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.trail && Math.random() < 0.5) g.addPart(p.x, p.y, 0, 0, 0.18, p.trail, 1);
    hitPierce(g, p);
  };

  // ================= 每帧更新 =================
  W.update = function (g, dt) {
    for (const w of g.weapons) {
      const b = B[w.def.type];
      if (!b) continue;
      if (b.tick) b.tick(g, w, dt);
      if (!(b.persistent && b.persistent(w))) {
        w.cd -= dt;
        if (w.cd <= 0) {
          w.cd = g.wCd(w) + (b.extraCd ? b.extraCd(g, w) : 0);
          b.fire(g, w);
        }
      }
      if (w.queue.length) {
        for (let i = 0; i < w.queue.length; i++) {
          const q = w.queue[i];
          q.t -= dt;
          if (q.t <= 0) {
            w.queue.splice(i, 1);
            i--;
            b.shot(g, w, q);
          }
        }
      }
    }
    const ps = g.projs;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      if (p.dead) continue;
      p.t += dt;
      const fn = PROJ[p.kind];
      if (fn) fn(g, p, dt);
      if (p.life !== undefined && p.t >= p.life) p.dead = true;
      if (!p.persistent && (p.x < -200 || p.y < -200 || p.x > g.mapW + 200 || p.y > g.mapH + 200)) p.dead = true;
    }
  };

  W.behaviors = B;
})();
