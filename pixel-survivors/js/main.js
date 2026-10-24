'use strict';
// 应用入口：状态机、固定步长主循环、调试/测试接口
(function () {
  const PS = window.PS;
  const STEP = 1 / 60;
  const app = (PS.app = { state: 'boot', game: null, acc: 0, last: 0, t: 0, errors: [] });
  PS.debug = { bot: false, speed: 1 };

  app.boot = function () {
    PS.save.load();
    PS.buildSprites();
    for (const id of PS.DATA.charOrder) PS.buildCharSprite(id, PS.DATA.chars[id].look);
    const canvas = document.getElementById('game');
    PS.render.init(canvas);
    PS.input.init(canvas);
    PS.input.onAction = (a, src) => PS.ui.action(a, src);
    PS.ui.init();
    PS.ui.show('title');
    app.state = 'menu';
    PS.audio.music('title');
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) app.pause();
    });
    window.addEventListener('blur', () => app.pause());
    window.addEventListener('gamepadconnected', () => PS.ui.toast('手柄已连接', 'good'));
    requestAnimationFrame(app.frame);
  };

  app.startRun = function (charId, stageId, opts) {
    const g = new PS.Game(charId, stageId, opts);
    app.game = g;
    PS.render.prepare(g);
    g.on('chest', (res) => app.openChest(res));
    g.on('over', (d) => app.gameOver(d));
    g.on('boss', (e) => PS.ui.bossBanner(e));
    g.on('toast', (t) => PS.ui.toast(t.text, t.cls));
    g.on('unlock', (u) => {
      PS.ui.toast('解锁新' + (u.kind === 'char' ? '角色' : '关卡') + '：' + u.name, 'unlock');
      PS.audio.sfx('unlock');
    });
    PS.ui.banishMode = false;
    PS.ui.hide();
    PS.ui.showHUD(true);
    app.state = 'play';
    app.acc = 0;
    PS.audio.music(g.st.music);
    PS.save.data.last = Object.assign({}, PS.save.data.last, { char: charId, stage: stageId }, g.endless ? { ult: g.opts.ultimate } : {});
    PS.save.store();
    return g;
  };

  app.step = function () {
    const g = app.game;
    const mv = PS.debug.bot ? g.botMove() : PS.input.move;
    g.update(STEP, mv);
    if (app.state === 'play' && g.pendingLevels > 0 && !g.ending) app.openLevelUp();
  };

  app.frame = function (ts) {
    try {
      const dt = Math.min(0.1, (ts - app.last) / 1000 || 0);
      app.last = ts;
      app.t += dt;
      const g = app.game;
      const ps = g ? PS.render.worldToClient(g.P.x, g.P.y) : null;
      PS.input.poll(dt, ps, app.state === 'play' && PS.save.data.settings.mouseMove);
      PS.ui.update(dt);
      if (app.state === 'play' && g) {
        app.acc += dt * (PS.debug.speed || 1);
        let steps = 0;
        const maxSteps = 8 * (PS.debug.speed || 1);
        while (app.acc >= STEP && steps < maxSteps) {
          app.step();
          app.acc -= STEP;
          steps++;
          if (app.state !== 'play') { app.acc = 0; break; }
        }
        if (steps >= maxSteps) app.acc = 0;
      }
      if (PS.debug.bot) app.botUI();
      if (g && app.state !== 'menu') {
        PS.render.draw(g, app.t);
        PS.ui.updateHUD(g);
      } else PS.render.drawMenu(app.t);
    } catch (err) {
      app.errors.push(String(err && err.stack ? err.stack : err));
      console.error(err);
    }
    requestAnimationFrame(app.frame);
  };

  // 所有武器与道具都已满级时自动领取奖励，不再弹窗打断
  function autoReward(g, opts) {
    if (!opts.every((o) => o.kind === 'gold' || o.kind === 'chicken')) return false;
    const heal = g.P.hp < g.P.maxHp * 0.6;
    const o = opts.find((x) => x.kind === (heal ? 'chicken' : 'gold')) || opts[0];
    g.applyOption(o);
    g.finishLevelUp();
    PS.ui.toast(o.kind === 'gold' ? '升级奖励：+' + Math.round(o.v * g.P.st.greed) + ' 金币' : '升级奖励：回复 ' + o.v + ' 生命', 'good');
    return true;
  }
  // 冲刺：data.pointer 表示朝鼠标光标方向
  app.dash = function (data) {
    const g = app.game;
    if (!g || app.state !== 'play') return;
    let dir = null;
    if (data && data.pointer) {
      const ps = PS.render.worldToClient(g.P.x, g.P.y);
      const dx = PS.input.pointer.x - ps.x, dy = PS.input.pointer.y - ps.y;
      if (Math.hypot(dx, dy) > 4) dir = { x: dx, y: dy };
    }
    g.requestDash(dir);
  };

  app.openLevelUp = function () {
    const g = app.game;
    PS.ui.banishMode = false;
    while (g.pendingLevels > 0) {
      const opts = g.rollOptions();
      if (autoReward(g, opts)) continue;
      app.state = 'levelup';
      PS.ui.show('levelup', { opts });
      return;
    }
    if (app.state !== 'play') app.resume();
  };
  app.afterLevelUp = function () {
    const g = app.game;
    if (g.pendingLevels > 0) app.openLevelUp();
    else app.resume();
  };
  app.openChest = function (res) {
    app.state = 'chest';
    PS.ui.show('chest', { res });
  };
  app.pause = function () {
    if (app.state !== 'play') return;
    app.state = 'paused';
    PS.ui.show('pause');
  };
  app.resume = function () {
    app.state = 'play';
    app.acc = 0;
    PS.ui.hide();
    // 宝箱/暂停后可能还有待选择的升级
    if (app.game && app.game.pendingLevels > 0 && !app.game.ending) app.openLevelUp();
  };
  app.gameOver = function (d) {
    const g = app.game;
    if (!g || app.state === 'over') return;
    const prevBest = g.endless ? PS.save.data.stats.endlessBest[g.stageId] || 0 : 0;
    const unlocks = PS.save.commitRun(g);
    app.state = 'over';
    PS.ui.show('over', { victory: !!d.victory, quit: !!d.quit, unlocks: g.unlocks.concat(unlocks), record: g.endless && Math.floor(g.time) > prevBest });
    PS.audio.music(d.victory ? 'title' : 'over');
  };
  app.quitRun = function () {
    const g = app.game;
    if (!g) return;
    g.quit = true;
    app.state = 'paused';
    app.gameOver({ victory: false, quit: true });
  };
  app.toMenu = function () {
    app.game = null;
    app.state = 'menu';
    PS.ui.showHUD(false);
    PS.ui.show('title');
    PS.audio.music('title');
  };
  app.retry = function () {
    const g = app.game;
    app.startRun(g.charId, g.stageId, g.opts);
  };

  // ---------- 调试 / 自动化测试 ----------
  app.botUI = function () {
    const g = app.game;
    if (app.state === 'levelup' && PS.ui.lockT <= 0) {
      const opts = PS.ui.params.opts;
      const i = g.botChoose(opts);
      g.applyOption(opts[i]);
      g.finishLevelUp();
      app.afterLevelUp();
    } else if (app.state === 'chest' && PS.ui.lockT <= 0) app.resume();
  };
  // 同步快进模拟（不依赖 requestAnimationFrame），返回是否仍在对局中
  PS.debug.simulate = function (seconds) {
    const n = Math.round(seconds / STEP);
    for (let i = 0; i < n; i++) {
      const g = app.game;
      if (!g) return false;
      if (app.state === 'levelup') {
        const opts = PS.ui.params.opts;
        g.applyOption(opts[g.botChoose(opts)]);
        g.finishLevelUp();
        app.afterLevelUp();
      } else if (app.state === 'chest') app.resume();
      else if (app.state === 'play') app.step();
      else return false;
    }
    return app.state !== 'over' && app.state !== 'menu';
  };

  window.addEventListener('error', (e) => app.errors.push(String(e.message)));
  window.addEventListener('DOMContentLoaded', app.boot);
})();
