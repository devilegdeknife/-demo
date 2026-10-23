'use strict';
// 像素美术：所有精灵以字符点阵定义，启动时烘焙为离屏画布（自动描边、翻转、受击白闪、冰冻、精英金边）
(function () {
  const PS = (window.PS = window.PS || {});

  // 调色板（以 DawnBringer16 为基础扩展）
  const PAL = {
    '0': '#140c1c', '1': '#442434', '2': '#30346d', '3': '#4e4a4e', '4': '#854c30', '5': '#346524',
    '6': '#d04648', '7': '#757161', '8': '#597dce', '9': '#d27d2c', a: '#8595a1', b: '#6daa2c',
    c: '#d2aa99', d: '#6dc2ca', e: '#dad45e', f: '#deeed6', g: '#ffffff', h: '#9b4dbb',
    i: '#5a2a7a', j: '#8a1c32', k: '#2a1a14', l: '#c9c2a8', m: '#ff9f43', n: '#ffe08a',
    o: '#1e5a3a', p: '#f3a0b4', q: '#b8e8f0', r: '#a0522d', s: '#c2c3c7', t: '#3b2f5c',
    u: '#9be05a', v: '#ff004d', w: '#e8c070', x: '#5c3a1e', y: '#2e6e8e', z: '#ff6ec7',
  };
  PS.PAL = PAL;
  const RGB = {};
  const hexRgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  for (const k in PAL) RGB[k] = hexRgb(PAL[k]);

  const SPR = (PS.SPR = {});
  PS.spriteWarnings = [];

  const mk = (w, h) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  };
  PS.mkCanvas = mk;
  const rev = (s) => s.split('').reverse().join('');
  const mir = (rows) => rows.map((r) => r + rev(r));
  const mirOdd = (rows) => rows.map((r) => r + rev(r.slice(0, -1)));
  const sub = (rows, map) => rows.map((r) => r.replace(/./g, (ch) => (map[ch] !== undefined ? map[ch] : ch)));
  const padTop = (rows, h) => {
    rows = rows.slice();
    const w = rows[0].length;
    while (rows.length < h) rows.unshift('.'.repeat(w));
    return rows;
  };
  PS.artUtil = { mir, mirOdd, sub, padTop };

  function rowsToCanvas(rows, outline) {
    const h = rows.length;
    let w = 0;
    for (const r of rows) w = Math.max(w, r.length);
    const o = outline ? 1 : 0;
    const cw = w + o * 2, chh = h + o * 2;
    const c = mk(cw, chh);
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(cw, chh);
    const d = img.data;
    const solid = new Uint8Array(cw * chh);
    for (let y = 0; y < h; y++) {
      const r = rows[y];
      for (let x = 0; x < r.length; x++) {
        const ch = r[x];
        if (ch === '.' || ch === ' ') continue;
        const rgb = RGB[ch];
        if (!rgb) {
          PS.spriteWarnings.push('未知颜色字符 ' + ch);
          continue;
        }
        const i = (y + o) * cw + (x + o);
        solid[i] = 1;
        d[i * 4] = rgb[0];
        d[i * 4 + 1] = rgb[1];
        d[i * 4 + 2] = rgb[2];
        d[i * 4 + 3] = 255;
      }
    }
    if (outline) {
      const orgb = hexRgb(outline);
      for (let y = 0; y < chh; y++) {
        for (let x = 0; x < cw; x++) {
          const i = y * cw + x;
          if (solid[i]) continue;
          if ((x > 0 && solid[i - 1]) || (x < cw - 1 && solid[i + 1]) || (y > 0 && solid[i - cw]) || (y < chh - 1 && solid[i + cw])) {
            d[i * 4] = orgb[0];
            d[i * 4 + 1] = orgb[1];
            d[i * 4 + 2] = orgb[2];
            d[i * 4 + 3] = 255;
          }
        }
      }
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }

  function flip(src) {
    const c = mk(src.width, src.height);
    const x = c.getContext('2d');
    x.translate(src.width, 0);
    x.scale(-1, 1);
    x.drawImage(src, 0, 0);
    return c;
  }
  function silhouette(src, color) {
    const c = mk(src.width, src.height);
    const x = c.getContext('2d');
    x.drawImage(src, 0, 0);
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = color;
    x.fillRect(0, 0, c.width, c.height);
    return c;
  }
  function tinted(src, color, alpha) {
    const c = mk(src.width, src.height);
    const x = c.getContext('2d');
    x.drawImage(src, 0, 0);
    x.globalCompositeOperation = 'source-atop';
    x.globalAlpha = alpha;
    x.fillStyle = color;
    x.fillRect(0, 0, c.width, c.height);
    return c;
  }

  // 主色：用于死亡粒子
  function mainColor(rows) {
    const cnt = {};
    for (const r of rows) for (const ch of r) if (ch !== '.' && ch !== '0') cnt[ch] = (cnt[ch] || 0) + 1;
    let best = '7', bn = 0;
    for (const k in cnt) if (cnt[k] > bn) { bn = cnt[k]; best = k; }
    return PAL[best] || '#888';
  }

  // kind: basic(普通+翻转) | char(含白闪) | enemy(含白闪/冰冻/精英金边)
  function make(name, frames, opt) {
    opt = opt || {};
    const kind = opt.kind || 'basic';
    const spr = { name, frames: [], w: 0, h: 0, color: mainColor(frames[0]) };
    for (const rows of frames) {
      const lens = new Set(rows.map((r) => r.length));
      if (lens.size > 1) PS.spriteWarnings.push('精灵 ' + name + ' 行长度不一致: ' + [...lens].join(','));
      const n = rowsToCanvas(rows, opt.outline === false ? null : PAL['0']);
      const fr = { n, f: flip(n) };
      if (kind === 'enemy' || kind === 'char') {
        fr.w = silhouette(n, '#ffffff');
        fr.wf = flip(fr.w);
      }
      if (kind === 'enemy') {
        fr.b = tinted(n, '#6dc2ca', 0.55);
        fr.bf = flip(fr.b);
        fr.e = rowsToCanvas(rows, '#ffd84a');
        fr.ef = flip(fr.e);
      }
      spr.frames.push(fr);
    }
    spr.w = spr.frames[0].n.width;
    spr.h = spr.frames[0].n.height;
    spr.rows = frames[0];
    SPR[name] = spr;
    return spr;
  }
  PS.makeSprite = make;

  // ================= 角色模板 =================
  const HEADS = {
    hair: [
      '................',
      '................',
      '......HHHH......',
      '.....HHHHHH.....',
      '.....HHHHHHH....',
      '.....HSS0S0S....',
      '.....HSSSSSS....',
      '......SSSSS.....',
    ],
    long: [
      '................',
      '................',
      '......HHHH......',
      '.....HHHHHH.....',
      '....HHHHHHHH....',
      '....HHSS0S0S....',
      '....HHSSSSSS....',
      '....HHHSSSS.....',
    ],
    helmet: [
      '.......AA.......',
      '......MMMM......',
      '.....MMMMMM.....',
      '.....MMMMMMM....',
      '.....MMSSSSS....',
      '.....MMS0S0S....',
      '.....MMMMMMM....',
      '......MMMMM.....',
    ],
    wizard: [
      '....T...........',
      '.....TT.........',
      '......TTT.......',
      '......TTTTT.....',
      '....UUUUUUUUU...',
      '.....HSS0S0S....',
      '.....HSSSSSS....',
      '......SSSSS.....',
    ],
    hood: [
      '................',
      '................',
      '......TTTT......',
      '.....TTTTTT.....',
      '....TTTTTTTT....',
      '....TTSS0S0S....',
      '....TTSSSSSS....',
      '....TTTSSSS.....',
    ],
    nun: [
      '................',
      '................',
      '......TTTT......',
      '.....TTTTTT.....',
      '....TTffffff....',
      '....TTSS0S0S....',
      '....TTSSSSSS....',
      '....TTTSSSS.....',
    ],
    bandana: [
      '................',
      '................',
      '......TTTT......',
      '....TTTTTTTT....',
      '....THSSSSSS....',
      '.....HSS0S0S....',
      '.....HHHHHHH....',
      '......HHHHH.....',
    ],
    widehat: [
      '................',
      '................',
      '......TTTT......',
      '.....TTTTTT.....',
      '...UUUUUUUUUU...',
      '.....HSS0S0S....',
      '.....HSSSSSS....',
      '......SSSSS.....',
    ],
  };
  const BODIES = {
    tunic: [
      '.....CCCCCC.....',
      '....CCCAACCC....',
      '....SCCAACCS....',
      '.....CCAACC.....',
      '.....DDDDDD.....',
    ],
    robe: [
      '.....CCCCCC.....',
      '....CCCAACCC....',
      '....SCCAACCS....',
      '.....CCAACC.....',
      '.....CCAACC.....',
      '....CCCAACCC....',
      '....DDDDDDDD....',
    ],
    armor: [
      '....MMCCCCMM....',
      '....MCCAACCM....',
      '....SCCAACCS....',
      '.....CCAACC.....',
      '.....DDDDDD.....',
    ],
  };
  const LEGS = {
    short: [
      ['.....PP..PP.....', '.....PP..PP.....', '.....BB..BB.....'],
      ['.....PP..PP.....', '....PP....PP....', '....BB....BB....'],
    ],
    robe: [['.....BB..BB.....'], ['....BB....BB....']],
  };

  PS.buildCharSprite = function (id, look) {
    const map = Object.assign({ S: 'c', H: '4', T: '8', U: '2', M: 's', A: 'e', C: '8', D: '2', P: '3', B: 'k' }, look.colors);
    const head = HEADS[look.head];
    const body = BODIES[look.body];
    const legs = look.body === 'robe' ? LEGS.robe : LEGS.short;
    const frames = legs.map((l) => sub(head.concat(body, l), map));
    return make('ch_' + id, frames, { kind: 'char' });
  };

  // ================= 敌人 =================
  function buildEnemies() {
    make('bat', [
      mir([
        '........', '........', '........', '.1......', '.11.....', '.111..i.', '.1111.ii', '..11iiii',
        '...1iivi', '....iiii', '.....ifi', '......ii', '........', '........', '........', '........',
      ]),
      mir([
        '........', '........', '........', '........', '........', '......i.', '......ii', '...11iii',
        '.1111ivi', '11111iii', '111..ifi', '11....ii', '1.......', '........', '........', '........',
      ]),
    ], { kind: 'enemy' });

    make('zombie', [[
      '................',
      '................',
      '......bbbb......',
      '.....bbbbbb.....',
      '.....b0bb0b.....',
      '.....bbbbbb.....',
      '.....bb00bb.....',
      '......bbbb......',
      '....rrrrrrbbbbb.',
      '....rrrrrr......',
      '....rrrrrrbbbbb.',
      '.....rrrrr......',
      '......2222......',
      '.....22..22.....',
      '.....22..22.....',
      '.....kk..kk.....',
    ]], { kind: 'enemy' });

    make('skeleton', [mir([
      '........', '........', '.....lll', '....llll', '....l00l', '....llll', '.....l0l', '......ll',
      '...lllll', '..l..l0l', '..l.llll', '..l..l0l', '....llll', '.....l..', '.....l..', '....ll..',
    ])], { kind: 'enemy' });

    make('ghost', [mir([
      '........', '........', '......ff', '....ffff', '...fffff', '...f00ff', '...f00ff', '..ffffff',
      '..fffff0', '..ffffff', '.qffffff', '.qqfffff', 'qqqqffff', 'qq.qqq.q', 'q...q...', '........',
    ])], { kind: 'enemy' });

    make('slime', [padTop(mir([
      '......bb', '....bbbb', '...bubbb', '..bubbbb', '..bbb0bb', '.bbbb0bb', '.bbbbbbb', '.5bbbbbb', '..555555', '........',
    ]), 16)], { kind: 'enemy' });

    make('minislime', [mir(['....', '....', '..bb', '.bub', 'bb0b', 'bbbb', '5bbb', '.555'])], { kind: 'enemy' });

    make('mummy', [mir([
      '........', '........', '.....lll', '....laal', '....la6l', '....llll', '.....all', '...lllla',
      '..lalall', '..l.llal', '..a.alll', '....llal', '....alla', '....ll..', '....al..', '....ll..',
    ])], { kind: 'enemy' });

    make('werewolf', [[
      '................',
      '.........4..4...',
      '........44444...',
      '........44e4444.',
      '........4444440.',
      '.........4ff4...',
      '....rrrr4444....',
      '...rr4444444....',
      '..rr444444444...',
      '..r4.4444..44...',
      '..r4.4444...ff..',
      '....44444.......',
      '....4444........',
      '....44..44......',
      '...44....44.....',
      '..kk......kk....',
    ]], { kind: 'enemy' });

    make('eye', [mir([
      '........', '........', '........', '......ff', '....ffff', '...fffff', '..fff888', '..ff8800',
      '.6ff8800', '..ff6888', '..ffffff', '...fffff', '....ffff', '......6f', '.....6..', '........',
    ])], { kind: 'enemy' });

    make('mushroom', [mir([
      '........', '........', '........', '......66', '....6666', '...66f66', '..666666', '.6f66666',
      '.6666666', '..111111', '....llll', '....l0ll', '....llll', '...lllll', '...44.44', '........',
    ])], { kind: 'enemy' });

    make('spider', [mir([
      '........', '........', '........', '........', '.3......', '..3..333', '...33333', '3...3333',
      '.333v3v3', '...33333', '.33.3333', '3..33333', '..3.3333', '.3...333', '3.....3.', '........',
    ])], { kind: 'enemy' });

    make('knight', [mir([
      '.......6', '......66', '.....777', '....7777', '....7000', '....70v0', '....7777', '..773333',
      '..737333', '..3.3a33', '..3.3333', '..a.3a33', '....3333', '....33..', '....33..', '...333..',
    ])], { kind: 'enemy' });

    make('demon', [mir([
      '........', '....l...', '....ll..', '.....ljj', '1...jjjj', '11..jejj', '111.jjjj', '1111jjj0',
      '11116jjj', '.1.66jjj', '...6jjjj', '...jjjjj', '....jj.j', '....jj..', '...jj...', '...k....',
    ])], { kind: 'enemy' });

    make('golem', [mir([
      '........', '....3777', '...77777', '...7aa77', '...77d77', '...77777', '.3777777', '377aa777',
      '7777b777', '777.7777', '77..7a77', '7a..7777', '....7777', '...777.7', '...77...', '..777...',
    ])], { kind: 'enemy' });

    make('imp', [mir([
      '........', '........', '........', '........', '.......e', '......me', '.....mm9', '....m999',
      '....66n6', '...66666', '..6.6666', '....6666', '.....6..', '.....6..', '....66..', '........',
    ])], { kind: 'enemy' });
  }

  // ================= Boss（32x32，左右对称） =================
  function buildBosses() {
    make('b_slime', [padTop(mir([
      '................', '................', '..........e....e', '..........ee..ee', '..........eeeeee',
      '..........e6ee8e', '..........eeeeee', '........bbbbbbbb', '......bbbbbbbbbb', '.....bbuubbbbbbb',
      '....bbuubbbbbbbb', '...bbubbbbbbbbbb', '...bubbbbbbbbbbb', '..bbubbbbbbbbbbb', '..bbbbbbbb00bbbb',
      '.bbbbbbbb0000bbb', '.bbbbbbbb00g0bbb', '.bbbbbbbbb00bbbb', '.bbbbbbbbbbbbbbb', 'bbbbbbbbbbbbbbbb',
      'bbbbbbbbbbb0bbbb', 'bbbbbbbbbbbb0000', 'bbbbbbbbbbbbbbbb', 'bbbbbbbbbbbbbbbb', '5bbbbbbbbbbbbbbb',
      '55bbbbbbbbbbbbbb', '.55bbbbbbbbbbbbb', '..555bbbbbbbbbbb', '...5555555555555', '.....55555555555',
    ]), 32)], { kind: 'enemy' });

    make('b_lich', [mir([
      '................', '............e..e', '............eeee', '............e6ee', '...........lllll',
      '..........llllll', '..........llllll', '..........ll0vll', '..........ll00ll', '...pp.....llllll',
      '..phhp.....l0l0l', '...pp.......llll', '...ll.....iiiiii', '...lii...iihhhhh', '....iii.iihhhhhe',
      '.....iiiihhhhhhe', '......iihhhhhhhe', '.......ihhhhhhhe', '.......ihhhhhhhe', '......iihhhhhhhe',
      '......ihhhhhhhhe', '.....iihhhhhhhhe', '.....ihhhhhhhhhe', '....iihhhhhhhhhe', '....ihhhhhhhhhhe',
      '...iihhhhhhhhhhe', '...ihhhhhhhhhhhe', '..iihhhhhhhhhhhe', '..ihh.hhhh.hhhhe', '..ih...hh...hhhe',
      '..i.....h....hhe', '................',
    ])], { kind: 'enemy' });

    make('b_vampire', [mir([
      '................', '................', '............kkkk', '...........kkkkk', '..........kkkkkk',
      '.......j..kkfffk', '.......jj.kfffff', '.......jj.kfvvff', '.......jjjkfffff', '.......jjjjffff0',
      '......tjjjjjffgf', '.....ttjjjj33fff', '....ttj6j33333fv', '...ttj66j333333f', '..ttj666j333333f',
      '.ttj6666j333333f', 'ttj66666j333333f', 'tj666666j333333f', 'tj666666j3333333', 'tj666666j3333333',
      'tj666666j3333333', 'tj66666jj3333333', 'tj66666j.3333333', 'tj6666jj...33333', 'tj6666j....33333',
      'tj666jj....33333', 'tj666j.....33333', 'tj66jj......3333', 'tj6jj.......3333', 'tjjj........kkkk',
      'tj.........kkkkk', '................',
    ])], { kind: 'enemy' });

    make('b_treant', [mir([
      '..........5555..', '.......555bb5555', '.....55bbbbbb5bb', '....5bbbubbbbbbb', '...5bbubbbbb5bbb',
      '..5bbbbbbbbbbbb5', '..5bbbbb5bbbbbbb', '.5bbbubbbbbbbubb', '.5bbbbbbbbbbbbbb', '.55bbbbbbb5bbbbb',
      '..55bb5bbbbbbbbb', '...555bbbb555bbb', '....x5555xx45555', '.....x...x4444xx', '.......xx444444x',
      '........x4444444', '........x44e4444', '........x4e0e444', '........x44e4444', '........x4444444',
      '........x44444k4', '........x4444kkk', '........x4444k6k', '........x44444kk', '........x4444444',
      '.......xx4444444', '......xx44444444', '.....xx4x4444444', '....xx4x.x444444', '...xx4x...x44444',
      '..xx.x.....x4444', '..x.........x444',
    ])], { kind: 'enemy' });

    make('b_demon', [mir([
      '...l............', '...ll...........', '....ll......jjjj', '.....ll...jjjjjj', '......lljjjjjjjj',
      '.......ljjjjjjjj', '1.......jj6jjjjj', '11......jnejjjjj', '111.....jjjjjjjj', '1111....jjjjjj0j',
      '11111....jj0000g', '111111...jjjjjjj', '1111111.jjjjjjjj', '11111116666jjjjj', '1111.1666666jjjj',
      '111..166666666jj', '11...66666666666', '1....6666666666j', '.....j666666666j', '.....jj66666666j',
      '......jjjjjjjjjj', '.......jjjjjjjjj', '.......jjjjj.jjj', '......jjjjj...jj', '......jjjj....jj',
      '.....jjjj.....jj', '.....jjj......jj', '....jjj........j', '....kkk.........', '...kkkk.........',
      '................', '................',
    ])], { kind: 'enemy' });

    make('b_reaper', [mir([
      '................', '...........ttttt', '.........ttttttt', '........tttttttt', '.......ttt333333',
      '.......tt3llllll', '......tt3lllllll', '......tt3ll00lll', '......tt3l0vv0ll', '......tt3ll00lll',
      '......tt3lllllll', '......ttt3ll0l0l', '.....tttt33lllll', '.....ttttt333333', '....ttttttttt333',
      '...ttt3tttttt333', '..tttl3ttttttt33', '..ttll3tttttttt3', '..tt.l3ttttttttt', '..tt..3ttttttttt',
      '.ttt..3ttttttttt', '.tt...3ttttttttt', '.tt...3ttttttttt', '.tt..33ttttttttt', '.t...3tttttttttt',
      '.t...3tttttttttt', '.....3tttttttttt', '....3ttt.ttttttt', '....3tt...tttt.t', '...3t.t...t.tt..',
      '...3..t.....t...', '................',
    ])], { kind: 'enemy' });
  }

  // ================= 拾取物、障碍物、投射物、图标 =================
  function buildMisc() {
    const gem = mir(['..Y', '.YX', 'YXX', 'YXX', 'XXZ', '.XZ', '..Z']);
    make('gem_b', [sub(gem, { Y: 'q', X: '8', Z: '2' })]);
    make('gem_g', [sub(gem, { Y: 'u', X: 'b', Z: '5' })]);
    make('gem_r', [sub(gem, { Y: 'p', X: '6', Z: 'j' })]);
    make('gem_big', [sub(mir(['...Y', '..YX', '.YXX', 'YXXX', 'YXXX', 'XXXZ', '.XXZ', '..XZ', '...Z']), { Y: 'p', X: 'v', Z: 'j' })]);

    make('coin', [mir(['..ee', '.enn', 'enee', 'en9e', 'en9e', 'enee', '.e99', '..99'])]);
    make('bag', [mir(['..4.4', '...44', '..eee', '.eenn', 'eenee', 'en9ee', 'en9e9', 'eee99', '.e999', '..999'])]);
    make('chicken', [[
      '....999.....',
      '..99mm99....',
      '.9mmnmm99...',
      '.9mnmmmm9...',
      '.9mmmmmm9...',
      '..9mmmm9l...',
      '...999.lll..',
      '........lll.',
      '........l.l.',
    ]]);
    make('magnet', [mir(['..666', '.6666', '66...', '66...', '66...', '66...', '66...', 'ss...', 'ss...'])]);
    make('rosary', [mir(['...n', '...e', '...e', '.nee', 'eeee', '...e', '...e', '...e', '...e', '...e'])]);
    make('clock', [mir(['4444', '.qqq', '.qee', '..qe', '...q', '...q', '..qe', '.qee', '.eee', '4444'])]);
    make('chest', [mir([
      '..xxxxxx', '.x444444', 'x4r44444', 'x4444444', 'xeeeeeee', 'x44444ne', 'x44444e0',
      'x44444ee', 'x4444444', 'x4r44444', 'xeeeeeee', 'x4444444', '.xxxxxxx',
    ])]);
    make('chest_boss', [sub(mir([
      '..xxxxxx', '.x444444', 'x4r44444', 'x4444444', 'xeeeeeee', 'x44444ne', 'x44444e0',
      'x44444ee', 'x4444444', 'x4r44444', 'xeeeeeee', 'x4444444', '.xxxxxxx',
    ]), { '4': 'h', r: 'p', x: 'i' })]);
    make('skull', [mir(['.lll', 'llll', 'l00l', 'llll', '.l0l', '..ll'])]);

    // 火盆（可破坏）两帧火焰
    const brazierBase = ['.7777', '.3333', '..3a3', '...33', '...33', '...33', '..333', '.3333'];
    make('brazier', [
      mir(['.....', '....9', '...9m', '..9mn', '..9nn'].concat(brazierBase)),
      mir(['....9', '...9m', '...mn', '..9mn', '..mnn'].concat(brazierBase)),
    ]);

    // 障碍物
    make('tomb', [mir([
      '...777', '..7aaa', '.7aaaa', '.7aaa3', '.7aa33', '.7aaa3', '.7aaa3', '.7aaaa',
      '.7aaaa', '.7a7aa', '.7aaaa', '777777',
    ])]);
    make('tomb2', [mir([
      '....77', '....7a', '....7a', '.7777a', '.7aaaa', '.7777a', '....7a', '....7a', '....7a', '...777',
    ])]);
    make('deadtree', [[
      '....1.....1.....',
      '.....1...1..1...',
      '..1...1.1..1....',
      '...1..111.1.....',
      '....1..11.......',
      '.....1.11..11...',
      '......111.1.....',
      '.......111......',
      '.......11.......',
      '.......11.......',
      '.......11.......',
      '......111.......',
      '......111.......',
      '.....11111......',
      '....111.111.....',
    ]]);
    make('pine', [mir([
      '.......5', '......55', '.....555', '....5b55', '.....555', '....5555', '...5b555', '..555555',
      '....5555', '...55555', '..5b5555', '.5555555', '...55555', '..555555', '.5b55555', '55555555',
      'o5555555', '.ooooooo', '......x4', '......x4', '......x4', '.....xxx',
    ])]);
    make('bush', [mir(['...555', '..5b55', '.5bb55', '5bub55', '5bbbb5', '55bb55', '.55555'])]);
    make('rock', [mir(['...777', '..7aa7', '.7aaa7', '7a7777', '7a7777', '777773', '.33333'])]);
    make('pillar', [mir([
      '777777', '7aaaaa', '333333', '.7aaaa', '.7a7aa', '.7a7aa', '.7a7aa', '.7a7aa', '.7a7aa', '.7a7aa',
      '.7a7aa', '.7a7aa', '.7a7aa', '.7a7aa', '.7aaaa', '333333', '7aaaaa', '777777',
    ])]);
    make('lavarock', [sub(mir(['...777', '..7aa7', '.7a9a7', '7a7m77', '7a7977', '777773', '.33333']), {})]);
    make('bones', [[
      '..l.....l.',
      '.lll...ll.',
      '..llllll..',
      '.ll...lll.',
      '.l.....l..',
    ]]);

    // 投射物
    make('p_knife', [['4.ssssss..', '44sssssssg', '4.ssssss..']]);
    make('p_axe', [[
      '......sss...',
      '.....saaas..',
      '....saaaaas.',
      '....saaa4as.',
      '.....sa4aas.',
      '......4sss..',
      '.....4......',
      '....4.......',
      '...4........',
      '..4.........',
      '.4..........',
      'k...........',
    ]]);
    make('p_cross', [mirOdd(['....e', '...en', '...en', '.eeen', 'ennnn', '.eeen', '...en', '...en', '....e'])]);
    make('p_book', [[
      '.jjjjjjjj.',
      'j66666666f',
      'j6666e666f',
      'j666eee66f',
      'j6666e666f',
      'j6666e666f',
      'j66666666f',
      'j66666666f',
      'jjjjjjjjjf',
      '.ffffffff.',
    ]]);
    make('p_flask', [mirOdd(['..44', '...q', '..qd', '.q8d', 'q888', 'q8d8', 'q888', '.q88', '..qq'])]);
    make('p_fire', [mir(['..99', '.9mm', '9mmn', '9mne', '9mne', '9mmn', '.9mm', '..99'])]);
    make('p_fire2', [mir(['...999', '..9mmm', '.9mmnn', '9mmnne', '9mnnee', '9mnneg', '9mnneg', '9mnnee', '9mmnne', '.9mmnn', '..9mmm', '...999'])]);
    make('p_rune', [mirOdd(['....d', '...dq', '..dqq', '.dqgq', 'dqggg', '.dqgq', '..dqq', '...dq', '....d'])]);
    make('p_bolt', [mirOdd(['..d', '.dq', 'dqg', '.dq', '..d'])]);
    make('p_bolt2', [mirOdd(['...e', '..en', '.eng', 'engg', '.eng', '..en', '...e'])]);
    const eb = mirOdd(['.hh', 'hpp', 'hpg', 'hpp', '.hh']);
    make('eb_purple', [eb]);
    make('eb_fire', [sub(eb, { h: '9', p: 'm', g: 'n' })]);
    make('eb_green', [sub(eb, { h: '5', p: 'b', g: 'u' })]);
    make('eb_red', [sub(eb, { h: 'j', p: '6', g: 'p' })]);

    // 武器图标
    make('i_whip', [[
      '................',
      '.........rrrr...',
      '.......rr....r..',
      '......r.......r.',
      '.....r........r.',
      '.....r.......r..',
      '.....r......r...',
      '......r.....r...',
      '.......r...r....',
      '........rrr.....',
      '.......44.......',
      '......44........',
      '.....44.........',
      '....k4..........',
      '...kk...........',
      '................',
    ]]);
    make('i_wand', [[
      '................',
      '...........e....',
      '..........ene...',
      '.........ennne..',
      '..........ene...',
      '.........4.e....',
      '........44......',
      '.......44.......',
      '......44........',
      '.....44.........',
      '....44..........',
      '...44...........',
      '..h4............',
      '..hh............',
      '................',
      '................',
    ]]);
    make('i_knife', [[
      '................',
      '............ss..',
      '...........sgs..',
      '..........sgs...',
      '.........sgs....',
      '........sgs.....',
      '.......sgs......',
      '......sgs.......',
      '....e.ss........',
      '....eee.........',
      '...44e.e........',
      '..44............',
      '.k4.............',
      '.kk.............',
      '................',
      '................',
    ]]);
    make('i_fire', [[
      '................',
      '..........m.....',
      '.........mem....',
      '........mennm...',
      '.........mnm....',
      '........j.m.....',
      '.......jj.......',
      '......jj........',
      '.....jj.........',
      '....jj..........',
      '...jj...........',
      '..jj............',
      '..e.............',
      '................',
      '................',
      '................',
    ]]);
    make('i_bolt', [[
      '................',
      '.........eee....',
      '........enn.....',
      '.......enn......',
      '......enn.......',
      '.....ennnnee....',
      '.........ne.....',
      '........ne......',
      '.......ne.......',
      '......ne........',
      '.....e..........',
      '................',
    ]]);
    make('i_frost', [mirOdd(['q...d', '.q..d', '..q.d', '...qd', 'ddddg', '...qd', '..q.d', '.q..d', 'q...d'])]);
    make('i_garlic', [mir(['.....l', '.....l', '....ll', '...fff', '..ffff', '.fflff', 'fflfff', 'fflfff', 'fflfff', '.fflff', '..ffff', '...a.a'])]);

    // 被动道具图标
    make('i_spinach', [[
      '........55..',
      '......55bb5.',
      '.....5bbub5.',
      '....5bbub5..',
      '...5bbub5...',
      '..5bbub5....',
      '..5bub5.....',
      '.5bub5......',
      '.5ub5.......',
      '.555........',
      '5...........',
    ]]);
    make('i_armor', [mir(['.ss...', 'ssas..', 'saaass', 'saaaaa', 'saaaaa', '.saaa7', '.saaaa', '.saaa7', '..saaa', '..ssss'])]);
    make('i_heart', [mir(['.666..', '66pp6.', '6pp666', '6p6666', '666666', '.66666', '..6666', '...666', '....66'])]);
    make('i_hollow', [mir(['.666..', '6jjj6.', '6j666j', '6j6..6', '6j6...', '.6j...', '..6j..', '...6j.', '....6j'])]);
    make('i_tomato', [mir(['.....b', '...5bb', '.6665b', '666666', '6p6666', '6p6666', '666666', '666666', '.66666', '..6666'])]);
    make('i_tome', [sub([
      '.2222222222.',
      '28888888888f',
      '2888ffff888f',
      '2888888f888f',
      '28888ff8888f',
      '28888f88888f',
      '28888888888f',
      '28888f88888f',
      '22222222222f',
      '.ffffffffff.',
    ], {})]);
    make('i_candle', [mir(['.m...m', '.n...n', '.f...f', '.f...f', '.e...e', '.eeeee', '.....e', '.....e', '....ee', '..eeee'])]);
    make('i_bracer', [[
      '....s.s.s...',
      '...sasasas..',
      '...saaaaas..',
      '...saaaaas..',
      's..saaaaas..',
      'sa.saaaaas..',
      '.sasaaaaas..',
      '..saaaaas...',
      '...4444.....',
      '...4ee4.....',
      '...4444.....',
    ]]);
    make('i_scroll', [[
      '.4wwwwwwww4.',
      '44wwwwwwww44',
      '.4w3333w3w4.',
      '..wwwwwwww..',
      '..w33w333w..',
      '..wwwwwwww..',
      '..w333w33w..',
      '.4wwwwwwww4.',
      '44wwwwwwww44',
      '.4wwwwwwww4.',
    ]]);
    make('i_dup', [[
      '..eee.......',
      '.e...e......',
      'e.....e.....',
      'e...ssss....',
      'e..s.e..s...',
      '.e.s.e..s...',
      '..eseee.s...',
      '...s....s...',
      '...s....s...',
      '....ssss....',
    ]]);
    make('i_wings', [[
      '.........ff.',
      '.......fffg.',
      '.....ffffff.',
      '...fffffqf..',
      '..ffffqqf...',
      '.fffqqff....',
      '.ffqfff.....',
      'ffqff.......',
      'fqff........',
      'ff..........',
    ]]);
    make('i_orb', [[
      '...2222...',
      '.22888822.',
      '.28qq8882.',
      '28qg888882',
      '28q8888882',
      '2888888y82',
      '288888yy82',
      '.2888yy82.',
      '.22888822.',
      '...2222...',
    ]]);
    make('i_clover', [mir(['.bbb..', 'bubbb.', 'bbbbb.', '.bbb5.', '...55.', '.bbb5.', 'bbbbb.', 'bubbb.', '.bbb..', '.....5', '....5.'])]);
    make('i_crown', [mir(['e....e', 'ee..ee', 'eeeeee', 'e6ee8e', 'eeeeee', '999999'])]);
    // 商店专用图标
    make('i_ankh', [mirOdd(['..ee', '.e..', '.e..', '..ee', 'eeee', '...e', '...e', '...e', '...e'])]);
    make('i_dice', [[
      'ffffffffff',
      'f0ffffff0f',
      'ffffffffff',
      'ffff00ffff',
      'ffff00ffff',
      'ffffffffff',
      'f0ffffff0f',
      'ffffffffff',
    ]]);
    make('i_skip', [[
      '..8.....8.....',
      '..88....88....',
      '..888...888...',
      '..8888..8888..',
      '..888...888...',
      '..88....88....',
      '..8.....8.....',
    ]]);
    make('i_banish', [[
      '66......66',
      '666....666',
      '.666..666.',
      '..666666..',
      '...6666...',
      '..666666..',
      '.666..666.',
      '666....666',
      '66......66',
    ]]);
    make('i_hp', [mir(['......', '..66..', '..66..', '666666', '666666', '..66..', '..66..'])]);

    // 进化武器图标（基础图标换色）
    const evoIcon = (name, base, map) => make(name, [sub(SPR[base].rows, map)]);
    evoIcon('i_bloodwhip', 'i_whip', { r: '6', '4': 'j', k: '1' });
    evoIcon('i_holywand', 'i_wand', { '4': 'e', h: 'f', e: 'd', n: 'g' });
    evoIcon('i_thousand', 'i_knife', { s: 'e', g: 'n', '4': 'j' });
    evoIcon('i_spiral', 'p_axe', { s: 'h', a: 'i', '4': 'k' });
    evoIcon('i_heaven', 'p_cross', { e: 'd', n: 'q' });
    evoIcon('i_sanctum', 'p_flask', { '8': 'h', d: 'p', q: 'h' });
    evoIcon('i_souleater', 'i_garlic', { f: 'h', l: 'i', a: 'p' });
    evoIcon('i_vespers', 'p_book', { j: '1', '6': 'i', e: 'v' });
    evoIcon('i_storm', 'i_bolt', { e: 'd', n: 'q' });
    evoIcon('i_hellfire', 'i_fire', { j: 'k', m: 'v', e: '6', n: 'm' });
    evoIcon('i_zero', 'i_frost', { q: 'g', d: '8' });
    evoIcon('i_void', 'p_rune', { d: 'h', q: 'p', g: 'f' });
  }

  // ================= 像素数字（伤害飘字） =================
  const DIGITS = {
    '0': ['111', '101', '101', '101', '111'],
    '1': ['010', '110', '010', '010', '111'],
    '2': ['111', '001', '111', '100', '111'],
    '3': ['111', '001', '011', '001', '111'],
    '4': ['101', '101', '111', '001', '001'],
    '5': ['111', '100', '111', '001', '111'],
    '6': ['111', '100', '111', '101', '111'],
    '7': ['111', '001', '010', '010', '010'],
    '8': ['111', '101', '111', '101', '111'],
    '9': ['111', '101', '111', '001', '111'],
    '+': ['000', '010', '111', '010', '000'],
  };
  PS.DIG = {};
  function buildDigits() {
    const cols = { w: 'g', y: 'e', r: 'v', g: 'u' };
    for (const cn in cols) {
      PS.DIG[cn] = {};
      for (const ch in DIGITS) {
        const rows = DIGITS[ch].map((r) => r.replace(/1/g, cols[cn]).replace(/0/g, '.'));
        PS.DIG[cn][ch] = rowsToCanvas(rows, PAL['0']);
      }
    }
  }

  // ================= 像素圆缓存 =================
  const circCache = new Map();
  // kind: fill | ring | dither
  PS.circle = function (r, color, kind) {
    r = Math.max(1, Math.round(r));
    const key = kind + '|' + r + '|' + color;
    let c = circCache.get(key);
    if (c) return c;
    const s = r * 2 + 1;
    c = mk(s, s);
    const x = c.getContext('2d');
    // 直接写像素数据，避免逐像素 fillRect（大半径时会造成卡顿）
    const img = x.createImageData(s, s);
    const d = img.data;
    const rgb = color[0] === '#' ? hexRgb(color) : [255, 255, 255];
    const r2 = (r + 0.5) * (r + 0.5), ri2 = (r - 1.0) * (r - 1.0);
    for (let yy = 0; yy < s; yy++) {
      const dy = yy - r;
      for (let xx = 0; xx < s; xx++) {
        const dx = xx - r, d2 = dx * dx + dy * dy;
        if (d2 > r2) continue;
        if (kind === 'ring' && d2 < ri2) continue;
        if (kind === 'dither' && (xx + yy) % 2 !== 0 && d2 < ri2) continue;
        const i = (yy * s + xx) * 4;
        d[i] = rgb[0];
        d[i + 1] = rgb[1];
        d[i + 2] = rgb[2];
        d[i + 3] = 255;
      }
    }
    x.putImageData(img, 0, 0);
    if (circCache.size > 2000) circCache.clear();
    circCache.set(key, c);
    return c;
  };

  // 影子
  PS.shadow = function (w) {
    w = Math.max(4, Math.round(w));
    const key = 'shadow|' + w;
    let c = circCache.get(key);
    if (c) return c;
    const h = Math.max(2, Math.round(w / 3));
    c = mk(w, h);
    const x = c.getContext('2d');
    x.fillStyle = 'rgba(0,0,0,0.35)';
    for (let yy = 0; yy < h; yy++) {
      for (let xx = 0; xx < w; xx++) {
        const nx = (xx + 0.5 - w / 2) / (w / 2), ny = (yy + 0.5 - h / 2) / (h / 2);
        if (nx * nx + ny * ny <= 1) x.fillRect(xx, yy, 1, 1);
      }
    }
    circCache.set(key, c);
    return c;
  };

  // DOM 用图标（放大后的 dataURL）
  const urlCache = {};
  PS.iconURL = function (name, scale, frame) {
    scale = scale || 3;
    frame = frame || 0;
    const key = name + '|' + scale + '|' + frame;
    if (urlCache[key]) return urlCache[key];
    const spr = SPR[name];
    if (!spr) return '';
    const src = spr.frames[frame].n;
    const c = mk(src.width * scale, src.height * scale);
    const x = c.getContext('2d');
    x.imageSmoothingEnabled = false;
    x.drawImage(src, 0, 0, c.width, c.height);
    return (urlCache[key] = c.toDataURL());
  };
  PS.silhouetteURL = function (name, scale) {
    const key = 'sil|' + name + '|' + scale;
    if (urlCache[key]) return urlCache[key];
    const spr = SPR[name];
    if (!spr) return '';
    const sil = silhouette(spr.frames[0].n, '#4a4058');
    const c = mk(sil.width * scale, sil.height * scale);
    const x = c.getContext('2d');
    x.imageSmoothingEnabled = false;
    x.drawImage(sil, 0, 0, c.width, c.height);
    return (urlCache[key] = c.toDataURL());
  };

  PS.buildSprites = function () {
    buildEnemies();
    buildBosses();
    buildMisc();
    buildDigits();
  };
})();
