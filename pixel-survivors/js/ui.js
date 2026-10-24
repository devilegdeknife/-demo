'use strict';
// 界面：所有菜单 / 弹窗 / HUD，支持鼠标点击与键盘、手柄的空间焦点导航
(function () {
  const PS = window.PS;
  const D = PS.DATA, U = PS.U;
  const UI = (PS.ui = { cur: null, name: '', params: {}, focusEl: null, lockT: 0, hudSig: '', selChar: null, selStage: null, banishMode: false });
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const img = (name, sc, cls) => `<img class="px ${cls || ''}" src="${PS.iconURL(name, sc || 3)}" alt="">`;
  const sfx = (n) => PS.audio.sfx(n);

  UI.init = function () {
    UI.root = $('#ui');
    UI.hud = $('#hud');
    UI.toasts = $('#toasts');
    UI.banner = $('#banner');
    UI.hud.innerHTML = `
      <div class="xpbar"><div class="xpfill"></div><span class="lv">Lv 1</span></div>
      <div class="hud-top">
        <div class="slots"><div class="wslots"></div><div class="pslots"></div></div>
        <div class="timer">00:00</div>
        <div class="counters">
          <div class="cnt">${img('skull', 2)}<span class="kills">0</span></div>
          <div class="cnt">${img('coin', 2)}<span class="gold">0</span></div>
        </div>
      </div>
      <div class="bossbar hidden"><div class="bname"></div><div class="bbar"><div class="bfill"></div></div></div>
      <button class="pausebtn" title="暂停 (ESC)">❚❚</button>
      <button class="dashbtn" title="冲刺 (Shift / 空格)">冲刺</button>`;
    UI.hud.querySelector('.pausebtn').addEventListener('click', () => PS.app.pause());
    UI.hud.querySelector('.dashbtn').addEventListener('pointerdown', (e) => {
      e.preventDefault();
      PS.app.dash();
    });
    UI.h = {
      xpfill: $('.xpfill', UI.hud), lv: $('.lv', UI.hud), timer: $('.timer', UI.hud), kills: $('.kills', UI.hud), gold: $('.gold', UI.hud),
      wslots: $('.wslots', UI.hud), pslots: $('.pslots', UI.hud), boss: $('.bossbar', UI.hud), bname: $('.bname', UI.hud), bfill: $('.bfill', UI.hud),
    };
  };

  UI.showHUD = function (on) {
    UI.hud.classList.toggle('hidden', !on);
    UI.hudSig = '';
  };

  // ================= 屏幕管理 =================
  UI.show = function (name, params) {
    const sc = SCREENS[name];
    UI.name = name;
    UI.cur = sc;
    UI.params = params || {};
    UI.render();
    UI.lockT = sc.lock || 0;
    if (UI.banner) UI.banner.className = '';
  };
  UI.render = function (keepFocusKey) {
    const sc = UI.cur;
    UI.root.innerHTML = sc.render(UI.params);
    UI.root.className = sc.modal ? 'modal' : 'full';
    UI.root.querySelectorAll('[data-nav]').forEach((el) => {
      el.addEventListener('mouseenter', () => UI.focus(el, true));
      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        UI.focus(el, true);
        UI.activate(el);
      });
    });
    let target = null;
    if (keepFocusKey) target = UI.root.querySelector(`[data-key="${keepFocusKey}"]`);
    if (!target) target = UI.root.querySelector('[data-default]') || UI.root.querySelector('[data-nav]:not(.disabled)') || UI.root.querySelector('[data-nav]');
    UI.focusEl = null;
    UI.focus(target, true);
    if (sc.onShow) sc.onShow(UI.params);
  };
  UI.hide = function () {
    UI.root.innerHTML = '';
    UI.root.className = '';
    UI.cur = null;
    UI.name = '';
    UI.focusEl = null;
  };

  UI.focus = function (el, quiet) {
    if (UI.focusEl === el) return;
    if (UI.focusEl) UI.focusEl.classList.remove('focus');
    UI.focusEl = el;
    if (!el) return;
    el.classList.add('focus');
    if (!quiet && el.scrollIntoView) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    if (UI.cur && UI.cur.onFocus) UI.cur.onFocus(el);
  };

  UI.navs = () => Array.from(UI.root.querySelectorAll('[data-nav]')).filter((el) => el.offsetParent !== null);

  UI.move = function (dir) {
    const els = UI.navs();
    if (!els.length) return;
    const cur = UI.focusEl && els.includes(UI.focusEl) ? UI.focusEl : null;
    if (!cur) {
      UI.focus(els[0]);
      return;
    }
    const r0 = cur.getBoundingClientRect();
    const cx = r0.left + r0.width / 2, cy = r0.top + r0.height / 2;
    let best = null, bs = Infinity;
    for (const el of els) {
      if (el === cur) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      const ex = r.left + r.width / 2, ey = r.top + r.height / 2;
      const dx = ex - cx, dy = ey - cy;
      let p, s;
      if (dir === 'left') { if (dx > -4) continue; p = -dx; s = Math.abs(dy); }
      else if (dir === 'right') { if (dx < 4) continue; p = dx; s = Math.abs(dy); }
      else if (dir === 'up') { if (dy > -4) continue; p = -dy; s = Math.abs(dx); }
      else { if (dy < 4) continue; p = dy; s = Math.abs(dx); }
      const score = p + s * 2.2;
      if (score < bs) { bs = score; best = el; }
    }
    if (best) {
      UI.focus(best);
      sfx('move');
    }
  };

  UI.activate = function (el) {
    if (!el || !UI.cur) return;
    if (UI.lockT > 0) return;
    if (el.classList.contains('disabled')) {
      sfx('deny');
      el.classList.remove('shake');
      void el.offsetWidth;
      el.classList.add('shake');
      return;
    }
    sfx('select');
    UI.cur.onAct(el.dataset.act, el);
  };

  // 输入动作入口
  UI.action = function (a, src, data) {
    if (!UI.cur) {
      if (PS.app.state !== 'play') return;
      if (a === 'pause' || a === 'back') PS.app.pause();
      else if ((a === 'dash' || a === 'confirm' || a === 'banish') && !(data && data.repeat)) PS.app.dash(data);
      return;
    }
    const el = UI.focusEl;
    switch (a) {
      case 'up': case 'down': case 'left': case 'right':
        if ((a === 'left' || a === 'right') && el && el.hasAttribute('data-adj')) {
          UI.cur.onAct('adj', el, a === 'left' ? -1 : 1);
          sfx('move');
        } else UI.move(a);
        break;
      case 'confirm':
        UI.activate(el);
        break;
      case 'back':
        if (UI.cur.onBack) { sfx('back'); UI.cur.onBack(); }
        break;
      case 'pause':
        if (UI.cur.onPause) UI.cur.onPause();
        else if (UI.cur.onBack) { sfx('back'); UI.cur.onBack(); }
        break;
      default:
        if (UI.cur.onKey) UI.cur.onKey(a);
    }
  };

  UI.update = function (dt) {
    if (UI.lockT > 0) UI.lockT -= dt;
  };

  UI.toast = function (text, cls) {
    const d = document.createElement('div');
    d.className = 'toast ' + (cls || '');
    d.textContent = text;
    UI.toasts.appendChild(d);
    setTimeout(() => d.classList.add('out'), 2600);
    setTimeout(() => d.remove(), 3200);
    while (UI.toasts.children.length > 5) UI.toasts.firstChild.remove();
  };

  UI.bossBanner = function (boss) {
    UI.banner.innerHTML = `<div class="b1">⚠ 警告 ⚠</div><div class="b2">${esc(boss.def.name)} 降临！</div>`;
    UI.banner.className = 'show';
    clearTimeout(UI.bannerT);
    UI.bannerT = setTimeout(() => { UI.banner.className = ''; }, 2600);
  };

  // ================= HUD =================
  UI.updateHUD = function (g) {
    const h = UI.h;
    const xpPct = Math.min(100, (g.xp / g.xpNext) * 100);
    h.xpfill.style.width = xpPct.toFixed(1) + '%';
    const lvT = 'Lv ' + g.level;
    if (h.lv.textContent !== lvT) h.lv.textContent = lvT;
    const tt = U.fmtTime(g.time);
    if (h.timer.textContent !== tt) h.timer.textContent = tt;
    const k = U.fmtNum(g.kills);
    if (h.kills.textContent !== k) h.kills.textContent = k;
    const gd = U.fmtNum(Math.floor(g.gold));
    if (h.gold.textContent !== gd) h.gold.textContent = gd;
    const sig = g.weapons.map((w) => w.id + w.level).join(',') + '|' + g.passives.map((p) => p.id + p.level).join(',');
    if (sig !== UI.hudSig) {
      UI.hudSig = sig;
      // 无尽模式显示真实等级（可突破满级）
      const slot = (icon, lv, max, evo) => `<div class="slot ${evo ? 'evo' : ''}">${img(icon, 2)}<span class="slv">${g.endless ? lv : evo ? '★' : lv >= max ? 'M' : lv}</span></div>`;
      let ws = '', ps = '';
      for (let i = 0; i < 6; i++) {
        const w = g.weapons[i];
        ws += w ? slot(w.def.icon, w.level, w.def.maxLevel, w.def.evolved) : '<div class="slot empty"></div>';
        const p = g.passives[i];
        ps += p ? slot(p.def.icon, p.level, p.def.max) : '<div class="slot empty"></div>';
      }
      h.wslots.innerHTML = ws;
      h.pslots.innerHTML = ps;
    }
    const b = g.bosses.length ? g.bosses[g.bosses.length - 1] : null;
    if (b) {
      h.boss.classList.remove('hidden');
      if (h.bname.textContent !== b.def.name) h.bname.textContent = b.def.name;
      h.bfill.style.width = Math.max(0, (b.hp / b.maxHp) * 100).toFixed(1) + '%';
    } else h.boss.classList.add('hidden');
  };

  // ================= 屏幕定义 =================
  const SCREENS = {};
  UI.SCREENS = SCREENS;
  // 无尽模式下所有角色与关卡都可用
  const isEndless = () => UI.mode === 'endless';
  const charOpen = (id) => isEndless() || PS.save.data.chars.includes(id);
  const stageOpen = (id) => isEndless() || PS.save.data.stages.includes(id);
  const goldLine = () => `<div class="goldline">${img('coin', 3)}<span>${U.fmtNum(PS.save.data.gold)}</span></div>`;

  // ---------- 标题 ----------
  SCREENS.title = {
    render() {
      const heroes = ['knight', 'mage', 'rogue', 'nun'].map((id) => img('ch_' + id, 4, 'hero')).join('');
      return `<div class="screen title">
        <div class="logo">
          <div class="logo-cn">像素幸存者</div>
          <div class="logo-en">PIXEL&nbsp;SURVIVORS</div>
          <div class="heroes">${heroes}</div>
        </div>
        <div class="menu col">
          <button class="btn big" data-nav data-act="start" data-default>开始游戏</button>
          <button class="btn endless" data-nav data-act="endless">无尽模式</button>
          <button class="btn" data-nav data-act="shop">强化商店</button>
          <button class="btn" data-nav data-act="collection">收藏图鉴</button>
          <button class="btn" data-nav data-act="settings">设置</button>
        </div>
        ${goldLine()}
        <div class="controls">
          <div><b>键盘</b> WASD / 方向键 移动 · Shift / 空格 冲刺 · 回车 确认 · ESC 返回 / 暂停</div>
          <div><b>鼠标</b> 点击菜单 · 按住左键拖动移动 · 右键朝光标冲刺</div>
          <div><b>手柄</b> 左摇杆 / 十字键 移动 · A / RT 冲刺 · A 确认 · B 返回 · Start 暂停</div>
        </div>
      </div>`;
    },
    onAct(a) {
      if (a === 'start' || a === 'endless') {
        UI.mode = a === 'endless' ? 'endless' : 'normal';
        UI.show('chars');
      } else if (a === 'shop') UI.show('shop');
      else if (a === 'collection') UI.show('collection', { tab: 'weapons' });
      else if (a === 'settings') UI.show('settings', { from: 'title' });
    },
  };

  // ---------- 角色选择 ----------
  function unlockProgress(u) {
    const live = PS.save.liveStats(null);
    switch (u.type) {
      case 'survive': return U.fmtTime(live.bestAny) + ' / ' + U.fmtTime(u.v);
      case 'surviveStage': return U.fmtTime(live.bestTime[u.stage] || 0) + ' / ' + U.fmtTime(u.v);
      case 'level': return live.maxLevel + ' / ' + u.v;
      case 'kills': return live.totalKills + ' / ' + u.v;
      case 'boss': return live.bossKills + ' / ' + u.v;
      case 'chests': return live.chests + ' / ' + u.v;
      case 'evolve': return live.evolutions + ' / ' + u.v;
      case 'gold': return live.totalGold + ' / ' + u.v;
      case 'win': return live.wins + ' / ' + u.v;
    }
    return '';
  }

  SCREENS.chars = {
    render() {
      const save = PS.save.data;
      if (!UI.selChar || !charOpen(UI.selChar)) UI.selChar = charOpen(save.last.char) ? save.last.char : 'knight';
      const cards = D.charOrder.map((id) => {
        const c = D.chars[id];
        const un = charOpen(id);
        const pic = un ? img('ch_' + id, 4) : `<img class="px" src="${PS.silhouetteURL('ch_' + id, 4)}" alt="">`;
        return `<div class="card char ${un ? '' : 'locked'}" data-nav data-act="pick" data-id="${id}" data-key="${id}" ${id === UI.selChar ? 'data-default' : ''}>
          ${pic}<div class="nm">${un ? esc(c.name) : '???'}</div>${un ? `<div class="wpn">${img(D.weapons[c.weapon].icon, 2)}</div>` : '<div class="lock">🔒</div>'}</div>`;
      }).join('');
      return `<div class="screen chars">
        <div class="hdr"><div class="ttl">选择角色${isEndless() ? '<span class="modetag">无尽模式</span>' : ''}</div>${goldLine()}</div>
        <div class="split">
          <div class="grid chargrid">${cards}</div>
          <div class="panel detail" id="detail"></div>
        </div>
        <div class="row btns">
          <button class="btn" data-nav data-act="back">返回</button>
          <button class="btn primary" data-nav data-act="go">${isEndless() ? '下一步：终极武器 ▶' : '选择角色 ▶'}</button>
        </div>
      </div>`;
    },
    onFocus(el) {
      if (el.dataset.id) {
        UI.focusChar = el.dataset.id;
        this.detail(el.dataset.id);
      }
    },
    onShow() {
      this.detail(UI.focusChar && UI.focusChar !== UI.selChar ? UI.focusChar : UI.selChar);
    },
    detail(id) {
      const c = D.chars[id];
      const un = charOpen(id);
      const det = $('#detail');
      if (!det) return;
      if (!un) {
        det.innerHTML = `<div class="dhead"><img class="px big" src="${PS.silhouetteURL('ch_' + id, 6)}" alt=""><div><div class="dname">???</div><div class="dsub">尚未解锁</div></div></div>
          <div class="cond"><div class="lbl">解锁条件</div><div>${esc(c.unlock.txt)}</div><div class="prog">进度：${unlockProgress(c.unlock)}</div></div>`;
        return;
      }
      const w = D.weapons[c.weapon];
      det.innerHTML = `<div class="dhead">${img('ch_' + id, 6, 'big')}<div><div class="dname">${esc(c.name)}</div><div class="dsub">${esc(c.title)}</div></div></div>
        <div class="ddesc">${esc(c.desc)}</div>
        <div class="lbl">初始武器</div>
        <div class="witem">${img(w.icon, 3)}<div><div class="wn">${esc(w.name)}</div><div class="wd">${esc(w.desc)}</div></div></div>
        <div class="lbl">角色加成</div><div class="bonus">${esc(D.bonusText(c.bonus))}</div>
        ${isEndless() && !PS.save.data.chars.includes(id) ? '<div class="hint">普通模式中尚未解锁，无尽模式可直接使用。</div>' : ''}`;
    },
    onAct(a, el) {
      if (a === 'back') return UI.show('title');
      let id = a === 'pick' ? el.dataset.id : UI.focusChar || UI.selChar;
      if (!charOpen(id)) {
        sfx('deny');
        return;
      }
      UI.selChar = id;
      UI.show(isEndless() ? 'ultimate' : 'stages');
    },
    onBack() { UI.show('title'); },
  };

  // ---------- 关卡选择 ----------
  const STAGE_ICON = { graveyard: 'b_vampire', forest: 'b_treant', dungeon: 'b_reaper' };
  SCREENS.stages = {
    render() {
      const save = PS.save.data;
      if (!UI.selStage || !stageOpen(UI.selStage)) UI.selStage = stageOpen(save.last.stage) ? save.last.stage : 'graveyard';
      const endless = isEndless();
      const cards = D.stageOrder.map((id) => {
        const s = D.stages[id];
        const un = stageOpen(id);
        const best = (endless ? save.stats.endlessBest[id] : save.stats.bestTime[id]) || 0;
        const won = !endless && best >= D.RUN_LENGTH;
        return `<div class="card stage ${un ? '' : 'locked'} theme-${s.theme}" data-nav data-act="pick" data-id="${id}" ${id === UI.selStage ? 'data-default' : ''}>
          <div class="sicon">${un ? img(STAGE_ICON[id], 2) : `<img class="px" src="${PS.silhouetteURL(STAGE_ICON[id], 2)}" alt="">`}</div>
          <div class="sinfo">
            <div class="sname">${un ? esc(s.name) : '??? 未解锁'}</div>
            <div class="sdesc">${un ? esc(s.desc) : '解锁条件：' + esc(s.unlock.txt) + '（' + unlockProgress(s.unlock) + '）'}</div>
            ${un ? `<div class="smeta">${endless ? '无尽最佳' : '最佳'}：${U.fmtTime(best)} ${won ? '<span class="won">★ 已通关</span>' : ''} · 敌人强度 ×${s.hpMul} · 金币 ×${s.goldMul}</div>` : ''}
          </div></div>`;
      }).join('');
      const c = D.chars[UI.selChar];
      const ult = endless && D.weapons[UI.selUlt];
      return `<div class="screen stages">
        <div class="hdr"><div class="ttl">选择关卡${endless ? '<span class="modetag">无尽模式</span>' : ''}</div>
          <div class="selchar">${img('ch_' + UI.selChar, 3)}<span>${esc(c.name)}</span>${ult ? img(ult.icon, 2) + '<span>' + esc(ult.name) + '</span>' : ''}</div></div>
        <div class="col stagelist">${cards}</div>
        <div class="tip">${endless ? '无尽模式：没有时间限制，武器与道具可无限升级；每 15 分钟进入下一轮，Boss 会更强。' : '存活 15:00 后最终 Boss 现身，击败它即可通关！'}</div>
        <div class="row btns">
          <button class="btn" data-nav data-act="back">返回</button>
        </div>
      </div>`;
    },
    onAct(a, el) {
      if (a === 'back') return this.onBack();
      const id = el.dataset.id;
      if (!stageOpen(id)) {
        sfx('deny');
        return;
      }
      UI.selStage = id;
      PS.app.startRun(UI.selChar, id, isEndless() ? { endless: true, ultimate: UI.selUlt } : undefined);
    },
    onBack() { UI.show(isEndless() ? 'ultimate' : 'chars'); },
  };

  // ---------- 无尽模式：选择终极武器 ----------
  const ULTS = D.baseWeapons.map((id) => D.weapons[id].evo.into);
  SCREENS.ultimate = {
    render() {
      const own = D.weapons[D.chars[UI.selChar].weapon].evo.into;
      if (!ULTS.includes(UI.selUlt)) UI.selUlt = ULTS.includes(PS.save.data.last.ult) ? PS.save.data.last.ult : own;
      const cards = ULTS.map((id) => {
        const w = D.weapons[id];
        return `<div class="card ult" data-nav data-act="pick" data-id="${id}" data-key="${id}" ${id === UI.selUlt ? 'data-default' : ''}>
          ${img(w.icon, 3)}<div class="nm">${esc(w.name)}</div>${id === own ? '<div class="own">本命</div>' : ''}</div>`;
      }).join('');
      return `<div class="screen ultimate">
        <div class="hdr"><div class="ttl">选择终极武器<span class="modetag">无尽模式</span></div><div class="selchar">${img('ch_' + UI.selChar, 3)}<span>${esc(D.chars[UI.selChar].name)}</span></div></div>
        <div class="split">
          <div class="grid ultgrid">${cards}</div>
          <div class="panel detail" id="detail"></div>
        </div>
        <div class="row btns">
          <button class="btn" data-nav data-act="back">返回</button>
          <button class="btn primary" data-nav data-act="go">下一步：选择关卡 ▶</button>
        </div>
      </div>`;
    },
    onShow() { this.detail(UI.selUlt); },
    onFocus(el) {
      if (el.dataset.id) {
        UI.focusUlt = el.dataset.id;
        this.detail(el.dataset.id);
      }
    },
    detail(id) {
      const w = D.weapons[id];
      const base = D.weapons[w.from];
      const pas = D.passives[base.evo.with];
      const det = $('#detail');
      if (!det) return;
      const same = w.from === D.chars[UI.selChar].weapon;
      det.innerHTML = `<div class="dhead">${img(w.icon, 5, 'big')}<div><div class="dname">${esc(w.name)}</div><div class="dsub">终极武器</div></div></div>
        <div class="ddesc">${esc(w.desc)}</div>
        <div class="lbl">进化来源</div>
        <div class="recipe">${img(base.icon, 3)}<span>＋</span>${img(pas.icon, 3)}<span>${esc(base.name)} ＋ ${esc(pas.name)}</span></div>
        <div class="hint">${same ? '与角色初始武器同系：开局直接替换为这把终极武器。' : '开局同时拥有角色初始武器和这把终极武器。'}无尽模式中武器可以无限升级。</div>`;
    },
    onAct(a, el) {
      if (a === 'back') return this.onBack();
      const id = a === 'pick' ? el.dataset.id : UI.focusUlt || UI.selUlt;
      if (!ULTS.includes(id)) return;
      UI.selUlt = id;
      UI.show('stages');
    },
    onBack() { UI.show('chars'); },
  };

  // ---------- 强化商店 ----------
  SCREENS.shop = {
    render() {
      const cards = D.metaOrder.map((id) => {
        const m = D.meta[id];
        const r = PS.save.metaRank(id);
        let pips = '';
        for (let i = 0; i < m.max; i++) pips += `<i class="${i < r ? 'on' : ''}"></i>`;
        return `<div class="card meta ${r >= m.max ? 'maxed' : ''}" data-nav data-act="buy" data-id="${id}" data-key="${id}">
          ${img(m.icon, 3)}<div class="nm">${esc(m.name)}</div><div class="pips">${pips}</div></div>`;
      }).join('');
      return `<div class="screen shop">
        <div class="hdr"><div class="ttl">强化商店</div>${goldLine()}</div>
        <div class="split">
          <div class="grid metagrid">${cards}</div>
          <div class="panel detail" id="detail"></div>
        </div>
        <div class="row btns">
          <button class="btn" data-nav data-act="back">返回</button>
          <button class="btn" data-nav data-act="refund">全部退款</button>
        </div>
      </div>`;
    },
    onFocus(el) {
      if (el.dataset.id) {
        UI.shopSel = el.dataset.id;
        this.detail(el.dataset.id);
      }
    },
    detail(id) {
      const m = D.meta[id];
      const r = PS.save.metaRank(id);
      const cost = PS.save.metaCost(id);
      const st = D.STAT[m.stat];
      const det = $('#detail');
      if (!det) return;
      det.innerHTML = `<div class="dhead">${img(m.icon, 5, 'big')}<div><div class="dname">${esc(m.name)}</div><div class="dsub">等级 ${r} / ${m.max}</div></div></div>
        <div class="ddesc">每级：${esc(st.name)} ${esc(st.fmt(m.per))}</div>
        <div class="ddesc">当前：${r ? esc(st.name) + ' ' + esc(st.fmt(+(m.per * r).toFixed(3))) : '无'}</div>
        <div class="cost">${r >= m.max ? '已满级' : `价格：${img('coin', 2)} ${U.fmtNum(cost)}`}</div>
        <div class="hint">按 确认 购买。每购买一项，所有强化价格上涨 10%，可随时全额退款重新分配。</div>`;
    },
    onAct(a, el) {
      if (a === 'back') return UI.show('title');
      if (a === 'refund') {
        if (PS.save.data.metaSpent <= 0) { sfx('deny'); return; }
        UI.show('confirm', {
          text: '退还全部强化并返还 ' + U.fmtNum(PS.save.data.metaSpent) + ' 金币？',
          yes: () => { PS.save.refundMeta(); UI.show('shop'); },
          no: () => UI.show('shop'),
        });
        return;
      }
      const id = el.dataset.id;
      if (PS.save.buyMeta(id)) {
        sfx('coin');
        UI.render(id);
      } else {
        sfx('deny');
        el.classList.remove('shake');
        void el.offsetWidth;
        el.classList.add('shake');
      }
    },
    onBack() { UI.show('title'); },
  };

  // ---------- 收藏图鉴 ----------
  SCREENS.collection = {
    render(p) {
      const seen = PS.save.data.seen;
      const tab = p.tab || 'weapons';
      let items = [], total = 0, found = 0;
      if (tab === 'weapons') {
        for (const id of D.baseWeapons) {
          const w = D.weapons[id];
          const s = !!seen.weapons[id];
          const es = !!seen.weapons[w.evo.into];
          total += 2;
          found += (s ? 1 : 0) + (es ? 1 : 0);
          items.push(`<div class="card coll ${s ? '' : 'unseen'}" data-nav data-act="sel" data-kind="w" data-id="${id}">${s ? img(w.icon, 3) : `<img class="px" src="${PS.silhouetteURL(w.icon, 3)}" alt="">`}${es ? '<span class="star">★</span>' : ''}</div>`);
        }
      } else if (tab === 'passives') {
        for (const id in D.passives) {
          const pd = D.passives[id];
          const s = !!seen.passives[id];
          total++;
          found += s ? 1 : 0;
          items.push(`<div class="card coll ${s ? '' : 'unseen'}" data-nav data-act="sel" data-kind="p" data-id="${id}">${s ? img(pd.icon, 3) : `<img class="px" src="${PS.silhouetteURL(pd.icon, 3)}" alt="">`}</div>`);
        }
      } else {
        const all = Object.keys(D.enemies).concat(Object.keys(D.bosses));
        for (const id of all) {
          const ed = D.enemies[id] || D.bosses[id];
          const s = !!seen.enemies[id];
          total++;
          found += s ? 1 : 0;
          items.push(`<div class="card coll ${D.bosses[id] ? 'bosscard' : ''} ${s ? '' : 'unseen'}" data-nav data-act="sel" data-kind="e" data-id="${id}">${s ? img(ed.spr, D.bosses[id] ? 1 : 2) : `<img class="px" src="${PS.silhouetteURL(ed.spr, D.bosses[id] ? 1 : 2)}" alt="">`}</div>`);
        }
      }
      const tabs = [['weapons', '武器'], ['passives', '道具'], ['enemies', '怪物']]
        .map(([k, n]) => `<button class="btn tab ${k === tab ? 'on' : ''}" data-nav data-act="tab" data-tab="${k}" data-key="tab-${k}">${n}</button>`).join('');
      return `<div class="screen collection">
        <div class="hdr"><div class="ttl">收藏图鉴</div><div class="found">已发现 ${found} / ${total}</div></div>
        <div class="row tabs">${tabs}</div>
        <div class="split">
          <div class="grid collgrid">${items.join('')}</div>
          <div class="panel detail" id="detail"><div class="hint">选择一项查看详情。武器升到满级并持有对应道具后，开启精英或 Boss 宝箱即可进化！</div></div>
        </div>
        <div class="row btns"><button class="btn" data-nav data-act="back">返回</button></div>
      </div>`;
    },
    onFocus(el) {
      const det = $('#detail');
      if (!det || !el.dataset.id) return;
      const seen = PS.save.data.seen;
      const id = el.dataset.id, k = el.dataset.kind;
      if (k === 'w') {
        const w = D.weapons[id];
        const ev = D.weapons[w.evo.into], pw = D.passives[w.evo.with];
        const s = seen.weapons[id], es = seen.weapons[ev.id];
        det.innerHTML = s
          ? `<div class="dhead">${img(w.icon, 5, 'big')}<div><div class="dname">${esc(w.name)}</div><div class="dsub">武器 · 最高 Lv.${w.maxLevel}</div></div></div>
            <div class="ddesc">${esc(w.desc)}</div>
            <div class="lbl">进化配方</div>
            <div class="recipe">${img(w.icon, 3)}<span>Lv.MAX ＋</span>${img(pw.icon, 3)}<span>→</span>${es ? img(ev.icon, 3) : `<img class="px" src="${PS.silhouetteURL(ev.icon, 3)}" alt="">`}</div>
            <div class="ddesc">${esc(w.name)} 满级 ＋ ${esc(pw.name)} → <b>${es ? esc(ev.name) : '???'}</b></div>
            ${es ? `<div class="ddesc evo">${esc(ev.desc)}</div>` : ''}`
          : '<div class="dname">???</div><div class="ddesc">尚未获得这把武器。</div>';
      } else if (k === 'p') {
        const pd = D.passives[id];
        det.innerHTML = seen.passives[id]
          ? `<div class="dhead">${img(pd.icon, 5, 'big')}<div><div class="dname">${esc(pd.name)}</div><div class="dsub">道具 · 最高 Lv.${pd.max}</div></div></div><div class="ddesc">${esc(pd.desc)}</div>`
          : '<div class="dname">???</div><div class="ddesc">尚未获得这件道具。</div>';
      } else {
        const ed = D.enemies[id] || D.bosses[id];
        const boss = !!D.bosses[id];
        det.innerHTML = seen.enemies[id]
          ? `<div class="dhead">${img(ed.spr, boss ? 3 : 5, 'big')}<div><div class="dname">${esc(ed.name)}</div><div class="dsub">${boss ? 'Boss' : '怪物'}</div></div></div>
            <div class="ddesc">基础生命 ${ed.hp} · 速度 ${ed.spd} · 伤害 ${ed.dmg}</div>`
          : '<div class="dname">???</div><div class="ddesc">尚未遭遇。</div>';
      }
    },
    onAct(a, el) {
      if (a === 'back') return UI.show('title');
      if (a === 'tab') {
        UI.params.tab = el.dataset.tab;
        UI.render('tab-' + el.dataset.tab);
      }
    },
    onBack() { UI.show('title'); },
  };

  // ---------- 设置 ----------
  SCREENS.settings = {
    modal: false,
    render(p) {
      const s = PS.save.data.settings;
      const pct = (v) => Math.round(v * 100) + '%';
      const onoff = (v) => (v ? '开' : '关');
      UI.root.dataset.from = p.from;
      return `<div class="screen settings ${p.from === 'pause' ? 'overlay' : ''}">
        <div class="hdr"><div class="ttl">设置</div></div>
        <div class="panel col setlist">
          <div class="setrow" data-nav data-adj data-act="adj" data-k="music" data-key="music"><span>音乐音量</span><span class="val">◀ ${pct(s.music)} ▶</span></div>
          <div class="setrow" data-nav data-adj data-act="adj" data-k="sfx" data-key="sfx"><span>音效音量</span><span class="val">◀ ${pct(s.sfx)} ▶</span></div>
          <div class="setrow" data-nav data-adj data-act="adj" data-k="shake" data-key="shake"><span>屏幕震动</span><span class="val">◀ ${onoff(s.shake)} ▶</span></div>
          <div class="setrow" data-nav data-adj data-act="adj" data-k="dmgNums" data-key="dmgNums"><span>伤害数字</span><span class="val">◀ ${onoff(s.dmgNums)} ▶</span></div>
          <div class="setrow" data-nav data-adj data-act="adj" data-k="mouseMove" data-key="mouseMove"><span>鼠标按住移动</span><span class="val">◀ ${onoff(s.mouseMove)} ▶</span></div>
          <div class="setrow" data-nav data-act="fullscreen" data-key="fs"><span>全屏模式</span><span class="val">切换</span></div>
          ${p.from === 'pause' ? '' : '<div class="setrow danger" data-nav data-act="reset" data-key="reset"><span>重置存档</span><span class="val">清除</span></div>'}
        </div>
        <div class="row btns"><button class="btn" data-nav data-act="back">返回</button></div>
      </div>`;
    },
    onAct(a, el, dir) {
      const s = PS.save.data.settings;
      if (a === 'back') return this.onBack();
      if (a === 'adj') {
        const k = el.dataset.k;
        dir = dir || 1;
        if (k === 'music' || k === 'sfx') {
          let v = Math.round(s[k] * 10) + dir;
          if (dir > 0 && v > 10 && arguments.length < 3) v = 0;
          s[k] = U.clamp(v, 0, 10) / 10;
          PS.audio.applyVolume();
          if (k === 'sfx') sfx('coin');
        } else s[k] = !s[k];
        PS.save.store();
        UI.render(el.dataset.key);
        return;
      }
      if (a === 'fullscreen') {
        try {
          if (document.fullscreenElement) document.exitFullscreen();
          else document.documentElement.requestFullscreen();
        } catch (e) { /* 不支持 */ }
        return;
      }
      if (a === 'reset') {
        UI.show('confirm', {
          text: '确定要清除所有进度（金币、解锁、强化）吗？此操作无法撤销！',
          yes: () => { PS.save.reset(); UI.show('title'); UI.toast('存档已重置'); },
          no: () => UI.show('settings', { from: 'title' }),
        });
      }
    },
    onBack() {
      if (UI.params.from === 'pause') UI.show('pause');
      else UI.show('title');
    },
  };

  // ---------- 确认对话框 ----------
  SCREENS.confirm = {
    modal: true,
    render(p) {
      return `<div class="panel dialog"><div class="dtext">${esc(p.text)}</div>
        <div class="row btns"><button class="btn" data-nav data-act="no" data-default>取消</button><button class="btn danger" data-nav data-act="yes">确定</button></div></div>`;
    },
    onAct(a) {
      const p = UI.params;
      if (a === 'yes') p.yes();
      else p.no();
    },
    onBack() { UI.params.no(); },
  };

  // ---------- 升级 ----------
  SCREENS.levelup = {
    modal: true,
    lock: 0.35,
    render(p) {
      const g = PS.app.game;
      const lv = g.level - g.pendingLevels + 1;
      const cards = p.opts.map((o, i) => {
        const info = g.optionInfo(o);
        return `<div class="card opt ${info.isNew ? 'isnew' : ''}" data-nav data-act="opt" data-i="${i}" ${i === 0 ? 'data-default' : ''}>
          <div class="oicon">${img(info.icon, 3)}</div>
          <div class="obody">
            <div class="otop"><span class="oname">${esc(info.name)}</span><span class="otag">${esc(info.tag)}</span></div>
            <div class="odesc">${esc(info.desc)}</div>
            <div class="okind">${esc(info.kind)}${info.evo && info.isNew ? ' · 进化：' + esc(info.evo) : ''}</div>
          </div><div class="okey">${i + 1}</div></div>`;
      }).join('');
      const bm = UI.banishMode;
      return `<div class="panel levelup ${bm ? 'banishing' : ''}">
        <div class="ttl">${bm ? '选择要封印的选项' : '升级！'}<span class="lvnum">Lv.${lv}</span></div>
        <div class="col opts">${cards}</div>
        <div class="row btns small">
          <button class="btn ${g.rerolls > 0 ? '' : 'disabled'}" data-nav data-act="reroll">重抽 ×${g.rerolls} <kbd>R</kbd></button>
          <button class="btn ${g.skips > 0 ? '' : 'disabled'}" data-nav data-act="skip">跳过 ×${g.skips} <kbd>F</kbd></button>
          <button class="btn ${g.banishes > 0 ? '' : 'disabled'} ${bm ? 'on' : ''}" data-nav data-act="banish">封印 ×${g.banishes} <kbd>B</kbd></button>
        </div>
        ${PS.input.lastDevice === 'pad' ? '<div class="padhint">X 重抽 · Y 跳过 · LB/RB 封印</div>' : ''}
      </div>`;
    },
    onAct(a, el) {
      const g = PS.app.game;
      const p = UI.params;
      if (a === 'opt') {
        const o = p.opts[+el.dataset.i];
        if (!o) return;
        if (UI.banishMode) {
          if (o.kind === 'gold' || o.kind === 'chicken') { sfx('deny'); return; }
          g.banished.add(o.id);
          g.banishes--;
          UI.banishMode = false;
          p.opts = g.rollOptions();
          UI.render();
          return;
        }
        g.applyOption(o);
        g.finishLevelUp();
        PS.app.afterLevelUp();
      } else if (a === 'reroll') {
        g.rerolls--;
        UI.banishMode = false;
        p.opts = g.rollOptions();
        UI.render();
      } else if (a === 'skip') {
        g.skips--;
        UI.banishMode = false;
        g.addXp(0);
        g.finishLevelUp();
        PS.app.afterLevelUp();
      } else if (a === 'banish') {
        UI.banishMode = !UI.banishMode;
        UI.render();
      }
    },
    onKey(a) {
      if (UI.lockT > 0) return;
      const m = a.match(/^opt(\d)$/);
      if (m) {
        const el = UI.root.querySelector(`[data-act="opt"][data-i="${+m[1] - 1}"]`);
        if (el) UI.activate(el);
        return;
      }
      if (a === 'reroll' || a === 'skip' || a === 'banish') {
        const el = UI.root.querySelector(`[data-act="${a}"]`);
        if (el) UI.activate(el);
      }
    },
    onBack() {
      if (UI.banishMode) {
        UI.banishMode = false;
        UI.render();
      }
    },
    onPause() {},
  };

  // ---------- 宝箱 ----------
  SCREENS.chest = {
    modal: true,
    lock: 0.5,
    render(p) {
      const r = p.res;
      const items = r.items.map((it, i) => `<div class="citem ${it.evo ? 'evo' : ''}" style="animation-delay:${0.15 + i * 0.25}s">
        ${img(it.icon, 3)}<div><div class="cn">${esc(it.name)} <span class="ctag">${esc(it.tag)}</span></div><div class="cd">${esc(it.desc)}</div></div></div>`).join('');
      return `<div class="panel chestpanel">
        <div class="chestimg">${img(r.tier === 2 ? 'chest_boss' : 'chest', 5)}</div>
        <div class="ttl">${r.items.some((i) => i.evo) ? '★ 武器进化！ ★' : '宝箱！'}</div>
        <div class="col citems">${items}</div>
        <div class="cgold">${img('coin', 2)} +${r.gold}</div>
        <div class="row btns"><button class="btn primary" data-nav data-act="ok" data-default>继续</button></div>
      </div>`;
    },
    onAct() { PS.app.resume(); },
    onBack() { PS.app.resume(); },
    onPause() {},
  };

  // ---------- 暂停 ----------
  function statsList(g) {
    const s = g.P.st;
    const rows = [
      ['生命', Math.ceil(g.P.hp) + ' / ' + g.P.maxHp],
      ['恢复', s.recovery.toFixed(1) + '/秒'],
      ['护甲', s.armor],
      ['移速', Math.round(s.move * 100) + '%'],
      ['力量', Math.round(s.might * 100) + '%'],
      ['范围', Math.round(s.area * 100) + '%'],
      ['弹速', Math.round(s.speed * 100) + '%'],
      ['持续', Math.round(s.duration * 100) + '%'],
      ['数量', '+' + s.amount],
      ['冷却', Math.round(s.cooldown * 100) + '%'],
      ['幸运', Math.round(s.luck * 100) + '%'],
      ['成长', Math.round(s.growth * 100) + '%'],
      ['贪婪', Math.round(s.greed * 100) + '%'],
      ['拾取', Math.round(s.magnet * 100) + '%'],
      ['复活', g.P.revivals],
      ['体力', Math.floor(g.P.sta) + ' / ' + g.P.staMax],
    ];
    return rows.map(([k, v]) => `<div class="st"><span>${k}</span><b>${v}</b></div>`).join('');
  }
  function buildList(g) {
    const ws = g.weapons.map((w) => `<div class="bitem ${w.def.evolved ? 'evo' : ''}">${img(w.def.icon, 2)}<span>${esc(w.def.name)}</span><b>${w.def.evolved && !g.endless ? '★' : 'Lv.' + w.level}</b></div>`).join('');
    const ps = g.passives.map((p) => `<div class="bitem">${img(p.def.icon, 2)}<span>${esc(p.def.name)}</span><b>Lv.${p.level}</b></div>`).join('');
    return `<div class="lbl">武器</div><div class="blist">${ws || '-'}</div><div class="lbl">道具</div><div class="blist">${ps || '-'}</div>`;
  }
  SCREENS.pause = {
    modal: true,
    render() {
      const g = PS.app.game;
      return `<div class="panel pausepanel">
        <div class="ttl">暂停</div>
        <div class="split">
          <div class="col">${buildList(g)}</div>
          <div class="stats">${statsList(g)}</div>
        </div>
        <div class="row btns">
          <button class="btn primary" data-nav data-act="resume" data-default>继续游戏</button>
          <button class="btn" data-nav data-act="settings">设置</button>
          <button class="btn danger" data-nav data-act="quit">放弃本局</button>
        </div>
      </div>`;
    },
    onAct(a) {
      if (a === 'resume') PS.app.resume();
      else if (a === 'settings') UI.show('settings', { from: 'pause' });
      else if (a === 'quit') {
        UI.show('confirm', {
          text: '放弃本局？已获得的金币会保留。',
          yes: () => PS.app.quitRun(),
          no: () => UI.show('pause'),
        });
      }
    },
    onBack() { PS.app.resume(); },
    onPause() { PS.app.resume(); },
  };

  // ---------- 结算 ----------
  SCREENS.over = {
    modal: true,
    lock: 0.8,
    render(p) {
      const g = PS.app.game;
      const rows = g.weapons.slice().sort((a, b) => b.dmg - a.dmg).map((w) => {
        const t = Math.max(1, g.time - w.t0);
        return `<tr><td>${img(w.def.icon, 2)}</td><td>${esc(w.def.name)}</td><td>${w.def.evolved && !g.endless ? '★' : w.level}</td><td>${U.fmtNum(w.dmg)}</td><td>${U.fmtNum(w.dmg / t)}</td><td>${U.fmtNum(w.kills)}</td></tr>`;
      }).join('');
      const unl = (p.unlocks || []).map((u) => `<div class="unl">${u.kind === 'char' ? img('ch_' + u.id, 3) : img(STAGE_ICON[u.id], 1)}<span>解锁${u.kind === 'char' ? '角色' : '关卡'}：${esc(u.name)}</span></div>`).join('');
      const title = g.endless ? '无尽之旅结束' : p.victory ? '胜 利 ！' : p.quit ? '已放弃' : '你倒下了…';
      const record = g.endless ? `<div class="record">${p.record ? '★ 新纪录！' : '无尽最佳'} ${U.fmtTime(PS.save.data.stats.endlessBest[g.stageId] || 0)} · ${esc(D.stages[g.stageId].name)} · 第 ${g.cycle + 1} 轮</div>` : '';
      return `<div class="panel overpanel ${p.victory ? 'victory' : ''}">
        <div class="ttl big">${title}</div>
        ${record}
        <div class="row summary">
          <div class="sm"><span>存活</span><b>${U.fmtTime(g.time)}</b></div>
          <div class="sm"><span>等级</span><b>${g.level}</b></div>
          <div class="sm"><span>击杀</span><b>${U.fmtNum(g.kills)}</b></div>
          <div class="sm"><span>金币</span><b>${img('coin', 2)}${U.fmtNum(Math.floor(g.gold))}</b></div>
        </div>
        <table class="wtable"><thead><tr><th></th><th>武器</th><th>等级</th><th>伤害</th><th>DPS</th><th>击杀</th></tr></thead><tbody>${rows}</tbody></table>
        ${unl ? `<div class="unlocks">${unl}</div>` : ''}
        <div class="row btns">
          <button class="btn primary" data-nav data-act="retry" data-default>再来一局</button>
          <button class="btn" data-nav data-act="menu">返回主菜单</button>
        </div>
      </div>`;
    },
    onAct(a) {
      if (a === 'retry') PS.app.retry();
      else PS.app.toMenu();
    },
    onBack() { PS.app.toMenu(); },
    onPause() {},
  };
})();
