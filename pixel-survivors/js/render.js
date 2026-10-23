'use strict';
// 渲染：低分辨率画布 + 整数倍放大，程序化地块、Y 轴排序、特效与光照
(function () {
  const PS = window.PS;
  const U = PS.U;
  const R = (PS.render = { W: 640, H: 360, scale: 2, cssScale: 1, camX: 0, camY: 0, chunks: new Map(), chunkKey: '' });
  const CHUNK = 256, TILE = 16;

  R.init = function (canvas) {
    R.canvas = canvas;
    R.ctx = canvas.getContext('2d');
    window.addEventListener('resize', R.resize);
    R.resize();
  };

  R.resize = function () {
    const dpr = window.devicePixelRatio || 1;
    const dw = Math.max(320, window.innerWidth * dpr), dh = Math.max(200, window.innerHeight * dpr);
    const s = Math.max(1, Math.round(Math.min(dw / 640, dh / 360)));
    R.scale = s;
    R.W = Math.ceil(dw / s);
    R.H = Math.ceil(dh / s);
    R.canvas.width = R.W;
    R.canvas.height = R.H;
    R.cssScale = s / dpr;
    R.canvas.style.width = R.W * R.cssScale + 'px';
    R.canvas.style.height = R.H * R.cssScale + 'px';
    R.ctx.imageSmoothingEnabled = false;
  };

  R.worldToClient = function (x, y) {
    return { x: (x - R.camX) * R.cssScale, y: (y - R.camY) * R.cssScale };
  };

  // ================= 地块主题 =================
  const THEMES = {
    graveyard: {
      base: ['#27352b', '#2a392e', '#253228'], speck: ['#34473a', '#1e2a21', '#3c5242'], void: '#0b0910',
      darkColor: '8,6,22', dark: 0.62, wall: 'fence',
    },
    forest: {
      base: ['#2b4524', '#2e4a27', '#284020'], speck: ['#3b5f30', '#1d3519', '#4a7239'], void: '#07120a',
      darkColor: '4,16,10', dark: 0.5, wall: 'hedge',
    },
    dungeon: {
      base: ['#3a3034', '#3d3337', '#362d31'], speck: ['#4a3e43', '#2a2226', '#54474c'], void: '#0e0505',
      darkColor: '28,4,0', dark: 0.55, wall: 'stone',
    },
  };
  R.THEMES = THEMES;

  function px(ctx, x, y, c, w, h) {
    ctx.fillStyle = c;
    ctx.fillRect(x, y, w || 1, h || 1);
  }

  function genTiles(themeId) {
    const T = THEMES[themeId];
    const rnd = U.rng(themeId.length * 977 + 13);
    const tiles = [];
    for (let v = 0; v < 16; v++) {
      const c = PS.mkCanvas(TILE, TILE);
      const x = c.getContext('2d');
      px(x, 0, 0, T.base[v % T.base.length], TILE, TILE);
      if (themeId === 'dungeon') {
        // 石砖纹理
        x.fillStyle = '#2b2326';
        for (let yy = 0; yy < TILE; yy += 8) {
          x.fillRect(0, yy, TILE, 1);
          const off = (yy / 8) % 2 ? 4 : 0;
          x.fillRect(off, yy, 1, 8);
          x.fillRect(off + 8, yy, 1, 8);
        }
      }
      const n = 6 + Math.floor(rnd() * 10);
      for (let i = 0; i < n; i++) px(x, Math.floor(rnd() * TILE), Math.floor(rnd() * TILE), T.speck[Math.floor(rnd() * T.speck.length)]);
      const deco = v >= 10 ? v - 9 : 0;
      if (deco) {
        const dx = 3 + Math.floor(rnd() * 9), dy = 4 + Math.floor(rnd() * 8);
        if (themeId === 'graveyard') {
          if (deco <= 2) { px(x, dx, dy, '#3f5a44'); px(x, dx + 2, dy, '#3f5a44'); px(x, dx + 1, dy + 1, '#3f5a44'); px(x, dx + 1, dy - 1, '#4f6e52'); }
          else if (deco <= 4) { px(x, dx, dy, '#8a8576', 3, 1); px(x, dx - 1, dy - 1, '#8a8576'); px(x, dx + 3, dy + 1, '#8a8576'); }
          else { px(x, dx, dy, '#5a5560', 2, 2); px(x, dx, dy, '#706a76'); }
        } else if (themeId === 'forest') {
          if (deco <= 2) { px(x, dx, dy, '#d04648'); px(x, dx + 4, dy + 2, '#dad45e'); px(x, dx + 2, dy + 4, '#f3a0b4'); }
          else if (deco <= 4) { px(x, dx, dy, '#5a8a40'); px(x, dx + 2, dy, '#5a8a40'); px(x, dx + 1, dy - 1, '#6daa2c'); px(x, dx + 4, dy + 1, '#5a8a40'); }
          else { px(x, dx, dy, '#d2aa99', 2, 1); px(x, dx - 1, dy - 1, '#d04648', 4, 1); }
        } else {
          if (deco <= 2) { px(x, dx, dy, '#ff9f43', 3, 1); px(x, dx + 3, dy + 1, '#d04648', 2, 1); px(x, dx - 1, dy - 1, '#d04648'); }
          else if (deco <= 4) { px(x, dx, dy, '#c9c2a8', 2, 1); px(x, dx + 1, dy + 1, '#c9c2a8'); }
          else { px(x, dx, dy, '#241c1f', 1, 3); px(x, dx + 1, dy + 2, '#241c1f', 2, 1); }
        }
      }
      tiles.push(c);
    }
    // 边界墙
    const wall = PS.mkCanvas(TILE, TILE);
    const wx = wall.getContext('2d');
    if (T.wall === 'fence') {
      px(wx, 0, 0, T.base[0], TILE, TILE);
      for (let i = 1; i < TILE; i += 4) {
        px(wx, i, 2, '#3a3640', 2, 13);
        px(wx, i, 1, '#5a5664', 2, 1);
        px(wx, i, 0, '#5a5664', 1, 1);
      }
      px(wx, 0, 5, '#2a2730', TILE, 1);
      px(wx, 0, 11, '#2a2730', TILE, 1);
    } else if (T.wall === 'hedge') {
      px(wx, 0, 0, '#163016', TILE, TILE);
      for (let i = 0; i < 26; i++) px(wx, Math.floor(rnd() * TILE), Math.floor(rnd() * TILE), i % 2 ? '#24481f' : '#0e220e', 2, 2);
    } else {
      px(wx, 0, 0, '#4a3f44', TILE, TILE);
      px(wx, 0, 0, '#5a4e54', TILE, 1);
      px(wx, 0, 7, '#2b2326', TILE, 1);
      px(wx, 0, 15, '#2b2326', TILE, 1);
      px(wx, 7, 0, '#2b2326', 1, 7);
      px(wx, 3, 8, '#2b2326', 1, 7);
      px(wx, 11, 8, '#2b2326', 1, 7);
    }
    return { tiles, wall, T };
  }

  function getChunk(game, cx, cy) {
    const key = cx + ',' + cy;
    let c = R.chunks.get(key);
    if (c) return c;
    c = PS.mkCanvas(CHUNK, CHUNK);
    const x = c.getContext('2d');
    const ts = R.tileset;
    const seed = R.seed;
    const tw = Math.ceil(game.mapW / TILE), th = Math.ceil(game.mapH / TILE);
    for (let ty = 0; ty < CHUNK / TILE; ty++) {
      for (let tx = 0; tx < CHUNK / TILE; tx++) {
        const gx = cx * (CHUNK / TILE) + tx, gy = cy * (CHUNK / TILE) + ty;
        let img;
        if (gx < 0 || gy < 0 || gx >= tw || gy >= th) {
          x.fillStyle = ts.T.void;
          x.fillRect(tx * TILE, ty * TILE, TILE, TILE);
          continue;
        } else if (gx === 0 || gy === 0 || gx === tw - 1 || gy === th - 1) img = ts.wall;
        else {
          const h = U.hash2(gx, gy, seed);
          img = h < 0.86 ? ts.tiles[Math.floor(h * 11.6) % 10] : ts.tiles[10 + Math.floor(((h - 0.86) / 0.14) * 6) % 6];
        }
        x.drawImage(img, tx * TILE, ty * TILE);
      }
    }
    R.chunks.set(key, c);
    return c;
  }

  R.prepare = function (game) {
    R.chunks.clear();
    R.tileset = genTiles(game.st.theme);
    R.seed = (Math.random() * 1e6) | 0;
    R.game = game;
    R.glow = makeGlow();
  };

  function makeGlow() {
    const s = 64;
    const c = PS.mkCanvas(s, s);
    const x = c.getContext('2d');
    const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,170,80,0.55)');
    g.addColorStop(1, 'rgba(255,120,40,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, s, s);
    return c;
  }

  // ================= 绘制辅助 =================
  function drawRot(ctx, img, x, y, rot, sc) {
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    if (rot) ctx.rotate(rot);
    if (sc && sc !== 1) ctx.scale(sc, sc);
    ctx.drawImage(img, -Math.round(img.width / 2), -Math.round(img.height / 2));
    ctx.restore();
  }

  const slashCache = new Map();
  function slashImg(len, hh, evo) {
    len = Math.max(8, Math.round(len));
    hh = Math.max(4, Math.round(hh));
    const key = len + '|' + hh + '|' + evo;
    let c = slashCache.get(key);
    if (c) return c;
    c = PS.mkCanvas(len, hh + 4);
    const x = c.getContext('2d');
    const edge = evo ? '#d04648' : '#c2c3c7', mid = evo ? '#ff6ec7' : '#deeed6', core = '#ffffff';
    for (let i = 0; i < len; i++) {
      const u = i / (len - 1);
      const s = Math.sin(u * Math.PI);
      const th = Math.max(1, Math.round(s * hh * 0.55));
      const y0 = Math.round(hh * 0.65 - s * hh * 0.45);
      x.fillStyle = edge;
      x.fillRect(i, y0, 1, th + 1);
      if (th > 2) {
        x.fillStyle = mid;
        x.fillRect(i, y0 + 1, 1, th - 1);
      }
      if (th > 4) {
        x.fillStyle = core;
        x.fillRect(i, y0 + 1, 1, Math.max(1, Math.floor(th / 3)));
      }
    }
    slashCache.set(key, c);
    return c;
  }

  function drawDigits(ctx, x, y, v, color, sc) {
    const s = String(v);
    const set = PS.DIG[color] || PS.DIG.w;
    const cw = 4 * sc;
    let cx = Math.round(x - (s.length * cw) / 2);
    const cy = Math.round(y);
    for (const ch of s) {
      const img = set[ch];
      if (img) ctx.drawImage(img, cx, cy, img.width * sc, img.height * sc);
      cx += cw;
    }
  }
  R.drawDigits = drawDigits;

  function enemyImg(e, game) {
    const spr = PS.SPR[e.spr];
    let fi = 0;
    if (spr.frames.length > 1) fi = Math.floor(e.anim * 7) % spr.frames.length;
    const fr = spr.frames[fi];
    const flip = e.face < 0;
    if (e.flash > 0) return flip ? fr.wf : fr.w;
    if (e.frozenT > 0 || game.freezeT > 0) return flip ? fr.bf : fr.b;
    if (e.elite) return flip ? fr.ef : fr.e;
    return flip ? fr.f : fr.n;
  }

  // ================= 主绘制 =================
  const list = [];
  R.draw = function (game, t) {
    const ctx = R.ctx;
    const W = R.W, H = R.H;
    const P = game.P;
    // 相机
    game.cam.w = W;
    game.cam.h = H;
    game.updateCam();
    let camX = game.cam.x, camY = game.cam.y;
    let sx = 0, sy = 0;
    if (game.shake > 0 && game.settings.shake) {
      sx = Math.round(U.rand(-game.shake, game.shake));
      sy = Math.round(U.rand(-game.shake, game.shake));
    }
    camX += sx;
    camY += sy;
    R.camX = camX;
    R.camY = camY;

    // 地面
    ctx.fillStyle = R.tileset.T.void;
    ctx.fillRect(0, 0, W, H);
    const cx0 = Math.floor(camX / CHUNK), cy0 = Math.floor(camY / CHUNK);
    const cx1 = Math.floor((camX + W) / CHUNK), cy1 = Math.floor((camY + H) / CHUNK);
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) ctx.drawImage(getChunk(game, cx, cy), cx * CHUNK - camX, cy * CHUNK - camY);

    const inView = (x, y, m) => x > camX - m && x < camX + W + m && y > camY - m && y < camY + H + m;

    // 地面效果层：圣域、光环、陷阱预警
    for (const p of game.projs) {
      if (p.dead) continue;
      if (p.kind === 'pool') {
        const col = p.evo ? '#9b4dbb' : '#6dc2ca';
        const fade = p.life - p.t < 0.3 ? (p.life - p.t) / 0.3 : 1;
        ctx.globalAlpha = 0.45 * fade;
        const d = PS.circle(p.r, col, 'dither');
        ctx.drawImage(d, Math.round(p.x - camX - d.width / 2), Math.round(p.y - camY - d.height / 2));
        ctx.globalAlpha = 0.9 * fade;
        const rg = PS.circle(p.r + Math.sin(p.t * 8), p.evo ? '#f3a0b4' : '#b8e8f0', 'ring');
        ctx.drawImage(rg, Math.round(p.x - camX - rg.width / 2), Math.round(p.y - camY - rg.height / 2));
        ctx.globalAlpha = 1;
      } else if (p.kind === 'aura') {
        const col = p.evo ? '#9b4dbb' : '#deeed6';
        ctx.globalAlpha = 0.16 + Math.sin(t * 4) * 0.04;
        const d = PS.circle(p.r, col, 'dither');
        ctx.drawImage(d, Math.round(p.x - camX - d.width / 2), Math.round(p.y - camY - d.height / 2));
        ctx.globalAlpha = 0.35;
        const rg = PS.circle(p.r, col, 'ring');
        ctx.drawImage(rg, Math.round(p.x - camX - rg.width / 2), Math.round(p.y - camY - rg.height / 2));
        ctx.globalAlpha = 1;
      }
    }
    for (const h of game.hazards) {
      if (h.t >= h.delay) continue;
      const k = Math.max(0, h.t) / h.delay;
      ctx.globalAlpha = 0.25 + 0.35 * k + (Math.floor(t * 12) % 2 ? 0.1 : 0);
      const d = PS.circle(h.r, h.color === 'root' ? '#854c30' : '#d04648', 'dither');
      ctx.drawImage(d, Math.round(h.x - camX - d.width / 2), Math.round(h.y - camY - d.height / 2));
      const rg = PS.circle(h.r * k, '#ff9f43', 'ring');
      ctx.drawImage(rg, Math.round(h.x - camX - rg.width / 2), Math.round(h.y - camY - rg.height / 2));
      ctx.globalAlpha = 1;
    }

    // 拾取物
    for (const p of game.pickups) {
      if (!inView(p.x, p.y, 16)) continue;
      let name;
      switch (p.type) {
        case 'gem': name = p.big ? 'gem_big' : p.v < 3 ? 'gem_b' : p.v < 10 ? 'gem_g' : 'gem_r'; break;
        case 'chest': name = p.v === 2 ? 'chest_boss' : 'chest'; break;
        default: name = p.type;
      }
      const spr = PS.SPR[name];
      const img = spr.frames[0].n;
      const bob = p.type === 'gem' ? 0 : Math.round(Math.sin(p.t * 4 + p.x) * 1.5);
      if (p.type !== 'gem') {
        const sh = PS.shadow(img.width - 2);
        ctx.drawImage(sh, Math.round(p.x - camX - sh.width / 2), Math.round(p.y - camY + img.height / 2 - 2));
      }
      if (p.type === 'chest') {
        ctx.globalAlpha = 0.4 + Math.sin(t * 5) * 0.2;
        const rg = PS.circle(13, '#ffe08a', 'ring');
        ctx.drawImage(rg, Math.round(p.x - camX - rg.width / 2), Math.round(p.y - camY - rg.height / 2));
        ctx.globalAlpha = 1;
      }
      ctx.drawImage(img, Math.round(p.x - camX - img.width / 2), Math.round(p.y - camY - img.height / 2) + bob - (p.type === 'gem' ? 0 : 2));
    }

    // Y 排序实体
    list.length = 0;
    for (const o of game.obstacles) if (inView(o.x, o.y, 40)) list.push(o);
    for (const b of game.braziers) if (!b.dead && inView(b.x, b.y, 20)) list.push(b);
    for (const e of game.enemies) if (!e.dead && inView(e.x, e.y, 40)) list.push(e);
    if (!game.dead) list.push(P);
    list.sort((a, b) => a.y - b.y);
    for (const o of list) {
      if (o === P) drawPlayer(ctx, game, t, camX, camY);
      else if (o.kind === 'obs') {
        const img = PS.SPR[o.spr].frames[0].n;
        const sh = PS.shadow(Math.max(8, img.width - 4));
        ctx.drawImage(sh, Math.round(o.x - camX - sh.width / 2), Math.round(o.y - camY + 1));
        ctx.drawImage(img, Math.round(o.x - camX - img.width / 2), Math.round(o.y - camY - img.height + 4));
      } else if (o.prop) {
        const spr = PS.SPR.brazier;
        const img = spr.frames[Math.floor(o.anim * 6) % 2].n;
        const sh = PS.shadow(10);
        ctx.drawImage(sh, Math.round(o.x - camX - 5), Math.round(o.y - camY + 4));
        ctx.drawImage(img, Math.round(o.x - camX - img.width / 2), Math.round(o.y - camY - img.height + 7));
      } else drawEnemy(ctx, o, game, camX, camY);
    }

    // 投射物
    for (const p of game.projs) {
      if (p.dead || !inView(p.x, p.y, 60)) continue;
      switch (p.kind) {
        case 'slash': {
          const img = slashImg(p.len, p.hh, p.evo);
          const a = 1 - p.t / p.life;
          ctx.globalAlpha = Math.max(0, a);
          ctx.save();
          ctx.translate(Math.round(p.x - camX), Math.round(p.y - camY));
          if (p.side < 0) ctx.scale(-1, 1);
          ctx.drawImage(img, -Math.round(img.width / 2), -Math.round(img.height / 2));
          ctx.restore();
          ctx.globalAlpha = 1;
          break;
        }
        case 'bullet':
        case 'axe':
        case 'boom':
        case 'rune':
        case 'fireball':
        case 'orbit':
        case 'flask': {
          const spr = PS.SPR[p.spr];
          if (!spr) break;
          const img = spr.frames[0].n;
          const rot = p.kind === 'orbit' ? 0 : p.rot || 0;
          drawRot(ctx, img, p.x - camX, p.y - camY, rot, p.scale || 1);
          break;
        }
        case 'nova': {
          const fade = p.t > p.grow ? 1 - (p.t - p.grow) / (p.life - p.grow) : 1;
          ctx.globalAlpha = Math.max(0, 0.9 * fade);
          const rg = PS.circle(p.r, p.evo ? '#ffffff' : '#b8e8f0', 'ring');
          ctx.drawImage(rg, Math.round(p.x - camX - rg.width / 2), Math.round(p.y - camY - rg.height / 2));
          if (p.r > 3) {
            const rg2 = PS.circle(p.r - 2, '#6dc2ca', 'ring');
            ctx.drawImage(rg2, Math.round(p.x - camX - rg2.width / 2), Math.round(p.y - camY - rg2.height / 2));
          }
          ctx.globalAlpha = Math.max(0, 0.18 * fade);
          const d = PS.circle(p.r, '#b8e8f0', 'dither');
          ctx.drawImage(d, Math.round(p.x - camX - d.width / 2), Math.round(p.y - camY - d.height / 2));
          ctx.globalAlpha = 1;
          break;
        }
      }
    }

    // 敌方子弹
    for (const b of game.ebullets) {
      if (!inView(b.x, b.y, 8)) continue;
      const img = PS.SPR[b.spr].frames[0].n;
      ctx.drawImage(img, Math.round(b.x - camX - img.width / 2), Math.round(b.y - camY - img.height / 2));
    }

    // 特效
    for (const f of game.fx) {
      const k = f.t / f.life;
      if (f.kind === 'ring') {
        ctx.globalAlpha = Math.max(0, 1 - k);
        const rg = PS.circle(U.lerp(f.r0, f.r1, k), f.color, 'ring');
        ctx.drawImage(rg, Math.round(f.x - camX - rg.width / 2), Math.round(f.y - camY - rg.height / 2));
        ctx.globalAlpha = 1;
      } else if (f.kind === 'bolt') {
        drawBolt(ctx, f, camX, camY, k);
      }
    }

    // 粒子
    for (const p of game.parts) {
      ctx.globalAlpha = Math.min(1, (p.life / p.max) * 1.6);
      ctx.fillStyle = p.c;
      ctx.fillRect(Math.round(p.x - camX), Math.round(p.y - camY), p.s, p.s);
    }
    ctx.globalAlpha = 1;

    // 光照
    const T = R.tileset.T;
    const pcx = P.x - camX, pcy = P.y - camY;
    const md = Math.max(W, H);
    const grad = ctx.createRadialGradient(pcx, pcy, md * 0.18, pcx, pcy, md * 0.72);
    grad.addColorStop(0, 'rgba(' + T.darkColor + ',0)');
    grad.addColorStop(1, 'rgba(' + T.darkColor + ',' + T.dark + ')');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    for (const b of game.braziers) {
      if (b.dead || !inView(b.x, b.y, 40)) continue;
      ctx.globalAlpha = 0.5 + Math.sin(b.anim * 9) * 0.08;
      ctx.drawImage(R.glow, Math.round(b.x - camX - 32), Math.round(b.y - camY - 36));
    }
    for (const p of game.projs) {
      if (p.kind === 'fireball' && !p.dead && inView(p.x, p.y, 40)) {
        ctx.globalAlpha = p.evo ? 0.7 : 0.4;
        ctx.drawImage(R.glow, Math.round(p.x - camX - 32), Math.round(p.y - camY - 32));
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    // 伤害数字（在光照之上，保证可读）
    for (const n of game.nums) {
      ctx.globalAlpha = n.t > 0.45 ? 1 - (n.t - 0.45) / 0.2 : 1;
      drawDigits(ctx, n.x - camX, n.y - camY, n.v, n.c, n.c === 'y' ? 2 : 1);
    }
    ctx.globalAlpha = 1;

    // 玩家血条
    if (!game.dead) {
      const bx = Math.round(P.x - camX - 8), by = Math.round(P.y - camY + 11);
      ctx.fillStyle = '#140c1c';
      ctx.fillRect(bx - 1, by - 1, 18, 7);
      ctx.fillStyle = '#442434';
      ctx.fillRect(bx, by, 16, 2);
      ctx.fillStyle = P.hp / P.maxHp < 0.3 ? '#ff004d' : '#d04648';
      ctx.fillRect(bx, by, Math.max(0, Math.round((16 * P.hp) / P.maxHp)), 2);
      // 体力条：可冲刺时为黄色，不足一次冲刺时为暗橙色
      ctx.fillStyle = '#2a2036';
      ctx.fillRect(bx, by + 3, 16, 2);
      ctx.fillStyle = P.sta >= PS.CONST.DASH_COST ? '#dad45e' : '#9a5a2a';
      ctx.fillRect(bx, by + 3, Math.max(0, Math.round((16 * P.sta) / P.staMax)), 2);
    }

    // 屏幕外指示
    for (const p of game.pickups) if (p.type === 'chest') indicator(ctx, p.x, p.y, camX, camY, W, H, 'chest', t);
    for (const b of game.bosses) indicator(ctx, b.x, b.y, camX, camY, W, H, 'skull', t);

    // 全屏效果
    if (game.freezeT > 0) {
      ctx.fillStyle = 'rgba(109,194,202,0.16)';
      ctx.fillRect(0, 0, W, H);
    }
    if (P.hp / P.maxHp < 0.3 && !game.dead) {
      const a = 0.18 + Math.sin(t * 6) * 0.1;
      const g2 = ctx.createRadialGradient(W / 2, H / 2, md * 0.3, W / 2, H / 2, md * 0.7);
      g2.addColorStop(0, 'rgba(208,70,72,0)');
      g2.addColorStop(1, 'rgba(208,70,72,' + a.toFixed(3) + ')');
      ctx.fillStyle = g2;
      ctx.fillRect(0, 0, W, H);
    }
    if (game.hurtFlash > 0) {
      ctx.fillStyle = 'rgba(255,0,77,' + (game.hurtFlash * 1.1).toFixed(3) + ')';
      ctx.fillRect(0, 0, W, H);
    }
    if (game.whiteFlash > 0) {
      ctx.fillStyle = 'rgba(255,255,255,' + Math.min(0.8, game.whiteFlash * 1.6).toFixed(3) + ')';
      ctx.fillRect(0, 0, W, H);
    }
    if (game.lvlFlash > 0) {
      ctx.fillStyle = 'rgba(218,212,94,' + (game.lvlFlash * 0.5).toFixed(3) + ')';
      ctx.fillRect(0, 0, W, H);
    }
  };

  function indicator(ctx, x, y, camX, camY, W, H, icon, t) {
    const sx = x - camX, sy = y - camY;
    if (sx > 0 && sx < W && sy > 0 && sy < H) return;
    if (Math.floor(t * 3) % 2) return;
    const cx = W / 2, cy = H / 2;
    const dx = sx - cx, dy = sy - cy;
    const k = Math.min((W / 2 - 12) / Math.abs(dx || 1e-6), (H / 2 - 12) / Math.abs(dy || 1e-6));
    const ix = cx + dx * k, iy = cy + dy * k;
    const img = PS.SPR[icon].frames[0].n;
    ctx.drawImage(img, Math.round(ix - img.width / 2), Math.round(iy - img.height / 2));
  }

  function drawBolt(ctx, f, camX, camY, k) {
    const rnd = U.rng(f.seed | 0);
    const x = f.x - camX, y = f.y - camY;
    let cx = x + (rnd() - 0.5) * 20, cy = y - 150;
    ctx.globalAlpha = Math.max(0, 1 - k);
    const steps = 10;
    for (let i = 1; i <= steps; i++) {
      const nx = i === steps ? x : x + (rnd() - 0.5) * 22 * (1 - i / steps);
      const ny = y - 150 + (150 * i) / steps;
      // 像素线段
      const len = Math.max(Math.abs(nx - cx), Math.abs(ny - cy));
      for (let s = 0; s <= len; s += 1) {
        const px2 = Math.round(cx + ((nx - cx) * s) / len), py2 = Math.round(cy + ((ny - cy) * s) / len);
        ctx.fillStyle = f.evo ? '#6dc2ca' : '#dad45e';
        ctx.fillRect(px2 - 1, py2, 3, 1);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(px2, py2, 1, 1);
      }
      cx = nx;
      cy = ny;
    }
    const fl = PS.circle(6 + (1 - k) * 4, '#ffffff', 'dither');
    ctx.drawImage(fl, Math.round(x - fl.width / 2), Math.round(y - fl.height / 2));
    ctx.globalAlpha = 1;
  }

  function drawEnemy(ctx, e, game, camX, camY) {
    const img = enemyImg(e, game);
    const sc = e.scale || 1;
    let w = img.width * sc, h = img.height * sc;
    let bob = 0;
    const style = e.def.anim;
    if (style === 'squish') {
      const s = Math.sin(e.anim * 8) * 0.08;
      h = Math.round(h * (1 - s));
      w = Math.round(w * (1 + s));
    } else if (!e.boss && !e.fly && style !== 'flap') bob = Math.floor(e.anim * 8 + e.uid) % 2;
    else if (e.boss) bob = Math.round(Math.sin(e.anim * 4) * 1);
    const x = Math.round(e.x - camX - w / 2);
    const y = Math.round(e.y - camY - h / 2 - bob - (e.z || 0));
    const sh = PS.shadow(Math.max(6, w * 0.7));
    ctx.drawImage(sh, Math.round(e.x - camX - sh.width / 2), Math.round(e.y - camY + h / 2 - sh.height + 1));
    const a = (e.def.alpha || 1) * (e.alpha === undefined ? 1 : e.alpha);
    if (a < 1) ctx.globalAlpha = Math.max(0, a);
    ctx.drawImage(img, x, y, w, h);
    if (a < 1) ctx.globalAlpha = 1;
    // 精英血条
    if (e.elite && e.hp < e.maxHp) {
      const bx = Math.round(e.x - camX - 10), by = Math.round(e.y - camY + h / 2 + 2);
      ctx.fillStyle = '#140c1c';
      ctx.fillRect(bx - 1, by - 1, 22, 4);
      ctx.fillStyle = '#ffd84a';
      ctx.fillRect(bx, by, Math.max(0, Math.round((20 * e.hp) / e.maxHp)), 2);
    }
  }

  function drawPlayer(ctx, game, t, camX, camY) {
    const P = game.P;
    const spr = PS.SPR['ch_' + game.charId];
    const fi = P.moving ? Math.floor(P.anim * 8) % 2 : 0;
    const fr = spr.frames[fi];
    const flip = P.facing < 0;
    let img = flip ? fr.f : fr.n;
    if (P.iframes > 0 && game.hurtFlash > 0.1) img = flip ? fr.wf : fr.w;
    const blink = P.iframes > 0 && P.dashT <= 0 && Math.floor(t * 20) % 2 === 0;
    // 冲刺残影
    const ghost = flip ? fr.wf : fr.w;
    for (const tr of P.trail) {
      ctx.globalAlpha = Math.max(0, 0.45 * (1 - tr.t / 0.22));
      ctx.drawImage(ghost, Math.round(tr.x - camX - ghost.width / 2), Math.round(tr.y - camY - ghost.height / 2));
    }
    ctx.globalAlpha = 1;
    const x = Math.round(P.x - camX - img.width / 2), y = Math.round(P.y - camY - img.height / 2 - (fi ? 1 : 0));
    const sh = PS.shadow(12);
    ctx.drawImage(sh, Math.round(P.x - camX - 6), Math.round(P.y - camY + 6));
    // 拾取范围提示（极淡）
    if (blink) ctx.globalAlpha = 0.45;
    ctx.drawImage(img, x, y);
    ctx.globalAlpha = 1;
  }

  // ================= 菜单背景 =================
  R.menuBg = { init: false };
  R.drawMenu = function (t) {
    const ctx = R.ctx, W = R.W, H = R.H;
    const mb = R.menuBg;
    if (!mb.init) {
      mb.init = true;
      mb.ts = genTiles('graveyard');
      mb.mobs = [];
      const types = ['bat', 'zombie', 'skeleton', 'ghost', 'mummy', 'bat', 'bat'];
      for (let i = 0; i < 26; i++) mb.mobs.push({ spr: types[i % types.length], x: Math.random() * 900, y: Math.random() * 500, v: U.rand(10, 30), ph: Math.random() * 6 });
      mb.props = [];
      for (let i = 0; i < 18; i++) mb.props.push({ spr: U.pick(['tomb', 'tomb2', 'deadtree', 'tomb']), x: Math.random() * 1200, y: Math.random() * 700 });
    }
    const scroll = t * 12;
    const ox = Math.floor(scroll) % TILE;
    for (let ty = 0; ty <= Math.ceil(H / TILE); ty++) {
      for (let tx = -1; tx <= Math.ceil(W / TILE) + 1; tx++) {
        const gx = tx + Math.floor(scroll / TILE);
        const h = U.hash2(gx, ty, 99);
        const img = h < 0.86 ? mb.ts.tiles[Math.floor(h * 11.6) % 10] : mb.ts.tiles[10 + Math.floor(((h - 0.86) / 0.14) * 6) % 6];
        ctx.drawImage(img, tx * TILE - ox, ty * TILE);
      }
    }
    const items = [];
    for (const p of mb.props) {
      const x = ((p.x - scroll) % 1200 + 1200) % 1200 - 60;
      items.push({ y: p.y % (H + 40), x, spr: p.spr, prop: true });
    }
    for (const m of mb.mobs) {
      const x = ((m.x - scroll * 0.4 - t * m.v) % 900 + 900) % 900 - 40;
      items.push({ y: (m.y % (H + 20)) + Math.sin(t * 2 + m.ph) * 3, x, spr: m.spr, mob: m });
    }
    items.sort((a, b) => a.y - b.y);
    for (const it of items) {
      const spr = PS.SPR[it.spr];
      const n = spr.frames.length;
      const fi = n > 1 ? ((Math.floor(t * 7 + it.x) % n) + n) % n : 0;
      const img = it.mob ? spr.frames[fi].f : spr.frames[0].n;
      ctx.drawImage(img, Math.round(it.x), Math.round(it.y));
    }
    const md = Math.max(W, H);
    const g = ctx.createRadialGradient(W / 2, H * 0.45, md * 0.1, W / 2, H / 2, md * 0.7);
    g.addColorStop(0, 'rgba(8,6,22,0.35)');
    g.addColorStop(1, 'rgba(8,6,22,0.9)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  };
})();
