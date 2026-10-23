// 界面与输入端到端测试：键盘 / 鼠标 / 手柄 / 存档 / 各个界面与弹窗
// 运行：node tests/ui.test.js   （需要 playwright，见 README）
'use strict';
const { chromium } = require('playwright');
const path = require('path');
const assert = require('assert');

const URL = 'file://' + path.resolve(__dirname, '..', 'index.html');
const wait = (p, ms) => p.waitForTimeout(ms);

// 注入一个可控的虚拟手柄
const FAKE_PAD = () => {
  const pad = {
    id: 'Fake Pad (STANDARD GAMEPAD)', index: 0, connected: true, mapping: 'standard', timestamp: 0,
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
  };
  window.__pad = pad;
  window.__padOn = false;
  navigator.getGamepads = () => (window.__padOn ? [pad, null, null, null] : [null, null, null, null]);
};

let passed = 0;
// 在页面中注册：清空敌人、停止刷怪并关闭升级弹窗，让需要精确操作的测试不受干扰
const CALM = () => {
  window.addEventListener('DOMContentLoaded', () => {
    PS.debug.calm = () => {
      const g = PS.app.game;
      g.updateSpawns = () => {};
      for (const e of g.enemies) e.dead = true;
      g.enemies.length = 0;
      g.bosses.length = 0;
      g.ebullets.length = 0;
      g.hazards.length = 0;
      g.pendingLevels = 0;
      g.xp = 0;
      if (PS.app.state !== 'play') PS.app.resume();
    };
  });
};
async function step(name, fn) {
  process.stdout.write('  · ' + name + ' ... ');
  await fn();
  passed++;
  console.log('OK');
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript(FAKE_PAD);
  await ctx.addInitScript(CALM);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const st = () => page.evaluate(() => PS.app.state);
  const screen = () => page.evaluate(() => PS.ui.name);
  const focusAct = () => page.evaluate(() => PS.ui.focusEl && PS.ui.focusEl.dataset.act);

  console.log('UI 测试');
  await page.goto(URL);
  await wait(page, 500);

  await step('启动后无错误、精灵无警告、进入标题界面', async () => {
    assert.deepStrictEqual(await page.evaluate(() => PS.spriteWarnings), []);
    assert.strictEqual(await st(), 'menu');
    assert.strictEqual(await screen(), 'title');
    assert.strictEqual(await focusAct(), 'start');
  });

  await step('键盘导航：方向键移动焦点，ESC 返回', async () => {
    await page.keyboard.press('ArrowDown');
    assert.strictEqual(await focusAct(), 'shop');
    await page.keyboard.press('KeyS');
    assert.strictEqual(await focusAct(), 'collection');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Enter');
    assert.strictEqual(await screen(), 'shop');
    await page.keyboard.press('Escape');
    assert.strictEqual(await screen(), 'title');
  });

  await step('商店：购买强化扣除金币，金币不足时拒绝', async () => {
    await page.evaluate(() => { PS.save.data.gold = 1000; PS.ui.show('shop'); });
    const before = await page.evaluate(() => PS.save.data.gold);
    await page.keyboard.press('Enter'); // 第一项：力量
    const after = await page.evaluate(() => ({ g: PS.save.data.gold, r: PS.save.metaRank('might') }));
    assert.strictEqual(after.r, 1);
    assert.ok(after.g < before);
    await page.evaluate(() => { PS.save.data.gold = 0; });
    await page.keyboard.press('Enter');
    assert.strictEqual(await page.evaluate(() => PS.save.metaRank('might')), 1);
    // 退款
    await page.evaluate(() => PS.ui.show('shop'));
    await page.evaluate(() => PS.ui.focus(document.querySelector('[data-act="refund"]')));
    await page.keyboard.press('Enter');
    assert.strictEqual(await screen(), 'confirm');
    await page.evaluate(() => PS.ui.focus(document.querySelector('[data-act="yes"]')));
    await page.keyboard.press('Enter');
    assert.strictEqual(await page.evaluate(() => PS.save.metaRank('might')), 0);
    assert.ok((await page.evaluate(() => PS.save.data.gold)) >= 200);
    await page.keyboard.press('Escape');
  });

  await step('图鉴：切换页签与查看详情', async () => {
    await page.evaluate(() => PS.ui.show('collection', { tab: 'weapons' }));
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    assert.strictEqual(await page.evaluate(() => PS.ui.params.tab), 'passives');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    assert.strictEqual(await page.evaluate(() => PS.ui.params.tab), 'enemies');
    await page.keyboard.press('ArrowDown');
    assert.ok((await page.evaluate(() => document.querySelector('#detail').textContent.length)) > 0);
    await page.keyboard.press('Escape');
    assert.strictEqual(await screen(), 'title');
  });

  await step('设置：调节音量与开关并持久化', async () => {
    await page.evaluate(() => PS.ui.show('settings', { from: 'title' }));
    const m0 = await page.evaluate(() => PS.save.data.settings.music);
    await page.keyboard.press('ArrowLeft');
    const m1 = await page.evaluate(() => PS.save.data.settings.music);
    assert.ok(Math.abs(m1 - (m0 - 0.1)) < 1e-6);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    assert.strictEqual(await page.evaluate(() => PS.save.data.settings.shake), false);
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('pixelSurvivors.save.v1')).settings);
    assert.strictEqual(stored.shake, false);
    await page.keyboard.press('Enter');
    await page.keyboard.press('Escape');
  });

  await step('锁定角色无法选择', async () => {
    await page.evaluate(() => PS.ui.show('chars'));
    await page.evaluate(() => PS.ui.focus(document.querySelector('[data-id="hunter"]')));
    await page.keyboard.press('Enter');
    assert.strictEqual(await screen(), 'chars');
    assert.ok((await page.evaluate(() => document.querySelector('#detail').textContent)).includes('解锁条件'));
    await page.keyboard.press('Escape');
  });

  await step('键盘开始游戏：标题 → 角色 → 关卡 → 对局', async () => {
    await page.evaluate(() => PS.ui.show('title'));
    await page.keyboard.press('Enter');
    assert.strictEqual(await screen(), 'chars');
    await page.keyboard.press('ArrowRight'); // 伊梦娜
    await page.keyboard.press('Enter');
    assert.strictEqual(await screen(), 'stages');
    await page.keyboard.press('Enter');
    assert.strictEqual(await st(), 'play');
    assert.strictEqual(await page.evaluate(() => PS.app.game.charId), 'mage');
  });

  await step('键盘 WASD 移动角色', async () => {
    const x0 = await page.evaluate(() => PS.app.game.P.x);
    await page.keyboard.down('KeyD');
    await wait(page, 500);
    await page.keyboard.up('KeyD');
    const x1 = await page.evaluate(() => PS.app.game.P.x);
    assert.ok(x1 - x0 > 15, 'moved ' + (x1 - x0));
  });

  await step('冲刺：Shift 冲刺消耗体力、冲刺中无敌、体力不足时无法冲刺', async () => {
    await page.evaluate(() => { PS.debug.calm(); const g = PS.app.game; g.P.sta = 100; g.P.dashCd = 0; });
    const x0 = await page.evaluate(() => PS.app.game.P.x);
    await page.keyboard.down('KeyA');
    await page.keyboard.press('ShiftLeft');
    await wait(page, 60);
    const mid = await page.evaluate(() => { const g = PS.app.game; const hp = g.P.hp; g.hurtPlayer(50, 'test'); return { inv: g.P.hp === hp, sta: g.P.sta }; });
    await wait(page, 300);
    await page.keyboard.up('KeyA');
    const x1 = await page.evaluate(() => PS.app.game.P.x);
    assert.ok(mid.inv, '冲刺中应当无敌');
    assert.ok(mid.sta <= 71, 'stamina ' + mid.sta);
    assert.ok(x0 - x1 > 60, 'dash moved ' + (x0 - x1));
    await page.evaluate(() => { const g = PS.app.game; g.P.sta = 10; g.P.dashCd = 0; g.P.dashT = 0; });
    const x2 = await page.evaluate(() => PS.app.game.P.x);
    await page.keyboard.press('ShiftLeft');
    await wait(page, 200);
    assert.ok(Math.abs((await page.evaluate(() => PS.app.game.P.x)) - x2) < 5);
    await page.evaluate(() => { PS.app.game.P.sta = 100; });
  });

  await step('经验宝石：移动中也会被直接吸取，不会绕着角色转圈', async () => {
    const r = await page.evaluate(() => {
      const g = PS.app.game;
      g.pickups.length = 0;
      g.gemCount = 0;
      const P = g.P;
      const mine = [];
      for (let i = 0; i < 12; i++) { const a = (i / 12) * 6.28; mine.push(g.addPickup('gem', P.x + Math.cos(a) * 30, P.y + Math.sin(a) * 30, 0.01)); }
      let t = 0;
      while (mine.some((q) => !q.dead) && t < 3) { g.update(1 / 60, { x: Math.cos(t * 3), y: Math.sin(t * 3) }); t += 1 / 60; }
      g.pendingLevels = 0;
      return { left: mine.filter((q) => !q.dead).length, t };
    });
    assert.strictEqual(r.left, 0, '仍有 ' + r.left + ' 颗宝石未被吸取');
    assert.ok(r.t < 1, 'took ' + r.t);
  });

  await step('自动瞄准：魔杖 / 十字 / 火球 / 飞刀 首发命中最近的敌人', async () => {
    const res = await page.evaluate(() => {
      const out = {};
      const saved = PS.app.game;
      for (const wid of ['wand', 'cross', 'firewand', 'knife']) {
        let ok = 0;
        for (let k = 0; k < 6; k++) {
          const g = new PS.Game('mage', 'graveyard');
          g.updateSpawns = () => {};
          g.braziers.length = 0;
          g.weapons.length = 0;
          g.addWeapon(wid).cd = 0.05;
          const P = g.P;
          for (let i = 0; i < 6; i++) {
            const a = Math.random() * 6.28, d = 70 + Math.random() * 150;
            const e = g.spawnEnemy('zombie', P.x + Math.cos(a) * d, P.y + Math.sin(a) * d, { force: true });
            e.hp = e.maxHp = 1e9;
            e.spd = 0;
          }
          // 敌人生成后会被分离推挤，因此在每帧开火前重新计算最近的敌人
          // 记录第一次命中那一帧受伤的全部敌人（火球爆炸会同时波及相邻敌人）
          let hits = [], near = null;
          const orig = g.damageEnemy.bind(g);
          g.damageEnemy = (e, ...r) => { if (!e.prop) hits.push(e); return orig(e, ...r); };
          const dist = (e) => Math.hypot(e.x - P.x, e.y - P.y);
          for (let s = 0; s < 150 && !hits.length; s++) {
            near = g.enemies.reduce((m, e) => (dist(e) < dist(m) ? e : m));
            g.update(1 / 60, { x: 0, y: 0 });
          }
          if (hits.includes(near)) ok++;
        }
        out[wid] = ok;
      }
      PS.app.game = saved;
      return out;
    });
    for (const k in res) assert.strictEqual(res[k], 6, k + ' 只有 ' + res[k] + '/6 次命中最近敌人');
  });

  await step('ESC 暂停并显示构筑，确认继续', async () => {
    await page.keyboard.press('Escape');
    assert.strictEqual(await st(), 'paused');
    assert.strictEqual(await screen(), 'pause');
    const t0 = await page.evaluate(() => PS.app.game.time);
    await wait(page, 300);
    assert.strictEqual(await page.evaluate(() => PS.app.game.time), t0);
    await page.keyboard.press('Enter');
    assert.strictEqual(await st(), 'play');
  });

  await step('升级弹窗：数字键选择，输入锁防误触', async () => {
    const n0 = await page.evaluate(() => PS.app.game.weapons.length + PS.app.game.passives.length);
    const lvs0 = await page.evaluate(() => PS.app.game.weapons.map((w) => w.level).join());
    await page.evaluate(() => PS.app.game.addXp(5));
    await wait(page, 60);
    assert.strictEqual(await st(), 'levelup');
    await page.keyboard.press('Digit1'); // 锁定期间无效
    assert.strictEqual(await st(), 'levelup');
    await wait(page, 450);
    await page.keyboard.press('Digit1');
    await wait(page, 30);
    assert.strictEqual(await st(), 'play');
    const n1 = await page.evaluate(() => PS.app.game.weapons.length + PS.app.game.passives.length);
    const lvs1 = await page.evaluate(() => PS.app.game.weapons.map((w) => w.level).join());
    assert.ok(n1 > n0 || lvs1 !== lvs0);
  });

  await step('多级连升：重抽 / 跳过 / 封印', async () => {
    await page.evaluate(() => { const g = PS.app.game; g.rerolls = 1; g.skips = 1; g.banishes = 1; g.addXp(60); });
    await wait(page, 500);
    assert.strictEqual(await st(), 'levelup');
    const pend = await page.evaluate(() => PS.app.game.pendingLevels);
    assert.ok(pend >= 2);
    await page.keyboard.press('KeyR');
    assert.strictEqual(await page.evaluate(() => PS.app.game.rerolls), 0);
    await page.keyboard.press('KeyB');
    assert.strictEqual(await page.evaluate(() => PS.ui.banishMode), true);
    const bid = await page.evaluate(() => PS.ui.params.opts[0].id);
    await page.keyboard.press('Digit1');
    assert.ok(await page.evaluate((id) => PS.app.game.banished.has(id), bid));
    await page.keyboard.press('KeyF');
    assert.strictEqual(await page.evaluate(() => PS.app.game.pendingLevels), pend - 1);
    for (let i = 0; i < 20 && (await st()) === 'levelup'; i++) {
      await page.keyboard.press('Enter');
      await wait(page, 380);
    }
    assert.strictEqual(await st(), 'play');
  });

  await step('宝箱：拾取后弹窗，确认后继续', async () => {
    await page.evaluate(() => { const g = PS.app.game; g.addPickup('chest', g.P.x + 4, g.P.y, 2); });
    await wait(page, 100);
    assert.strictEqual(await st(), 'chest');
    await wait(page, 550);
    await page.keyboard.press('Space');
    await wait(page, 50);
    assert.ok(['play', 'levelup'].includes(await st()));
    for (let i = 0; i < 20 && (await st()) === 'levelup'; i++) {
      await page.keyboard.press('Enter');
      await wait(page, 380);
    }
  });

  await step('进化：满级武器 + 对应道具 → 宝箱进化', async () => {
    await page.evaluate(() => {
      const g = PS.app.game;
      const w = g.weapons.find((x) => x.baseId === 'wand');
      w.level = w.def.maxLevel;
      g.recalcWeapon(w);
      if (!g.hasPassive('tome')) g.addPassive('tome');
      g.addPickup('chest', g.P.x + 4, g.P.y, 1);
    });
    await wait(page, 100);
    assert.strictEqual(await st(), 'chest');
    assert.ok(await page.evaluate(() => PS.app.game.weapons.some((w) => w.id === 'holywand')));
    await wait(page, 550);
    await page.keyboard.press('Enter');
    await page.evaluate(() => { if (PS.app.state === 'levelup') { PS.app.game.pendingLevels = 1; } });
    for (let i = 0; i < 20 && (await st()) === 'levelup'; i++) {
      await page.keyboard.press('Enter');
      await wait(page, 380);
    }
  });

  await step('Boss 出现时显示血条与警告横幅', async () => {
    await page.evaluate(() => PS.app.game.spawnBoss('lich', {}));
    await wait(page, 100);
    assert.ok(await page.evaluate(() => !document.querySelector('.bossbar').classList.contains('hidden')));
    assert.ok(await page.evaluate(() => document.querySelector('#banner').classList.contains('show')));
  });

  await step('道具：磁铁 / 十字架 / 时停 / 烤鸡', async () => {
    await page.evaluate(() => {
      const g = PS.app.game;
      g.P.hp = 10;
      for (const t of ['magnet', 'rosary', 'clock', 'chicken']) g.addPickup(t, g.P.x + 3, g.P.y + 3, t === 'chicken' ? 30 : 0);
    });
    await wait(page, 120);
    const r = await page.evaluate(() => ({ hp: PS.app.game.P.hp, fr: PS.app.game.freezeT }));
    assert.ok(r.hp >= 39, 'hp ' + r.hp);
    assert.ok(r.fr > 7);
  });

  await step('死亡 → 结算 → 再来一局', async () => {
    await page.evaluate(() => { const g = PS.app.game; g.P.revivals = 0; g.P.iframes = 0; g.hurtPlayer(99999, 'test'); });
    await wait(page, 2300);
    assert.strictEqual(await st(), 'over');
    assert.strictEqual(await screen(), 'over');
    await wait(page, 900);
    assert.strictEqual(await focusAct(), 'retry');
    await page.keyboard.press('Enter');
    assert.strictEqual(await st(), 'play');
  });

  await step('复活：拥有复活次数时不会死亡', async () => {
    await page.evaluate(() => { const g = PS.app.game; g.P.revivals = 1; g.P.iframes = 0; g.hurtPlayer(99999, 'test'); });
    await wait(page, 100);
    const r = await page.evaluate(() => ({ s: PS.app.state, hp: PS.app.game.P.hp, rv: PS.app.game.P.revivals }));
    assert.strictEqual(r.s, 'play');
    assert.ok(r.hp > 0);
    assert.strictEqual(r.rv, 0);
  });

  await step('暂停 → 放弃本局 → 确认 → 结算 → 返回主菜单', async () => {
    await page.keyboard.press('KeyP');
    assert.strictEqual(await st(), 'paused');
    await page.evaluate(() => PS.ui.focus(document.querySelector('[data-act="quit"]')));
    await page.keyboard.press('Enter');
    assert.strictEqual(await screen(), 'confirm');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    assert.strictEqual(await st(), 'over');
    await wait(page, 900);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    assert.strictEqual(await st(), 'menu');
    assert.strictEqual(await screen(), 'title');
  });

  await step('鼠标：点击菜单按钮；按住画面拖动角色', async () => {
    await page.click('[data-act="start"]');
    assert.strictEqual(await screen(), 'chars');
    await page.click('.card.char[data-id="knight"]');
    assert.strictEqual(await screen(), 'stages');
    await page.click('.card.stage[data-id="graveyard"]');
    assert.strictEqual(await st(), 'play');
    const x0 = await page.evaluate(() => PS.app.game.P.x);
    await page.mouse.move(640, 360);
    await page.mouse.down();
    await page.mouse.move(100, 360);
    await wait(page, 500);
    await page.mouse.up();
    const x1 = await page.evaluate(() => PS.app.game.P.x);
    assert.ok(x0 - x1 > 15, 'moved ' + (x0 - x1));
    await page.click('.pausebtn');
    assert.strictEqual(await st(), 'paused');
    await page.click('[data-act="resume"]');
    assert.strictEqual(await st(), 'play');
  });

  await step('手柄：摇杆移动、Start 暂停、十字键导航、A 确认、B 返回', async () => {
    await page.evaluate(() => { window.__padOn = true; });
    const y0 = await page.evaluate(() => PS.app.game.P.y);
    await page.evaluate(() => { window.__pad.axes[1] = 1; });
    await wait(page, 500);
    await page.evaluate(() => { window.__pad.axes[1] = 0; });
    const y1 = await page.evaluate(() => PS.app.game.P.y);
    assert.ok(y1 - y0 > 15, 'moved ' + (y1 - y0));
    const press = async (i) => {
      await page.evaluate((i) => { window.__pad.buttons[i] = { pressed: true, touched: true, value: 1 }; }, i);
      await wait(page, 60);
      await page.evaluate((i) => { window.__pad.buttons[i] = { pressed: false, touched: false, value: 0 }; }, i);
      await wait(page, 60);
    };
    await press(9); // Start
    assert.strictEqual(await st(), 'paused');
    await press(15); // 右
    assert.notStrictEqual(await focusAct(), 'resume');
    await press(14); // 左
    assert.strictEqual(await focusAct(), 'resume');
    await press(0); // A
    assert.strictEqual(await st(), 'play');
    await press(9);
    await press(1); // B 返回 = 继续
    assert.strictEqual(await st(), 'play');
    // 升级界面中 X = 重抽
    await page.evaluate(() => { PS.app.game.rerolls = 2; PS.app.game.addXp(5); });
    await wait(page, 500);
    assert.strictEqual(await st(), 'levelup');
    await press(2);
    assert.strictEqual(await page.evaluate(() => PS.app.game.rerolls), 1);
    await press(0);
    await wait(page, 50);
    await page.evaluate(() => { window.__padOn = false; });
  });

  await step('右键朝光标冲刺、手柄 RT 冲刺', async () => {
    await page.evaluate(() => { PS.debug.calm(); const g = PS.app.game; g.P.sta = 100; g.P.dashCd = 0; });
    const ps = await page.evaluate(() => PS.render.worldToClient(PS.app.game.P.x, PS.app.game.P.y));
    const y0 = await page.evaluate(() => PS.app.game.P.y);
    await page.mouse.click(ps.x, ps.y + 200, { button: 'right' });
    await wait(page, 300);
    assert.ok((await page.evaluate(() => PS.app.game.P.y)) - y0 > 40, '右键冲刺应朝光标（下方）移动');
    await page.evaluate(() => { const g = PS.app.game; g.P.sta = 100; g.P.dashCd = 0; window.__padOn = true; });
    await page.evaluate(() => { window.__pad.buttons[7] = { pressed: true, touched: true, value: 1 }; });
    await wait(page, 60);
    await page.evaluate(() => { window.__pad.buttons[7] = { pressed: false, touched: false, value: 0 }; window.__padOn = false; });
    await wait(page, 50);
    assert.ok((await page.evaluate(() => PS.app.game.P.sta)) < 80, 'RT 应当消耗体力冲刺');
  });

  await step('存档持久化：刷新后金币与强化保留', async () => {
    await page.evaluate(() => { PS.save.data.gold = 4321; PS.save.data.meta.luck = 2; PS.save.store(); });
    await page.reload();
    await wait(page, 500);
    const r = await page.evaluate(() => ({ g: PS.save.data.gold, l: PS.save.metaRank('luck') }));
    assert.strictEqual(r.g, 4321);
    assert.strictEqual(r.l, 2);
  });

  await step('损坏的存档不会导致崩溃', async () => {
    await page.evaluate(() => localStorage.setItem('pixelSurvivors.save.v1', '{bad json'));
    await page.reload();
    await wait(page, 500);
    assert.strictEqual(await st(), 'menu');
    assert.strictEqual(await page.evaluate(() => PS.save.data.gold), 0);
  });

  await step('运行期间无 JS 错误', async () => {
    const appErr = await page.evaluate(() => PS.app.errors);
    assert.deepStrictEqual(errors.concat(appErr), []);
  });

  await browser.close();
  console.log(`\n全部通过：${passed} 项`);
})().catch((e) => {
  console.error('\n失败：', e);
  process.exit(1);
});
