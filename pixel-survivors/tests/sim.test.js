// 长时间稳定性 / 不变量测试：AI 机器人在每个关卡、多个角色下完整游玩（快进），
// 每 5 秒检查一次数值合法性，并打印各局的进程与平衡数据。
// 运行：node tests/sim.test.js [每组局数=1] [是否满级局外强化=0/1]
'use strict';
const { chromium } = require('playwright');
const path = require('path');

const URL = 'file://' + path.resolve(__dirname, '..', 'index.html');
const RUNS = +(process.argv[2] || 1);
const META = process.argv[3] === '1';
const MATRIX = [
  ['knight', 'graveyard'], ['mage', 'graveyard'], ['priest', 'graveyard'], ['rogue', 'graveyard'],
  ['woodcutter', 'forest'], ['nun', 'forest'], ['alchemist', 'forest'],
  ['stormcaller', 'dungeon'], ['witch', 'dungeon'], ['pyromancer', 'dungeon'], ['runemaster', 'dungeon'], ['hunter', 'dungeon'],
];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(URL);
  await page.waitForTimeout(400);
  let failures = 0;
  const summary = [];
  for (const [ch, st] of MATRIX) {
    for (let r = 0; r < RUNS; r++) {
      const res = await page.evaluate(([ch, st, meta]) => {
        if (meta) for (const id in PS.DATA.meta) PS.save.data.meta[id] = PS.DATA.meta[id].max;
        else PS.save.data.meta = {};
        PS.debug.bot = true;
        const g = PS.app.startRun(ch, st);
        const bad = [];
        const fin = (v) => typeof v === 'number' && isFinite(v);
        const t0 = performance.now();
        let maxEn = 0, maxProj = 0, minHpPct = 1, lvAt5 = 0, lvAt10 = 0;
        while (g.time < 16.5 * 60) {
          const alive = PS.debug.simulate(5);
          maxEn = Math.max(maxEn, g.enemies.length);
          maxProj = Math.max(maxProj, g.projs.length);
          if (g.time > 600) minHpPct = Math.min(minHpPct, g.P.hp / g.P.maxHp);
          if (!lvAt5 && g.time >= 300) lvAt5 = g.level;
          if (!lvAt10 && g.time >= 600) lvAt10 = g.level;
          // 不变量
          if (!fin(g.P.x) || !fin(g.P.y) || g.P.x < 0 || g.P.y < 0 || g.P.x > g.mapW || g.P.y > g.mapH) bad.push('玩家坐标非法');
          if (!fin(g.P.hp) || g.P.hp > g.P.maxHp + 1e-6) bad.push('玩家生命非法 ' + g.P.hp);
          if (g.enemies.some((e) => !fin(e.x) || !fin(e.y) || !fin(e.hp))) bad.push('敌人数值非法');
          if (g.enemies.length > PS.CONST.MAX_ENEMIES + 200) bad.push('敌人数量失控 ' + g.enemies.length);
          if (g.projs.length > 3000) bad.push('投射物数量失控 ' + g.projs.length);
          if (g.pickups.filter((p) => p.type === 'gem').length > PS.CONST.MAX_GEMS + 2) bad.push('宝石数量超过上限');
          if (g.weapons.length > 6 || g.passives.length > 6) bad.push('槽位溢出');
          if (g.weapons.some((w) => !w.def.evolved && w.level > w.def.maxLevel)) bad.push('武器等级溢出');
          if (g.passives.some((p) => p.level > p.def.max)) bad.push('道具等级溢出');
          if (PS.app.errors.length) bad.push('运行时错误 ' + PS.app.errors[0]);
          if (bad.length || !alive) break;
        }
        const out = {
          ch, st, t: Math.round(g.time), victory: g.victory, lv: g.level, lvAt5, lvAt10, kills: g.kills, gold: Math.round(g.gold),
          evos: g.run.evolutions, bosses: g.run.bossKills, maxEn, maxProj, minHpLate: g.time > 600 ? Math.round(minHpPct * 100) + '%' : '-',
          wallMs: Math.round(performance.now() - t0), bad: bad.slice(0, 3),
          weapons: g.weapons.map((w) => (w.def.evolved ? '★' : '') + w.def.name + ':' + Math.round(w.dmg / 1000) + 'k').join(' '),
        };
        if (PS.app.state === 'over') PS.app.toMenu();
        else { PS.app.gameOver({ quit: true }); PS.app.toMenu(); }
        return out;
      }, [ch, st, META]);
      if (res.bad.length) failures++;
      summary.push(res);
      console.log(`${res.bad.length ? '✗' : '✓'} ${ch}@${st} ${res.victory ? '胜利' : res.t >= 16.5 * 60 ? '超时' : '倒下'} ${Math.floor(res.t / 60)}:${String(res.t % 60).padStart(2, '0')} Lv${res.lv} (5分:Lv${res.lvAt5} 10分:Lv${res.lvAt10}) 击杀${res.kills} 进化${res.evos} Boss${res.bosses} 金币${res.gold} 最多敌人${res.maxEn} 最多投射物${res.maxProj} 后期最低血量${res.minHpLate} 用时${res.wallMs}ms ${res.bad.join(';')}`);
      console.log('    ' + res.weapons);
    }
  }
  const wins = summary.filter((s) => s.victory).length;
  const avgT = summary.reduce((a, s) => a + s.t, 0) / summary.length;
  console.log(`\n共 ${summary.length} 局：胜利 ${wins}，平均存活 ${Math.floor(avgT / 60)}分${Math.round(avgT % 60)}秒，异常 ${failures} 局`);
  if (errors.length) console.log('页面错误：', errors.slice(0, 5));
  await browser.close();
  process.exit(failures || errors.length ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
