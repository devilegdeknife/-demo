'use strict';
// 核心对局逻辑：玩家、敌人、Boss、刷怪导演、掉落、升级、宝箱、进化
(function () {
  const PS = window.PS;
  const U = PS.U, D = PS.DATA;

  const MAX_ENEMIES = 420;
  const MAX_GEMS = 300;
  const HP_PER_MIN = 0.1;
  const PLAYER_SPEED = 80;
  const BASE_MAGNET = 36;
  const ELITE_HP = 18;
  const IFRAMES = 0.45;
  PS.CONST = { MAX_ENEMIES, MAX_GEMS };

  // 障碍物碰撞半径（0 = 纯装饰）
  const OBS = { tomb: 6, tomb2: 5, deadtree: 4, pine: 6, bush: 6, rock: 6, pillar: 7, lavarock: 6, bones: 0 };

  class Game {
    constructor(charId, stageId) {
      this.charId = charId;
      this.stageId = stageId;
      this.ch = D.chars[charId];
      this.st = D.stages[stageId];
      this.mapW = this.st.mapW;
      this.mapH = this.st.mapH;
      this.settings = PS.save.data.settings;
      this.time = 0;
      this.kills = 0;
      this.gold = 0;
      this.level = 1;
      this.xp = 0;
      this.xpNext = D.xpReq(1);
      this.uid = 1;
      this.enemies = [];
      this.bosses = [];
      this.projs = [];
      this.ebullets = [];
      this.hazards = [];
      this.pickups = [];
      this.parts = [];
      this.nums = [];
      this.fx = [];
      this.weapons = [];
      this.passives = [];
      this.banished = new Set();
      this.grid = new U.Grid(this.mapW, this.mapH, 32);
      this.gemCount = 0;
      this.bigGem = null;
      this.pendingLevels = 0;
      this.freezeT = 0;
      this.spawnT = 0;
      this.evIdx = 0;
      this.events = this.st.events.slice().sort((a, b) => a.t - b.t);
      this.run = { bossKills: 0, chests: 0, evolutions: 0 };
      this.unlocks = [];
      this.unlockT = 1;
      this.shake = 0;
      this.hurtFlash = 0;
      this.whiteFlash = 0;
      this.lvlFlash = 0;
      this.ending = false;
      this.endT = 0;
      this.victory = false;
      this.dead = false;
      this.quit = false;
      this.committed = false;
      this.listeners = {};
      this.cam = { x: 0, y: 0, w: 640, h: 360 };
      this.farDist = 520;

      const ms = PS.save.metaStats();
      this.rerolls = ms.reroll || 0;
      this.skips = ms.skip || 0;
      this.banishes = ms.banish || 0;

      this.P = { x: this.mapW / 2, y: this.mapH / 2, r: 5, hp: 0, maxHp: 0, iframes: 0, facing: 1, dirX: 1, dirY: 0, moving: false, anim: 0, st: null };
      this.recalcStats();
      this.P.hp = this.P.maxHp;
      this.P.revivals = this.P.st.revival;
      this.genMap();
      this.addWeapon(this.ch.weapon);
      this.updateCam();
    }

    on(ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); }
    emit(ev, data) { (this.listeners[ev] || []).forEach((fn) => fn(data)); }

    // ================= 地图 =================
    genMap() {
      const rnd = U.rng((Math.random() * 1e9) | 0);
      this.obstacles = [];
      this.obsGrid = new U.Grid(this.mapW, this.mapH, 64);
      const cx = this.mapW / 2, cy = this.mapH / 2;
      const conf = this.st.obstacles;
      let tries = 0;
      while (this.obstacles.length < conf.n && tries++ < conf.n * 30) {
        const x = 60 + rnd() * (this.mapW - 120), y = 60 + rnd() * (this.mapH - 120);
        if (U.dist2(x, y, cx, cy) < 140 * 140) continue;
        let ok = true;
        for (const o of this.obstacles) if (U.dist2(x, y, o.x, o.y) < 56 * 56) { ok = false; break; }
        if (!ok) continue;
        const spr = conf.types[Math.floor(rnd() * conf.types.length)];
        const o = { x, y, r: OBS[spr] || 0, spr, kind: 'obs' };
        this.obstacles.push(o);
        if (o.r > 0) this.obsGrid.insert(o);
      }
      this.braziers = [];
      for (let i = 0; i < this.st.braziers; i++) this.placeBrazier(this.braziers.length === 0 ? 1 : 0);
    }

    placeBrazier(near) {
      for (let k = 0; k < 40; k++) {
        let x, y;
        if (near) {
          const a = Math.random() * Math.PI * 2;
          x = this.P.x + Math.cos(a) * 90;
          y = this.P.y + Math.sin(a) * 70;
        } else {
          x = 60 + Math.random() * (this.mapW - 120);
          y = 60 + Math.random() * (this.mapH - 120);
        }
        if (this.blocked(x, y, 14)) continue;
        const b = { uid: this.uid++, prop: true, x, y, r: 6, hp: 1, dead: false, hitT: {}, anim: Math.random() * 10, respawnT: 0 };
        this.braziers.push(b);
        return b;
      }
      return null;
    }

    blocked(x, y, r) {
      const list = this.obsGrid.query(x, y, r + 16);
      for (const o of list) if (U.dist2(x, y, o.x, o.y) < (o.r + r) * (o.r + r)) return true;
      return false;
    }

    pushOutObstacles(ent, r) {
      const list = this.obsGrid.query(ent.x, ent.y, r + 16);
      for (const o of list) {
        const dx = ent.x - o.x, dy = ent.y - o.y, rr = o.r + r;
        const d2 = dx * dx + dy * dy;
        if (d2 < rr * rr) {
          const d = Math.sqrt(d2) || 0.01;
          ent.x = o.x + (dx / d) * rr;
          ent.y = o.y + (dy / d) * rr;
        }
      }
    }

    // ================= 属性 =================
    recalcStats() {
      const s = { maxHp: 100, hpPct: 0, recovery: 0, armor: 0, move: 1, might: 1, area: 1, speed: 1, duration: 1, amount: 0, cooldown: 1, luck: 1, growth: 1, greed: 1, magnet: 1, revival: 0 };
      const add = (k, v) => { if (k in s) s[k] += v; };
      for (const k in this.ch.bonus) add(k, this.ch.bonus[k]);
      const ms = PS.save.metaStats();
      for (const k in ms) add(k, ms[k]);
      for (const p of this.passives) add(p.def.stat, p.def.per * p.level);
      s.cooldown = Math.max(0.4, s.cooldown);
      s.move = Math.max(0.5, s.move);
      const P = this.P;
      const oldMax = P.maxHp || 0;
      P.st = s;
      P.maxHp = Math.round(s.maxHp * (1 + s.hpPct));
      if (oldMax && P.maxHp > oldMax) P.hp += P.maxHp - oldMax;
      P.hp = Math.min(P.hp, P.maxHp);
      P.magnetR = BASE_MAGNET * s.magnet;
    }

    // ================= 武器与被动 =================
    addWeapon(id) {
      const def = D.weapons[id];
      const w = { id, def, baseId: def.from || id, level: 1, cd: 0.4, queue: [], dmg: 0, kills: 0, t0: this.time, uid: this.uid++ };
      this.recalcWeapon(w);
      this.weapons.push(w);
      PS.save.markSeen('weapons', id);
      return w;
    }
    recalcWeapon(w) {
      const st = Object.assign({}, w.def.base);
      for (let i = 0; i < w.level - 1 && i < w.def.levels.length; i++) {
        const lv = w.def.levels[i];
        for (const k in lv) st[k] = (st[k] || 0) + lv[k];
      }
      st.cd = Math.max(0.05, st.cd);
      if (st.hitDelay) st.hitDelay = Math.max(0.15, st.hitDelay);
      w.st = st;
    }
    addPassive(id) {
      const def = D.passives[id];
      const p = { id, def, level: 1 };
      this.passives.push(p);
      this.recalcStats();
      PS.save.markSeen('passives', id);
      return p;
    }
    getWeapon(id) { return this.weapons.find((w) => w.id === id); }
    getPassive(id) { return this.passives.find((p) => p.id === id); }
    hasPassive(id) { return this.passives.some((p) => p.id === id); }

    wDmg(w) { return w.st.dmg * this.P.st.might; }
    wArea(w) { return w.st.area * this.P.st.area; }
    wSpeed(w) { return w.st.speed * this.P.st.speed; }
    wDur(w) { return w.st.dur * this.P.st.duration; }
    wAmount(w) { return w.st.amount + this.P.st.amount; }
    wCd(w) { return Math.max(0.05, w.st.cd * this.P.st.cooldown); }

    findEvolvable() {
      for (const w of this.weapons) {
        if (w.def.evolved || !w.def.evo) continue;
        if (w.level >= w.def.maxLevel && this.hasPassive(w.def.evo.with)) return w;
      }
      return null;
    }
    evolve(w) {
      const nd = D.weapons[w.def.evo.into];
      w.id = nd.id;
      w.def = nd;
      w.queue.length = 0;
      w.cd = 0.3;
      this.recalcWeapon(w);
      for (const p of this.projs) if (p.w === w && p.persistent) p.dead = true;
      this.run.evolutions++;
      PS.save.markSeen('weapons', nd.id);
      PS.audio.sfx('evolve');
    }

    // ================= 升级选项 =================
    rollOptions() {
      let pool = [];
      const ownedBase = new Set(this.weapons.map((w) => w.baseId));
      for (const w of this.weapons) if (!w.def.evolved && w.level < w.def.maxLevel) pool.push({ kind: 'wup', id: w.id, wt: 120 });
      for (const p of this.passives) if (p.level < p.def.max) pool.push({ kind: 'pup', id: p.id, wt: 100 });
      if (this.weapons.length < 6) for (const id of D.baseWeapons) if (!ownedBase.has(id)) pool.push({ kind: 'wnew', id, wt: 90 });
      if (this.passives.length < 6) for (const id in D.passives) if (!this.hasPassive(id)) pool.push({ kind: 'pnew', id, wt: 75 });
      pool = pool.filter((o) => !this.banished.has(o.id));
      let n = 3;
      if (Math.random() < Math.min(0.9, (this.P.st.luck - 1) * 1.5)) n = 4;
      const out = [];
      while (out.length < n && pool.length) {
        const o = U.weighted(pool, (x) => x.wt);
        out.push(o);
        pool.splice(pool.indexOf(o), 1);
      }
      if (!out.length) out.push({ kind: 'gold', v: 25 }, { kind: 'chicken', v: 30 });
      return out;
    }

    optionInfo(o) {
      if (o.kind === 'wup' || o.kind === 'wnew') {
        const def = D.weapons[o.id];
        const w = this.getWeapon(o.id);
        const lv = w ? w.level : 0;
        const desc = w ? D.levelText(def.levels[lv - 1]) : def.desc;
        const evo = def.evo ? D.passives[def.evo.with].name + ' → ' + D.weapons[def.evo.into].name : '';
        return { icon: def.icon, name: def.name, tag: w ? 'Lv.' + (lv + 1) : '新！', desc, kind: '武器', evo, isNew: !w };
      }
      if (o.kind === 'pup' || o.kind === 'pnew') {
        const def = D.passives[o.id];
        const p = this.getPassive(o.id);
        return { icon: def.icon, name: def.name, tag: p ? 'Lv.' + (p.level + 1) : '新！', desc: def.desc, kind: '道具', isNew: !p };
      }
      if (o.kind === 'gold') return { icon: 'bag', name: '金币袋', tag: '', desc: '获得 ' + o.v + ' 金币。', kind: '奖励' };
      return { icon: 'chicken', name: '烤鸡', tag: '', desc: '回复 ' + o.v + ' 点生命。', kind: '奖励' };
    }

    applyOption(o) {
      switch (o.kind) {
        case 'wup': {
          const w = this.getWeapon(o.id);
          if (w) { w.level++; this.recalcWeapon(w); }
          break;
        }
        case 'wnew': this.addWeapon(o.id); break;
        case 'pup': {
          const p = this.getPassive(o.id);
          if (p) { p.level++; this.recalcStats(); }
          break;
        }
        case 'pnew': this.addPassive(o.id); break;
        case 'gold': this.gold += o.v * this.P.st.greed; break;
        case 'chicken': this.heal(o.v); break;
      }
    }

    finishLevelUp() {
      this.pendingLevels = Math.max(0, this.pendingLevels - 1);
      if (this.pendingLevels === 0) this.P.iframes = Math.max(this.P.iframes, 0.6);
    }

    // ================= 宝箱 =================
    openChest(tier) {
      const L = this.P.st.luck;
      let n = tier === 2 ? 3 : 1;
      if (tier === 1 && Math.random() < 0.12 * L) n = 3;
      if (tier === 2 && Math.random() < 0.25 * L) n = 5;
      const items = [];
      for (let i = 0; i < n; i++) {
        const ev = this.findEvolvable();
        if (ev) {
          const from = ev.def;
          this.evolve(ev);
          items.push({ icon: ev.def.icon, name: ev.def.name, tag: '进化！', desc: from.name + ' 进化为 ' + ev.def.name, evo: true });
          continue;
        }
        const cands = [];
        for (const w of this.weapons) if (!w.def.evolved && w.level < w.def.maxLevel) cands.push({ w });
        for (const p of this.passives) if (p.level < p.def.max) cands.push({ p });
        if (cands.length) {
          const c = U.pick(cands);
          if (c.w) {
            c.w.level++;
            this.recalcWeapon(c.w);
            items.push({ icon: c.w.def.icon, name: c.w.def.name, tag: 'Lv.' + c.w.level, desc: D.levelText(c.w.def.levels[c.w.level - 2]) });
          } else {
            c.p.level++;
            this.recalcStats();
            items.push({ icon: c.p.def.icon, name: c.p.def.name, tag: 'Lv.' + c.p.level, desc: c.p.def.desc });
          }
        } else {
          const g = 30;
          this.gold += g * this.P.st.greed;
          items.push({ icon: 'bag', name: '金币袋', tag: '', desc: '+' + g + ' 金币' });
        }
      }
      const gold = Math.round((tier === 2 ? U.randi(100, 160) : U.randi(20, 40)) * this.P.st.greed * this.st.goldMul);
      this.gold += gold;
      this.run.chests++;
      PS.audio.sfx('chest');
      return { items, gold, tier };
    }

    // ================= 生成 =================
    spawnPos(margin) {
      const cam = this.cam;
      const hw = cam.w / 2 + margin, hh = cam.h / 2 + margin;
      const cx = cam.x + cam.w / 2, cy = cam.y + cam.h / 2;
      const per = 4 * hw + 4 * hh;
      for (let k = 0; k < 16; k++) {
        let t = Math.random() * per, x, y;
        if (t < 2 * hw) { x = cx - hw + t; y = cy - hh; }
        else if ((t -= 2 * hw) < 2 * hh) { x = cx + hw; y = cy - hh + t; }
        else if ((t -= 2 * hh) < 2 * hw) { x = cx + hw - t; y = cy + hh; }
        else { t -= 2 * hw; x = cx - hw; y = cy + hh - t; }
        if (x < 24 || y < 24 || x > this.mapW - 24 || y > this.mapH - 24) continue;
        if (this.blocked(x, y, 8)) continue;
        return { x, y };
      }
      for (let k = 0; k < 30; k++) {
        const x = U.rand(40, this.mapW - 40), y = U.rand(40, this.mapH - 40);
        if (U.dist2(x, y, this.P.x, this.P.y) > hw * hw * 0.8 && !this.blocked(x, y, 8)) return { x, y };
      }
      return { x: U.clamp(this.P.x + hw, 40, this.mapW - 40), y: U.clamp(this.P.y, 40, this.mapH - 40) };
    }

    // 敌人生命倍率：前期线性，后期加速（让后期依然紧张）
    timeHpMul() {
      const m = this.time / 60;
      return 1 + HP_PER_MIN * m + 0.012 * m * m + 0.0004 * m * m * m;
    }

    spawnEnemy(type, x, y, opts) {
      opts = opts || {};
      if (this.enemies.length >= MAX_ENEMIES + (opts.force ? 60 : 0)) return null;
      const d = D.enemies[type];
      if (!d) return null;
      const m = Math.floor(this.time / 60);
      const elite = !!opts.elite;
      const hp = d.hp * this.st.hpMul * this.timeHpMul() * (elite ? ELITE_HP : 1);
      const e = {
        uid: this.uid++, type, def: d, spr: d.spr, x, y, kbx: 0, kby: 0, hp, maxHp: hp,
        spd: d.spd * (elite ? 1.1 : 1), dmg: d.dmg * this.st.dmgMul * (1 + 0.04 * m) * (elite ? 1.5 : 1),
        r: d.r * (elite ? 1.6 : 1), kbRes: elite ? 0.9 : d.kb, xp: d.xp * (elite ? 12 : 1), elite, boss: false,
        flash: 0, slowT: 0, frozenT: 0, hitT: {}, anim: Math.random() * 10, face: 1,
        ranged: d.ranged || null, shootT: d.ranged ? U.rand(1, d.ranged.cd) : 0, fly: !!d.fly, color: PS.SPR[d.spr].color,
        scale: elite ? 2 : 1, dead: false, swarm: !!opts.swarm, vx: opts.vx || 0, vy: opts.vy || 0, life: opts.life || 0,
      };
      this.enemies.push(e);
      return e;
    }

    spawnBoss(id, ev) {
      const b = D.bosses[id];
      const pos = this.spawnPos(10);
      const mul = (ev.mul || 1) * this.st.hpMul * (1 + 0.04 * Math.min(this.level, 60));
      const hp = b.hp * mul;
      const e = {
        uid: this.uid++, type: id, def: b, spr: b.spr, boss: true, final: !!ev.final, x: pos.x, y: pos.y, hp, maxHp: hp,
        spd: b.spd, dmg: b.dmg * this.st.dmgMul, r: b.r, kbRes: 1, xp: b.xp, flash: 0, slowT: 0, frozenT: 0, hitT: {},
        anim: 0, kbx: 0, kby: 0, face: 1, scale: 1, z: 0, alpha: 1, act: null, color: PS.SPR[b.spr].color, dead: false,
        attacks: b.attacks.map((a) => Object.assign({}, a, { timer: a.cd * U.rand(0.4, 0.9) })),
      };
      this.enemies.push(e);
      this.bosses.push(e);
      PS.save.markSeen('enemies', id);
      PS.audio.sfx('boss');
      PS.audio.music('boss');
      this.shake = Math.max(this.shake, 5);
      this.emit('boss', e);
      return e;
    }

    updateSpawns(dt) {
      const m = Math.min(Math.floor(this.time / 60), this.st.waves.length - 1);
      const wave = this.st.waves[m];
      const types = Object.keys(wave.p);
      const pickType = () => U.weighted(types, (t) => wave.p[t]);
      this.spawnT -= dt;
      if (this.spawnT <= 0) {
        this.spawnT = wave.iv;
        for (let i = 0; i < wave.n; i++) {
          const p = this.spawnPos(24);
          this.spawnEnemy(pickType(), p.x, p.y);
        }
      }
      let alive = 0;
      for (const e of this.enemies) if (!e.boss && !e.swarm) alive++;
      let deficit = Math.min(wave.min - alive, 6);
      while (deficit-- > 0) {
        const p = this.spawnPos(24);
        if (!this.spawnEnemy(pickType(), p.x, p.y)) break;
      }
      while (this.evIdx < this.events.length && this.time >= this.events[this.evIdx].t) {
        this.runEvent(this.events[this.evIdx]);
        this.evIdx++;
      }
    }

    runEvent(ev) {
      const P = this.P;
      switch (ev.type) {
        case 'swarm': {
          const a = Math.random() * Math.PI * 2;
          const dx = Math.cos(a), dy = Math.sin(a);
          const diag = Math.hypot(this.cam.w, this.cam.h) / 2 + 30;
          const spd = D.enemies[ev.e].spd * 1.5;
          for (let i = 0; i < ev.n; i++) {
            const off = U.rand(-this.cam.h / 2, this.cam.h / 2), back = U.rand(0, 120);
            const x = P.x - dx * (diag + back) - dy * off, y = P.y - dy * (diag + back) + dx * off;
            this.spawnEnemy(ev.e, x, y, { swarm: true, vx: dx * spd, vy: dy * spd, life: (diag * 2 + back + 60) / spd, force: true });
          }
          this.emit('toast', { text: '群体来袭！', cls: 'warn' });
          break;
        }
        case 'ring': {
          const R = Math.max(this.cam.w, this.cam.h) * 0.55;
          for (let i = 0; i < ev.n; i++) {
            const a = (i / ev.n) * Math.PI * 2;
            const x = U.clamp(P.x + Math.cos(a) * R, 24, this.mapW - 24), y = U.clamp(P.y + Math.sin(a) * R, 24, this.mapH - 24);
            this.spawnEnemy(ev.e, x, y, { force: true });
          }
          this.emit('toast', { text: '你被包围了！', cls: 'warn' });
          break;
        }
        case 'elite': {
          const p = this.spawnPos(20);
          this.spawnEnemy(ev.e, p.x, p.y, { elite: true, force: true });
          this.emit('toast', { text: '精英「' + D.enemies[ev.e].name + '」出现！', cls: 'elite' });
          break;
        }
        case 'boss':
          this.spawnBoss(ev.id, ev);
          break;
      }
    }

    // 相机跟随玩家并限制在地图内（视野尺寸由渲染器写入 cam.w/h）
    updateCam() {
      const c = this.cam, P = this.P;
      let x = Math.round(P.x - c.w / 2), y = Math.round(P.y - c.h / 2);
      x = this.mapW > c.w ? U.clamp(x, 0, this.mapW - c.w) : Math.round((this.mapW - c.w) / 2);
      y = this.mapH > c.h ? U.clamp(y, 0, this.mapH - c.h) : Math.round((this.mapH - c.h) / 2);
      c.x = x;
      c.y = y;
      this.farDist = Math.hypot(c.w, c.h) * 0.5 + 160;
    }

    relocate(e) {
      const p = this.spawnPos(24);
      e.x = p.x;
      e.y = p.y;
      e.kbx = e.kby = 0;
    }

    // ================= 主更新 =================
    update(dt, move) {
      if (this.ending) {
        this.endT -= dt;
        this.hurtFlash = Math.max(0, this.hurtFlash - dt);
        this.whiteFlash = Math.max(0, this.whiteFlash - dt);
        this.lvlFlash = Math.max(0, this.lvlFlash - dt);
        this.shake = Math.max(0, this.shake - dt * 18);
        this.updateFx(dt);
        if (this.endT <= 0 && !this.endEmitted) {
          this.endEmitted = true;
          this.emit('over', { victory: this.victory });
        }
        return;
      }
      this.time += dt;
      if (this.freezeT > 0) this.freezeT -= dt;
      this.updatePlayer(dt, move);
      this.updateCam();
      this.updateSpawns(dt);
      this.updateEnemies(dt);
      this.rebuildGrid();
      this.resolveEnemies();
      this.contactDamage();
      PS.weapons.update(this, dt);
      this.updateEBullets(dt);
      this.updateHazards(dt);
      this.updatePickups(dt);
      this.updateBraziers(dt);
      this.updateFx(dt);
      this.cleanup();
      this.unlockT -= dt;
      if (this.unlockT <= 0) {
        this.unlockT = 1;
        const nu = PS.save.checkUnlocks(this);
        for (const u of nu) {
          this.unlocks.push(u);
          this.emit('unlock', u);
        }
      }
    }

    updatePlayer(dt, mv) {
      const P = this.P;
      const spd = PLAYER_SPEED * P.st.move;
      P.moving = mv.x !== 0 || mv.y !== 0;
      if (P.moving) {
        P.x += mv.x * spd * dt;
        P.y += mv.y * spd * dt;
        const l = Math.hypot(mv.x, mv.y);
        P.dirX = mv.x / l;
        P.dirY = mv.y / l;
        if (Math.abs(mv.x) > 0.15) P.facing = mv.x > 0 ? 1 : -1;
        P.anim += dt;
      }
      this.pushOutObstacles(P, P.r);
      P.x = U.clamp(P.x, 22, this.mapW - 22);
      P.y = U.clamp(P.y, 22, this.mapH - 22);
      if (P.st.recovery > 0 && P.hp < P.maxHp) P.hp = Math.min(P.maxHp, P.hp + P.st.recovery * dt);
      if (P.iframes > 0) P.iframes -= dt;
      if (this.hurtFlash > 0) this.hurtFlash -= dt;
      if (this.whiteFlash > 0) this.whiteFlash -= dt;
      if (this.lvlFlash > 0) this.lvlFlash -= dt;
      if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 18);
    }

    updateEnemies(dt) {
      const P = this.P;
      const frozenAll = this.freezeT > 0;
      for (const e of this.enemies) {
        if (e.dead) continue;
        e.anim += dt;
        if (e.flash > 0) e.flash -= dt;
        if (e.boss) {
          this.updateBoss(e, dt, frozenAll);
          continue;
        }
        if (e.swarm) {
          if (!frozenAll) {
            e.x += e.vx * dt;
            e.y += e.vy * dt;
            e.life -= dt;
          }
          e.face = e.vx < 0 ? -1 : 1;
          if (e.life <= 0) { e.dead = true; e.silent = true; }
          continue;
        }
        if (e.kbx !== 0 || e.kby !== 0) {
          e.x += e.kbx * dt;
          e.y += e.kby * dt;
          const f = Math.exp(-12 * dt);
          e.kbx *= f;
          e.kby *= f;
          if (Math.abs(e.kbx) + Math.abs(e.kby) < 2) e.kbx = e.kby = 0;
        }
        if (frozenAll) continue;
        if (e.frozenT > 0) { e.frozenT -= dt; continue; }
        let spd = e.spd;
        if (e.slowT > 0) { e.slowT -= dt; spd *= 0.5; }
        const dx = P.x - e.x, dy = P.y - e.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        e.face = dx < 0 ? -1 : 1;
        if (e.ranged) {
          const R = e.ranged;
          let mv = 1;
          if (d < R.range * 0.7) mv = -0.6;
          else if (d < R.range) mv = 0.15;
          e.x += (dx / d) * spd * mv * dt;
          e.y += (dy / d) * spd * mv * dt;
          e.shootT -= dt;
          if (e.shootT <= 0 && d < R.range * 1.4) {
            e.shootT = R.cd * U.rand(0.8, 1.2);
            this.enemyShoot(e.x, e.y, dx / d, dy / d, R.spd, R.dmg * this.st.dmgMul, R.spr);
          }
        } else {
          let nx = dx / d, ny = dy / d;
          if (e.def.anim === 'flap') {
            const w = Math.sin(e.anim * 5 + e.uid) * 0.5;
            nx -= ny * w;
            ny += (dx / d) * w;
          }
          e.x += nx * spd * dt;
          e.y += ny * spd * dt;
        }
        if (d > this.farDist) this.relocate(e);
      }
    }

    rebuildGrid() {
      const g = this.grid;
      g.clear();
      for (const e of this.enemies) if (!e.dead) g.insert(e);
      const c = this.cam;
      for (const b of this.braziers) {
        if (!b.dead && b.x > c.x - 80 && b.x < c.x + c.w + 80 && b.y > c.y - 80 && b.y < c.y + c.h + 80) g.insert(b);
      }
    }

    resolveEnemies() {
      const g = this.grid;
      for (const e of this.enemies) {
        if (e.dead || e.swarm) continue;
        const list = g.query(e.x, e.y, e.r + 10);
        for (let i = 0; i < list.length; i++) {
          const o = list[i];
          if (o.uid <= e.uid || o.dead || o.prop || o.swarm) continue;
          const dx = o.x - e.x, dy = o.y - e.y;
          const rr = (e.r + o.r) * 0.8;
          const d2 = dx * dx + dy * dy;
          if (d2 >= rr * rr) continue;
          if (d2 < 0.0001) {
            o.x += U.rand(-1, 1);
            o.y += U.rand(-1, 1);
            continue;
          }
          const d = Math.sqrt(d2), push = rr - d, nx = dx / d, ny = dy / d;
          let we = 0.5, wo = 0.5;
          if (e.boss) { we = 0; wo = 1; } else if (o.boss) { we = 1; wo = 0; }
          e.x -= nx * push * we;
          e.y -= ny * push * we;
          o.x += nx * push * wo;
          o.y += ny * push * wo;
        }
        if (!e.fly && !e.boss) this.pushOutObstacles(e, e.r * 0.8);
        e.x = U.clamp(e.x, 10, this.mapW - 10);
        e.y = U.clamp(e.y, 10, this.mapH - 10);
      }
    }

    contactDamage() {
      const P = this.P;
      if (P.iframes > 0) return;
      const list = this.grid.query(P.x, P.y, P.r + 24);
      for (const e of list) {
        if (e.dead || e.prop || e.intangible || (e.z && e.z > 8) || e.frozenT > 0) continue;
        if (this.freezeT > 0) continue;
        const rr = e.r + P.r - 1;
        if (U.dist2(e.x, e.y, P.x, P.y) < rr * rr) {
          this.hurtPlayer(e.dmg, e.boss ? 'boss' : e.elite ? 'elite' : e.type);
          break;
        }
      }
    }

    // ================= Boss AI =================
    updateBoss(e, dt, frozen) {
      if (frozen) return;
      const P = this.P;
      const dx = P.x - e.x, dy = P.y - e.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      if (Math.abs(dx) > 2) e.face = dx < 0 ? -1 : 1;
      if (e.act) {
        this.bossAct(e, dt, dx, dy, d);
        return;
      }
      let spd = e.spd;
      if (e.slowT > 0) { e.slowT -= dt; spd *= 0.6; }
      e.x += (dx / d) * spd * dt;
      e.y += (dy / d) * spd * dt;
      if (d > this.farDist * 1.3) {
        const p = this.spawnPos(10);
        e.x = p.x;
        e.y = p.y;
      }
      for (const a of e.attacks) a.timer -= dt;
      for (const a of e.attacks) {
        if (a.timer <= 0) {
          a.timer = a.cd * U.rand(0.85, 1.2);
          this.bossAttack(e, a, dx / d, dy / d);
          break;
        }
      }
    }

    bossAttack(e, a, nx, ny) {
      const P = this.P;
      const dmgMul = this.st.dmgMul;
      switch (a.t) {
        case 'radial': {
          const off = Math.random() * Math.PI;
          for (let i = 0; i < a.n; i++) {
            const ang = off + (i / a.n) * Math.PI * 2;
            this.enemyShoot(e.x, e.y, Math.cos(ang), Math.sin(ang), a.spd, a.dmg * dmgMul, a.spr);
          }
          break;
        }
        case 'aimed': {
          const base = Math.atan2(ny, nx);
          for (let i = 0; i < a.n; i++) {
            const ang = base + (a.n > 1 ? (i / (a.n - 1) - 0.5) * a.spread : 0);
            this.enemyShoot(e.x, e.y, Math.cos(ang), Math.sin(ang), a.spd, a.dmg * dmgMul, a.spr);
          }
          break;
        }
        case 'summon': {
          for (let i = 0; i < a.n; i++) {
            const ang = (i / a.n) * Math.PI * 2;
            const x = U.clamp(e.x + Math.cos(ang) * 34, 20, this.mapW - 20), y = U.clamp(e.y + Math.sin(ang) * 34, 20, this.mapH - 20);
            this.spawnEnemy(a.e, x, y, { force: true });
          }
          this.addFx({ kind: 'ring', x: e.x, y: e.y, r0: 8, r1: 44, life: 0.4, color: '#9b4dbb' });
          break;
        }
        case 'hazard': {
          for (let i = 0; i < a.n; i++) {
            const x = U.clamp(P.x + (i === 0 ? 0 : U.rand(-70, 70)) + P.dirX * (i === 0 ? 20 : 0), 20, this.mapW - 20);
            const y = U.clamp(P.y + (i === 0 ? 0 : U.rand(-55, 55)) + P.dirY * (i === 0 ? 20 : 0), 20, this.mapH - 20);
            this.hazards.push({ x, y, r: a.r, delay: 1.0, t: -i * 0.08, dmg: a.dmg * dmgMul, hit: false, color: e.type === 'treant' ? 'root' : 'fire' });
          }
          break;
        }
        case 'dash': e.act = { type: 'dash', t: 0, nx, ny }; break;
        case 'jump': e.act = { type: 'jump', t: 0, sx: e.x, sy: e.y, tx: P.x, ty: P.y }; break;
        case 'teleport': e.act = { type: 'tp', t: 0, moved: false }; break;
        case 'spiral': e.act = { type: 'spiral', t: 0, ang: Math.random() * 6.28, emitT: 0, a }; break;
      }
    }

    bossAct(e, dt, dx, dy, d) {
      const a = e.act;
      const P = this.P;
      a.t += dt;
      switch (a.type) {
        case 'dash':
          if (a.t < 0.6) {
            e.flash = Math.floor(a.t * 12) % 2 ? 0.05 : 0;
            a.nx = dx / d;
            a.ny = dy / d;
          } else if (a.t < 1.25) {
            const sp = e.spd * 5;
            e.x = U.clamp(e.x + a.nx * sp * dt, 20, this.mapW - 20);
            e.y = U.clamp(e.y + a.ny * sp * dt, 20, this.mapH - 20);
            if (Math.random() < 0.6) this.addPart(e.x + U.rand(-8, 8), e.y + e.r, U.rand(-20, 20), U.rand(-30, -5), 0.4, '#8595a1', 2);
          } else e.act = null;
          break;
        case 'jump': {
          const T = 0.95;
          const k = Math.min(1, a.t / T);
          e.x = U.lerp(a.sx, a.tx, k);
          e.y = U.lerp(a.sy, a.ty, k);
          e.z = Math.sin(k * Math.PI) * 42;
          if (a.t >= T) {
            e.z = 0;
            e.act = null;
            this.shake = Math.max(this.shake, 6);
            PS.audio.sfx('explode');
            this.addFx({ kind: 'ring', x: e.x, y: e.y, r0: 6, r1: 50, life: 0.35, color: '#6daa2c' });
            for (let i = 0; i < 10; i++) {
              const ang = (i / 10) * Math.PI * 2;
              this.enemyShoot(e.x, e.y, Math.cos(ang), Math.sin(ang), 75, 12 * this.st.dmgMul, 'eb_green');
            }
            if (U.dist2(e.x, e.y, P.x, P.y) < 40 * 40) this.hurtPlayer(e.dmg, 'boss');
          }
          break;
        }
        case 'tp':
          if (a.t < 0.45) {
            e.alpha = 1 - a.t / 0.45;
            e.intangible = a.t > 0.25;
          } else if (!a.moved) {
            a.moved = true;
            const ang = Math.random() * Math.PI * 2;
            e.x = U.clamp(P.x + Math.cos(ang) * 95, 30, this.mapW - 30);
            e.y = U.clamp(P.y + Math.sin(ang) * 80, 30, this.mapH - 30);
          } else if (a.t < 0.9) {
            e.alpha = (a.t - 0.45) / 0.45;
          } else {
            e.alpha = 1;
            e.intangible = false;
            e.act = null;
            const base = Math.atan2(P.y - e.y, P.x - e.x);
            for (let i = 0; i < 5; i++) {
              const ang = base + (i / 4 - 0.5) * 0.6;
              this.enemyShoot(e.x, e.y, Math.cos(ang), Math.sin(ang), 105, 14 * this.st.dmgMul, 'eb_purple');
            }
          }
          break;
        case 'spiral': {
          e.x += (dx / d) * e.spd * 0.3 * dt;
          e.y += (dy / d) * e.spd * 0.3 * dt;
          a.emitT -= dt;
          if (a.emitT <= 0) {
            a.emitT = 0.11;
            const at = a.a;
            for (let k = 0; k < at.arms; k++) {
              const ang = a.ang + (k / at.arms) * Math.PI * 2;
              this.enemyShoot(e.x, e.y, Math.cos(ang), Math.sin(ang), at.spd, at.dmg * this.st.dmgMul, at.spr);
            }
          }
          a.ang += 2.0 * dt;
          if (a.t > a.a.dur) e.act = null;
          break;
        }
      }
    }

    enemyShoot(x, y, nx, ny, spd, dmg, spr) {
      if (this.ebullets.length > 400) return;
      this.ebullets.push({ x, y, vx: nx * spd, vy: ny * spd, r: 3, dmg, life: 6, spr: spr || 'eb_purple' });
      PS.audio.sfx('ebullet');
    }

    updateEBullets(dt) {
      const P = this.P;
      const frozen = this.freezeT > 0;
      for (let i = this.ebullets.length - 1; i >= 0; i--) {
        const b = this.ebullets[i];
        if (!frozen) {
          b.x += b.vx * dt;
          b.y += b.vy * dt;
          b.life -= dt;
        }
        if (b.life <= 0 || b.x < -20 || b.y < -20 || b.x > this.mapW + 20 || b.y > this.mapH + 20) {
          U.removeAt(this.ebullets, i);
          continue;
        }
        const rr = b.r + P.r;
        if (U.dist2(b.x, b.y, P.x, P.y) < rr * rr && P.iframes <= 0) {
          this.hurtPlayer(b.dmg, 'bullet');
          // 受伤可能触发复活冲击波并清空子弹数组
          if (i < this.ebullets.length && this.ebullets[i] === b) U.removeAt(this.ebullets, i);
          else break;
        }
      }
    }

    updateHazards(dt) {
      const P = this.P;
      for (let i = this.hazards.length - 1; i >= 0; i--) {
        const h = this.hazards[i];
        h.t += dt;
        if (!h.hit && h.t >= h.delay) {
          h.hit = true;
          if (U.dist2(h.x, h.y, P.x, P.y) < (h.r + P.r) * (h.r + P.r)) this.hurtPlayer(h.dmg, 'hazard');
          this.addFx({ kind: 'ring', x: h.x, y: h.y, r0: 2, r1: h.r + 4, life: 0.3, color: h.color === 'root' ? '#854c30' : '#ff9f43' });
          for (let k = 0; k < 8; k++) this.addPart(h.x, h.y, U.rand(-60, 60), U.rand(-90, -20), 0.5, h.color === 'root' ? '#6daa2c' : '#ff9f43', 2, 200);
          PS.audio.sfx('explode');
        }
        if (h.t > h.delay + 0.3) U.removeAt(this.hazards, i);
      }
    }

    // ================= 伤害 =================
    canHit(p, e) {
      if (p.once) {
        if (p.hitSet.has(e.uid)) return false;
        p.hitSet.add(e.uid);
        return true;
      }
      const t = e.hitT[p.uid];
      if (t !== undefined && t > this.time) return false;
      e.hitT[p.uid] = this.time + p.hitDelay;
      return true;
    }

    forEnemiesInCircle(x, y, r, fn) {
      const g = this.grid;
      const list = g.query(x, y, r + 20);
      g.depth++;
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (e.dead || e.intangible) continue;
        const rr = r + e.r;
        const dx = e.x - x, dy = e.y - y;
        if (dx * dx + dy * dy <= rr * rr) {
          if (fn(e) === false) break;
        }
      }
      g.depth--;
    }

    damageEnemy(e, base, w, nx, ny, kb) {
      if (e.dead) return 0;
      if (e.prop) {
        this.breakProp(e);
        return 0;
      }
      let dmg = base, crit = false;
      if (w && w.st.crit && Math.random() < w.st.crit * this.P.st.luck) {
        dmg *= w.st.critMul || 2;
        crit = true;
      }
      dmg = Math.max(1, Math.round(dmg));
      e.hp -= dmg;
      e.flash = 0.1;
      if (w) w.dmg += dmg;
      if (kb && !e.boss) {
        const k = kb * (1 - e.kbRes) * 110;
        e.kbx = U.clamp(e.kbx + nx * k, -260, 260);
        e.kby = U.clamp(e.kby + ny * k, -260, 260);
      }
      if (this.settings.dmgNums) this.addNum(e.x, e.y - e.r - 3, dmg, crit ? 'y' : 'w');
      PS.audio.sfx('hit');
      if (w) {
        if (w.st.healHit) this.heal(w.st.healHit, true);
        if (crit && w.st.healCrit) this.heal(w.st.healCrit, true);
      }
      if (e.hp <= 0) this.killEnemy(e, w);
      return dmg;
    }

    killEnemy(e, w) {
      if (e.dead) return;
      e.dead = true;
      if (w) w.kills++;
      if (e.boss) {
        this.onBossDeath(e);
        return;
      }
      this.kills++;
      PS.save.markSeen('enemies', e.type);
      this.burst(e.x, e.y, e.color, e.elite ? 26 : 5);
      this.dropGem(e.x, e.y, e.xp * this.st.xpMul);
      this.rollEnemyDrop(e.x, e.y);
      if (e.elite) {
        this.addPickup('chest', e.x, e.y, 1);
        this.shake = Math.max(this.shake, 3);
        PS.audio.sfx('explode');
      }
      if (e.def.split) {
        for (let i = 0; i < e.def.splitN; i++) this.spawnEnemy(e.def.split, e.x + U.rand(-6, 6), e.y + U.rand(-6, 6), { force: true });
      }
    }

    onBossDeath(e) {
      this.kills++;
      this.run.bossKills++;
      this.bosses = this.bosses.filter((b) => b !== e);
      this.shake = Math.max(this.shake, 9);
      this.whiteFlash = 0.25;
      PS.audio.sfx('explode');
      for (let i = 0; i < 4; i++) this.burst(e.x + U.rand(-12, 12), e.y + U.rand(-12, 12), i % 2 ? '#ffe08a' : e.color, 18);
      this.addFx({ kind: 'ring', x: e.x, y: e.y, r0: 6, r1: 80, life: 0.6, color: '#ffe08a' });
      this.addPickup('chest', e.x, e.y, 2);
      for (let i = 0; i < 3; i++) this.addPickup('bag', e.x + U.rand(-24, 24), e.y + U.rand(-24, 24), 15);
      this.dropGem(e.x + 10, e.y, e.xp);
      this.emit('bossdead', e);
      if (e.final) {
        this.victory = true;
        for (const o of this.enemies) {
          if (!o.dead) {
            o.dead = true;
            this.burst(o.x, o.y, o.color, 3);
          }
        }
        this.ebullets.length = 0;
        this.hazards.length = 0;
        this.startEnding(3.0);
        PS.audio.sfx('victory');
      } else if (this.bosses.length === 0) {
        PS.audio.music(this.st.music);
      }
    }

    startEnding(t) {
      this.ending = true;
      this.endT = t;
      this.gold += Math.floor(this.time / 60) * 10 * this.st.goldMul;
    }

    hurtPlayer(raw, src) {
      const P = this.P;
      if (P.iframes > 0 || this.ending) return;
      const dmg = Math.max(1, Math.round(raw - P.st.armor));
      P.hp -= dmg;
      if (PS.debug.log) {
        const k = Math.floor(this.time / 60) + ':' + (src || '?');
        PS.debug.log[k] = (PS.debug.log[k] || 0) + dmg;
      }
      P.iframes = IFRAMES;
      this.hurtFlash = 0.2;
      if (this.settings.shake) this.shake = Math.max(this.shake, 3);
      PS.audio.sfx('hurt');
      PS.audio.rumble(0.5, 120);
      if (this.settings.dmgNums) this.addNum(P.x, P.y - 12, dmg, 'r');
      if (P.hp <= 0) this.onPlayerDeath();
    }

    onPlayerDeath() {
      const P = this.P;
      if (P.revivals > 0) {
        P.revivals--;
        P.hp = P.maxHp * 0.5;
        P.iframes = 2.5;
        this.whiteFlash = 0.4;
        this.repel(140, true);
        this.emit('toast', { text: '复活！', cls: 'good' });
        PS.audio.sfx('heal');
        return;
      }
      P.hp = 0;
      this.dead = true;
      this.burst(P.x, P.y, '#d04648', 30);
      PS.audio.sfx('death');
      PS.audio.rumble(1, 400);
      this.startEnding(1.8);
    }

    // 以玩家为中心击退/清除
    repel(R, damage) {
      const P = this.P;
      for (const e of this.enemies) {
        if (e.dead || e.boss) continue;
        const dx = e.x - P.x, dy = e.y - P.y, d = Math.hypot(dx, dy) || 1;
        if (d < R) {
          if (damage && !e.elite) this.killEnemy(e, null);
          else { e.kbx = (dx / d) * 250; e.kby = (dy / d) * 250; }
        }
      }
      this.ebullets.length = 0;
      this.addFx({ kind: 'ring', x: P.x, y: P.y, r0: 6, r1: R, life: 0.5, color: '#ffffff' });
    }

    heal(v, silent) {
      const P = this.P;
      if (P.hp >= P.maxHp) return;
      P.hp = Math.min(P.maxHp, P.hp + v);
      if (!silent) {
        if (this.settings.dmgNums) this.addNum(P.x, P.y - 14, v, 'g');
        PS.audio.sfx('heal');
      }
    }

    addXp(v) {
      this.xp += v * this.P.st.growth;
      let n = 0;
      while (this.xp >= this.xpNext && n < 50) {
        this.xp -= this.xpNext;
        this.level++;
        this.xpNext = D.xpReq(this.level);
        this.pendingLevels++;
        n++;
      }
      if (n) {
        this.lvlFlash = 0.3;
        PS.audio.sfx('levelup');
      }
    }

    // ================= 拾取物 =================
    addPickup(type, x, y, v) {
      const p = { type, x: U.clamp(x, 16, this.mapW - 16), y: U.clamp(y, 16, this.mapH - 16), v: v || 0, mag: false, vx: 0, vy: 0, t: 0, dead: false, big: false };
      this.pickups.push(p);
      return p;
    }

    dropGem(x, y, v) {
      if (this.gemCount >= MAX_GEMS) {
        if (this.bigGem && !this.bigGem.dead) {
          this.bigGem.v += v;
          return;
        }
        this.bigGem = this.addPickup('gem', x, y, v);
        this.bigGem.big = true;
        return;
      }
      this.gemCount++;
      this.addPickup('gem', x, y, v);
    }

    rollEnemyDrop(x, y) {
      const L = this.P.st.luck;
      const r = Math.random();
      if (r < 0.03 * L) this.addPickup('coin', x, y, 2);
      else if (r < 0.034 * L) this.addPickup('chicken', x, y, 30);
      else if (r < 0.0348 * L) this.addPickup('magnet', x, y);
      else if (r < 0.0354 * L) this.addPickup('rosary', x, y);
      else if (r < 0.036 * L) this.addPickup('clock', x, y);
    }

    breakProp(b) {
      if (b.dead) return;
      b.dead = true;
      b.respawnT = 25;
      this.burst(b.x, b.y - 4, '#ff9f43', 8);
      PS.audio.sfx('hit');
      const L = this.P.st.luck;
      const table = [
        ['coin', 30], ['bag', 12 * L], ['chicken', 22], ['magnet', 9 * L], ['rosary', 6 * L], ['clock', 6 * L], ['bigbag', 2 * L],
      ];
      const t = U.weighted(table, (x) => x[1])[0];
      if (t === 'coin') this.addPickup('coin', b.x, b.y, 2);
      else if (t === 'bag') this.addPickup('bag', b.x, b.y, 15);
      else if (t === 'bigbag') this.addPickup('bag', b.x, b.y, 50);
      else if (t === 'chicken') this.addPickup('chicken', b.x, b.y, 30);
      else this.addPickup(t, b.x, b.y);
    }

    updateBraziers(dt) {
      for (let i = this.braziers.length - 1; i >= 0; i--) {
        const b = this.braziers[i];
        b.anim += dt;
        if (b.dead) {
          b.respawnT -= dt;
          if (b.respawnT <= 0) {
            U.removeAt(this.braziers, i);
            this.placeBrazier(0);
          }
        }
      }
    }

    updatePickups(dt) {
      const P = this.P;
      const mr = P.magnetR, mr2 = mr * mr;
      for (let i = this.pickups.length - 1; i >= 0; i--) {
        const p = this.pickups[i];
        p.t += dt;
        const dx = P.x - p.x, dy = P.y - p.y;
        const d2 = dx * dx + dy * dy;
        if (p.type === 'chest') {
          if (d2 < 14 * 14) {
            // 一帧只开一个宝箱，其余留到下一帧（避免弹窗互相覆盖）
            this.collect(p, i);
            return;
          }
          continue;
        }
        if (!p.mag && d2 < mr2) {
          p.mag = true;
          const d = Math.sqrt(d2) || 1;
          p.vx = (-dx / d) * 70;
          p.vy = (-dy / d) * 70;
        }
        if (p.mag) {
          const d = Math.sqrt(d2) || 1;
          if (d < 9) {
            this.collect(p, i);
            continue;
          }
          p.vx += (dx / d) * 1000 * dt;
          p.vy += (dy / d) * 1000 * dt;
          const sp = Math.hypot(p.vx, p.vy), mx = 420;
          if (sp > mx) {
            p.vx *= mx / sp;
            p.vy *= mx / sp;
          }
          p.x += p.vx * dt;
          p.y += p.vy * dt;
        }
      }
    }

    collect(p, i) {
      p.dead = true;
      U.removeAt(this.pickups, i);
      const P = this.P;
      switch (p.type) {
        case 'gem':
          if (p.big) this.bigGem = null;
          else this.gemCount--;
          this.addXp(p.v);
          PS.audio.sfx('gem');
          break;
        case 'coin':
        case 'bag':
          this.gold += p.v * P.st.greed * this.st.goldMul;
          PS.audio.sfx('coin');
          break;
        case 'chicken':
          this.heal(p.v);
          break;
        case 'magnet':
          for (const q of this.pickups) {
            if (q.type === 'gem' && !q.mag) {
              q.mag = true;
              q.vx = q.vy = 0;
            }
          }
          PS.audio.sfx('pickup');
          break;
        case 'rosary': {
          this.whiteFlash = 0.5;
          const c = this.cam;
          for (const e of this.enemies) {
            if (e.dead || e.boss) continue;
            if (e.x > c.x - 10 && e.x < c.x + c.w + 10 && e.y > c.y - 10 && e.y < c.y + c.h + 10) {
              if (e.elite) this.damageEnemy(e, e.maxHp * 0.3, null, 0, 0, 0);
              else this.killEnemy(e, null);
            }
          }
          this.ebullets.length = 0;
          PS.audio.sfx('bomb');
          break;
        }
        case 'clock':
          this.freezeT = 8;
          PS.audio.sfx('freeze');
          break;
        case 'chest':
          this.emit('chest', this.openChest(p.v));
          break;
      }
    }

    // ================= 特效 =================
    addPart(x, y, vx, vy, life, color, size, grav) {
      if (this.parts.length > 700) return;
      this.parts.push({ x, y, vx, vy, life, max: life, c: color, s: size || 1, g: grav || 0 });
    }
    burst(x, y, color, n) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, s = U.rand(20, 90);
        this.addPart(x, y, Math.cos(a) * s, Math.sin(a) * s - 20, U.rand(0.25, 0.6), i % 3 === 0 ? '#ffffff' : color, Math.random() < 0.3 ? 2 : 1, 120);
      }
    }
    addNum(x, y, v, color) {
      if (this.nums.length > 90) return;
      this.nums.push({ x: x + U.rand(-3, 3), y, v: Math.round(v), t: 0, c: color });
    }
    addFx(f) {
      f.t = 0;
      this.fx.push(f);
    }

    updateFx(dt) {
      for (let i = this.parts.length - 1; i >= 0; i--) {
        const p = this.parts[i];
        p.life -= dt;
        if (p.life <= 0) {
          U.removeAt(this.parts, i);
          continue;
        }
        p.vy += p.g * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
      for (let i = this.nums.length - 1; i >= 0; i--) {
        const n = this.nums[i];
        n.t += dt;
        n.y -= 18 * dt;
        if (n.t > 0.65) U.removeAt(this.nums, i);
      }
      for (let i = this.fx.length - 1; i >= 0; i--) {
        const f = this.fx[i];
        f.t += dt;
        if (f.t >= f.life) U.removeAt(this.fx, i);
      }
    }

    cleanup() {
      let j = 0;
      const arr = this.enemies;
      for (let i = 0; i < arr.length; i++) if (!arr[i].dead) arr[j++] = arr[i];
      arr.length = j;
      j = 0;
      const ps = this.projs;
      for (let i = 0; i < ps.length; i++) if (!ps[i].dead) ps[j++] = ps[i];
      ps.length = j;
    }

    // ================= 自动测试机器人 =================
    // 用于自动化测试与平衡性模拟：对 16 个方向做 0.3 秒前瞻，
    // 综合预测的敌人距离、子弹、陷阱、宝石收益、边界与地图中心进行评分
    botMove() {
      const P = this.P;
      const spd = PLAYER_SPEED * P.st.move, T = 0.3;
      const hpk = P.hp / P.maxHp;
      const near = this.grid.query(P.x, P.y, 170).filter((e) => !e.dead && !e.prop);
      // 目标拾取物
      let tgt = null, td = 220 * 220;
      for (const p of this.pickups) {
        const d2 = U.dist2(p.x, p.y, P.x, P.y) * (p.type === 'chest' ? 0.15 : p.type === 'gem' ? 1 : 0.5);
        if (d2 < td) { td = d2; tgt = p; }
      }
      const prev = this.botDir || { x: 0, y: 0 };
      const frozen = this.freezeT > 0;
      let best = { x: 0, y: 0 }, bestS = -1e9;
      for (let i = 0; i <= 16; i++) {
        const dx = i < 16 ? Math.cos((i / 16) * Math.PI * 2) : 0, dy = i < 16 ? Math.sin((i / 16) * Math.PI * 2) : 0;
        let s = 0;
        for (const k of [0.5, 1]) {
          const px = P.x + dx * spd * T * k, py = P.y + dy * spd * T * k;
          if (px < 30 || py < 30 || px > this.mapW - 30 || py > this.mapH - 30) s -= 40;
          if (this.blocked(px, py, P.r + 1)) s -= 25;
          let nearest = 1e9;
          for (const e of near) {
            let ex = e.x, ey = e.y;
            if (!frozen && !(e.frozenT > 0)) {
              const vx = e.swarm ? e.vx : (px - e.x), vy = e.swarm ? e.vy : (py - e.y);
              const l = Math.hypot(vx, vy) || 1;
              const sp = e.swarm ? Math.hypot(e.vx, e.vy) : e.spd;
              ex += (vx / l) * sp * T * k;
              ey += (vy / l) * sp * T * k;
            }
            const d = Math.hypot(px - ex, py - ey) - e.r - P.r;
            if (d < nearest) nearest = d;
            const R = e.boss ? 26 : e.elite ? 20 : 14;
            if (d < R) s -= (R - d) * (e.boss ? 2 : e.elite ? 1.6 : 1) * (d < 2 ? 3 : 1);
          }
          if (nearest < 1e8 && hpk > 0.45 && k === 1) s -= Math.abs(nearest - 30) * 0.04;
          for (const b of this.ebullets) {
            const bx = b.x + b.vx * T * k, by = b.y + b.vy * T * k;
            const d = Math.hypot(px - bx, py - by);
            if (d < 12) s -= (12 - d) * 6;
          }
          for (const h of this.hazards) if (h.t < h.delay && Math.hypot(px - h.x, py - h.y) < h.r + 7) s -= 60;
        }
        const fx = P.x + dx * spd * T, fy = P.y + dy * spd * T;
        if (tgt) s += ((Math.sqrt(td) - Math.hypot(tgt.x - fx, tgt.y - fy)) / (spd * T)) * (hpk > 0.3 ? 4 : 1.5);
        s -= Math.hypot(fx - this.mapW / 2, fy - this.mapH / 2) * 0.006;
        s += (dx * prev.x + dy * prev.y) * 1.2;
        if (s > bestS) { bestS = s; best = { x: dx, y: dy }; }
      }
      this.botDir = best;
      // 人类会在挥鞭前短暂转向敌人；机器人直接设置朝向来模拟这一操作
      const whip = this.weapons.find((w) => w.def.type === 'slash');
      if (whip && whip.cd < 0.1 && near.length) {
        let ne = near[0], nd = 1e9;
        for (const e of near) { const d = U.dist2(e.x, e.y, P.x, P.y); if (d < nd) { nd = d; ne = e; } }
        if (Math.abs(ne.x - P.x) > 2) P.facing = ne.x > P.x ? 1 : -1;
      }
      return best;
    }

    botChoose(opts) {
      // 优先：已有武器升级 > 新武器（≤4把）> 进化所需被动 > 其它
      const need = new Set(this.weapons.filter((w) => w.def.evo).map((w) => w.def.evo.with));
      let best = 0, bs = -1;
      opts.forEach((o, i) => {
        let s = Math.random();
        if (o.kind === 'wup') s += 5;
        if (o.kind === 'wnew') s += this.weapons.length < 4 ? 6 : 2;
        if ((o.kind === 'pnew' || o.kind === 'pup') && need.has(o.id)) s += 4;
        if (o.kind === 'pup' || o.kind === 'pnew') s += 1;
        if (s > bs) { bs = s; best = i; }
      });
      return best;
    }
  }

  PS.Game = Game;
})();
