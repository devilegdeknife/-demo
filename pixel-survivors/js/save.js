'use strict';
// 存档：金币、局外强化、解锁、图鉴、统计、设置（localStorage，失败时仅保存在内存中）
(function () {
  const PS = (window.PS = window.PS || {});
  const D = PS.DATA;
  const KEY = 'pixelSurvivors.save.v1';

  const S = (PS.save = { data: null });

  S.defaults = function () {
    return {
      gold: 0,
      metaSpent: 0,
      meta: {},
      chars: ['knight', 'mage'],
      stages: ['graveyard'],
      seen: { weapons: {}, passives: {}, enemies: {} },
      stats: { runs: 0, totalKills: 0, maxLevel: 0, bestTime: {}, bossKills: 0, chests: 0, evolutions: 0, totalGold: 0, wins: 0, bestKills: 0, endlessBest: {} },
      settings: { music: 0.5, sfx: 0.7, shake: true, dmgNums: true, mouseMove: true },
      last: { char: 'knight', stage: 'graveyard', ult: '' },
    };
  };

  function merge(def, src) {
    if (typeof def !== 'object' || def === null || Array.isArray(def)) return src === undefined ? def : src;
    const out = {};
    for (const k in def) out[k] = merge(def[k], src ? src[k] : undefined);
    if (src && typeof src === 'object') for (const k in src) if (!(k in out)) out[k] = src[k];
    return out;
  }

  S.load = function () {
    let d = null;
    try {
      const s = window.localStorage.getItem(KEY);
      if (s) d = JSON.parse(s);
    } catch (e) {
      d = null;
    }
    S.data = merge(S.defaults(), d || {});
    // 校验数组字段
    if (!Array.isArray(S.data.chars)) S.data.chars = ['knight', 'mage'];
    if (!Array.isArray(S.data.stages)) S.data.stages = ['graveyard'];
    for (const id of D.charOrder) if (D.chars[id].unlock.type === 'default' && !S.data.chars.includes(id)) S.data.chars.push(id);
  };

  S.store = function () {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(S.data));
      return true;
    } catch (e) {
      return false;
    }
  };

  S.reset = function () {
    const settings = S.data.settings;
    S.data = S.defaults();
    S.data.settings = settings;
    S.store();
  };

  S.markSeen = function (cat, id) {
    const c = S.data.seen[cat];
    if (c && !c[id]) c[id] = 1;
  };

  // ---------- 局外强化 ----------
  S.metaRank = (id) => S.data.meta[id] || 0;
  S.totalRanks = () => Object.values(S.data.meta).reduce((a, b) => a + b, 0);
  S.metaCost = function (id) {
    const m = D.meta[id];
    const r = S.metaRank(id);
    if (r >= m.max) return Infinity;
    return Math.round(m.base * (r + 1) * (1 + 0.1 * S.totalRanks()));
  };
  S.buyMeta = function (id) {
    const c = S.metaCost(id);
    if (c === Infinity || S.data.gold < c) return false;
    S.data.gold -= c;
    S.data.metaSpent += c;
    S.data.meta[id] = S.metaRank(id) + 1;
    S.store();
    return true;
  };
  S.refundMeta = function () {
    S.data.gold += S.data.metaSpent;
    S.data.metaSpent = 0;
    S.data.meta = {};
    S.store();
  };
  // 局外强化提供的属性总和
  S.metaStats = function () {
    const out = {};
    for (const id in D.meta) {
      const r = S.metaRank(id);
      if (!r) continue;
      const m = D.meta[id];
      out[m.stat] = (out[m.stat] || 0) + m.per * r;
    }
    return out;
  };

  // ---------- 解锁 ----------
  // live: 当前（存档 + 本局）合并后的统计
  S.liveStats = function (game) {
    const st = S.data.stats;
    const live = {
      totalKills: st.totalKills, maxLevel: st.maxLevel, bestTime: Object.assign({}, st.bestTime),
      bossKills: st.bossKills, chests: st.chests, evolutions: st.evolutions, totalGold: st.totalGold, wins: st.wins,
    };
    // 无尽模式的成绩不计入普通模式的解锁条件
    if (game && !game.committed && !game.endless) {
      live.totalKills += game.kills;
      live.maxLevel = Math.max(live.maxLevel, game.level);
      live.bestTime[game.stageId] = Math.max(live.bestTime[game.stageId] || 0, game.time);
      live.bossKills += game.run.bossKills;
      live.chests += game.run.chests;
      live.evolutions += game.run.evolutions;
      live.totalGold += Math.floor(game.gold);
      live.wins += game.victory ? 1 : 0;
    }
    live.bestAny = Math.max(0, ...Object.values(live.bestTime));
    return live;
  };

  S.condMet = function (u, live) {
    switch (u.type) {
      case 'default': return true;
      case 'survive': return live.bestAny >= u.v;
      case 'surviveStage': return (live.bestTime[u.stage] || 0) >= u.v;
      case 'level': return live.maxLevel >= u.v;
      case 'kills': return live.totalKills >= u.v;
      case 'boss': return live.bossKills >= u.v;
      case 'chests': return live.chests >= u.v;
      case 'evolve': return live.evolutions >= u.v;
      case 'gold': return live.totalGold >= u.v;
      case 'win': return live.wins >= u.v;
    }
    return false;
  };

  // 检查并立即保存新的解锁，返回新解锁列表
  S.checkUnlocks = function (game) {
    const live = S.liveStats(game);
    const out = [];
    for (const id of D.charOrder) {
      if (S.data.chars.includes(id)) continue;
      if (S.condMet(D.chars[id].unlock, live)) {
        S.data.chars.push(id);
        out.push({ kind: 'char', id, name: D.chars[id].name });
      }
    }
    for (const id of D.stageOrder) {
      if (S.data.stages.includes(id)) continue;
      if (S.condMet(D.stages[id].unlock, live)) {
        S.data.stages.push(id);
        out.push({ kind: 'stage', id, name: D.stages[id].name });
      }
    }
    if (out.length) S.store();
    return out;
  };

  // 一局结束：写入统计与金币
  S.commitRun = function (game) {
    if (game.committed) return [];
    if (game.endless) {
      // 无尽模式：只记录金币、局数与该关卡的无尽最佳时间
      const st = S.data.stats;
      const gold = Math.floor(game.gold);
      st.runs++;
      st.endlessBest[game.stageId] = Math.max(st.endlessBest[game.stageId] || 0, Math.floor(game.time));
      S.data.gold += gold;
      S.data.last = { char: game.charId, stage: game.stageId, ult: game.opts.ultimate || '' };
      game.committed = true;
      S.store();
      return [];
    }
    const unlocks = S.checkUnlocks(game);
    const st = S.data.stats;
    st.runs++;
    st.totalKills += game.kills;
    st.maxLevel = Math.max(st.maxLevel, game.level);
    st.bestTime[game.stageId] = Math.max(st.bestTime[game.stageId] || 0, Math.floor(game.time));
    st.bossKills += game.run.bossKills;
    st.chests += game.run.chests;
    st.evolutions += game.run.evolutions;
    st.bestKills = Math.max(st.bestKills, game.kills);
    const gold = Math.floor(game.gold);
    st.totalGold += gold;
    if (game.victory) st.wins++;
    S.data.gold += gold;
    S.data.last = Object.assign({}, S.data.last, { char: game.charId, stage: game.stageId });
    game.committed = true;
    S.store();
    return unlocks;
  };
})();
