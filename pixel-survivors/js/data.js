'use strict';
// 游戏数据：武器、被动、敌人、Boss、角色、关卡、局外强化
(function () {
  const PS = (window.PS = window.PS || {});
  const D = (PS.DATA = {});

  // ---------- 属性标签 ----------
  D.STAT = {
    maxHp: { name: '最大生命', fmt: (v) => '+' + v },
    hpPct: { name: '最大生命', fmt: (v) => '+' + Math.round(v * 100) + '%' },
    recovery: { name: '生命恢复', fmt: (v) => '+' + (+v.toFixed(2)) + '/秒' },
    armor: { name: '护甲', fmt: (v) => '+' + v },
    move: { name: '移动速度', fmt: (v) => (v >= 0 ? '+' : '') + Math.round(v * 100) + '%' },
    might: { name: '力量', fmt: (v) => (v >= 0 ? '+' : '') + Math.round(v * 100) + '%' },
    area: { name: '范围', fmt: (v) => '+' + Math.round(v * 100) + '%' },
    speed: { name: '弹速', fmt: (v) => '+' + Math.round(v * 100) + '%' },
    duration: { name: '持续时间', fmt: (v) => '+' + Math.round(v * 100) + '%' },
    amount: { name: '投射物数量', fmt: (v) => '+' + v },
    cooldown: { name: '冷却', fmt: (v) => Math.round(v * 100) + '%' },
    luck: { name: '幸运', fmt: (v) => '+' + Math.round(v * 100) + '%' },
    growth: { name: '经验获取', fmt: (v) => '+' + Math.round(v * 100) + '%' },
    greed: { name: '金币获取', fmt: (v) => '+' + Math.round(v * 100) + '%' },
    magnet: { name: '拾取范围', fmt: (v) => '+' + Math.round(v * 100) + '%' },
    revival: { name: '复活次数', fmt: (v) => '+' + v },
    reroll: { name: '重抽次数', fmt: (v) => '+' + v },
    skip: { name: '跳过次数', fmt: (v) => '+' + v },
    banish: { name: '封印次数', fmt: (v) => '+' + v },
  };

  // 武器升级字段文字
  const WLV = {
    dmg: (v) => '伤害 +' + v,
    amount: (v) => '数量 +' + v,
    cd: (v) => '冷却 ' + v + '秒',
    area: (v) => '范围 +' + Math.round(v * 100) + '%',
    speed: (v) => '速度 +' + Math.round(v * 100) + '%',
    dur: (v) => '持续 +' + v + '秒',
    pierce: (v) => '穿透 +' + v,
    hitDelay: (v) => '攻击间隔 ' + v + '秒',
  };
  D.levelText = (lv) => Object.keys(lv).filter((k) => WLV[k]).map((k) => WLV[k](lv[k])).join('，');

  // ---------- 武器 ----------
  // base: dmg 伤害, cd 冷却, amount 数量, area 范围倍率, speed 速度倍率, dur 持续(秒), pierce 穿透, kb 击退, hitDelay 重复命中间隔
  D.weapons = {
    whip: {
      name: '皮鞭', icon: 'i_whip', type: 'slash',
      desc: '向面朝方向横扫，贯穿路径上的所有敌人。',
      base: { dmg: 12, cd: 1.35, amount: 1, area: 1, speed: 1, dur: 0, pierce: 999, kb: 1 },
      levels: [{ amount: 1 }, { dmg: 5 }, { dmg: 5, area: 0.1 }, { dmg: 5 }, { dmg: 5, area: 0.1 }, { dmg: 5 }, { dmg: 5 }],
      evo: { with: 'hollowheart', into: 'bloodwhip' },
    },
    wand: {
      name: '魔杖', icon: 'i_wand', type: 'nearest', pspr: 'p_bolt',
      desc: '向最近的敌人发射魔法飞弹。',
      base: { dmg: 10, cd: 1.2, amount: 1, area: 1, speed: 1, dur: 0, pierce: 1, kb: 0.6 },
      levels: [{ amount: 1 }, { cd: -0.2 }, { amount: 1 }, { dmg: 10 }, { amount: 1 }, { pierce: 1 }, { dmg: 10 }],
      evo: { with: 'tome', into: 'holywand' },
    },
    knife: {
      name: '飞刀', icon: 'i_knife', type: 'facing', pspr: 'p_knife',
      desc: '朝移动方向快速掷出飞刀，会自动瞄准前方的敌人。',
      base: { dmg: 7, cd: 1.0, amount: 1, area: 1, speed: 1, dur: 0, pierce: 1, kb: 0.4 },
      levels: [{ amount: 1 }, { amount: 1, dmg: 5 }, { amount: 1 }, { pierce: 1 }, { amount: 1 }, { amount: 1, dmg: 5 }, { pierce: 1 }],
      evo: { with: 'wings', into: 'thousand' },
    },
    axe: {
      name: '战斧', icon: 'p_axe', type: 'axe',
      desc: '向上抛出沉重的战斧，落下时砸穿敌人。',
      base: { dmg: 20, cd: 3.5, amount: 1, area: 1, speed: 1, dur: 0, pierce: 3, kb: 0.6 },
      levels: [{ amount: 1 }, { dmg: 20 }, { pierce: 2 }, { amount: 1 }, { dmg: 20 }, { pierce: 2 }, { amount: 1 }],
      evo: { with: 'candelabra', into: 'spiral' },
    },
    cross: {
      name: '十字回旋', icon: 'p_cross', type: 'boom',
      desc: '掷向最近的敌人，飞出后折返。',
      base: { dmg: 10, cd: 2.0, amount: 1, area: 1, speed: 1, dur: 0, pierce: 999, kb: 0.5, hitDelay: 0.45 },
      levels: [{ dmg: 10 }, { area: 0.1 }, { amount: 1 }, { dmg: 10 }, { speed: 0.25 }, { amount: 1 }, { dmg: 10 }],
      evo: { with: 'clover', into: 'heaven' },
    },
    holywater: {
      name: '圣水', icon: 'p_flask', type: 'pool',
      desc: '投掷圣水瓶，在地面形成持续伤害的圣域。',
      base: { dmg: 10, cd: 4.5, amount: 1, area: 1, speed: 1, dur: 2.0, pierce: 999, kb: 0, hitDelay: 0.6 },
      levels: [{ amount: 1, area: 0.2 }, { dmg: 10, dur: 0.5 }, { amount: 1, area: 0.2 }, { dmg: 10, dur: 0.3 }, { amount: 1 }, { dmg: 5, dur: 0.3 }, { dmg: 5, area: 0.2 }],
      evo: { with: 'attractorb', into: 'sanctum' },
    },
    garlic: {
      name: '大蒜', icon: 'i_garlic', type: 'aura',
      desc: '持续伤害并击退靠近的敌人。',
      base: { dmg: 5, cd: 0, amount: 0, area: 1, speed: 1, dur: 0, pierce: 999, kb: 0.35, hitDelay: 1.0 },
      levels: [{ dmg: 2, area: 0.4 }, { dmg: 1, hitDelay: -0.1 }, { dmg: 1, area: 0.2 }, { dmg: 2, hitDelay: -0.1 }, { dmg: 1, area: 0.2 }, { dmg: 1, hitDelay: -0.1 }, { dmg: 2, area: 0.2 }],
      evo: { with: 'pummarola', into: 'souleater' },
    },
    bible: {
      name: '圣经', icon: 'p_book', type: 'orbit',
      desc: '书本环绕角色旋转，撞开敌人。',
      base: { dmg: 10, cd: 3.0, amount: 1, area: 1, speed: 1, dur: 3.0, pierce: 999, kb: 0.8, hitDelay: 0.5 },
      levels: [{ amount: 1 }, { speed: 0.3 }, { dmg: 10, area: 0.25 }, { dur: 0.5 }, { amount: 1 }, { speed: 0.3, dmg: 10 }, { amount: 1 }],
      evo: { with: 'spellbinder', into: 'vespers' },
    },
    lightning: {
      name: '雷霆之戒', icon: 'i_bolt', type: 'strike',
      desc: '召唤落雷随机劈向附近的敌人。',
      base: { dmg: 15, cd: 4.5, amount: 2, area: 1, speed: 1, dur: 0, pierce: 999, kb: 0 },
      levels: [{ amount: 1 }, { dmg: 10, area: 0.25 }, { amount: 1 }, { dmg: 20, area: 0.25 }, { amount: 1 }, { dmg: 20, area: 0.25 }, { amount: 1 }],
      evo: { with: 'duplicator', into: 'storm' },
    },
    firewand: {
      name: '火焰权杖', icon: 'i_fire', type: 'fireball', pspr: 'p_fire',
      desc: '向随机敌人发射爆炸火球。',
      base: { dmg: 20, cd: 3.0, amount: 2, area: 1, speed: 1, dur: 0, pierce: 1, kb: 0.5 },
      levels: [{ dmg: 10 }, { dmg: 10, speed: 0.2 }, { amount: 1 }, { dmg: 10 }, { amount: 1, speed: 0.2 }, { dmg: 10 }, { amount: 1 }],
      evo: { with: 'spinach', into: 'hellfire' },
    },
    frost: {
      name: '寒冰新星', icon: 'i_frost', type: 'nova',
      desc: '释放向外扩散的寒冰波，减速甚至冻结敌人。',
      base: { dmg: 8, cd: 4.0, amount: 1, area: 1, speed: 1, dur: 2.0, pierce: 999, kb: 0.3, freeze: 0.1 },
      levels: [{ area: 0.2 }, { dmg: 8 }, { dur: 0.5, cd: -0.3 }, { area: 0.2 }, { dmg: 8, amount: 1 }, { dur: 0.5, cd: -0.3 }, { dmg: 10, area: 0.2 }],
      evo: { with: 'armor', into: 'zero' },
    },
    runetracer: {
      name: '符文追踪者', icon: 'p_rune', type: 'bounce', pspr: 'p_rune',
      desc: '在视野边缘来回弹射的符文。',
      base: { dmg: 10, cd: 3.0, amount: 1, area: 1, speed: 1, dur: 2.25, pierce: 999, kb: 0.4, hitDelay: 0.35 },
      levels: [{ dmg: 5, speed: 0.2 }, { dur: 0.3, dmg: 5 }, { amount: 1 }, { dmg: 5, speed: 0.2 }, { dur: 0.3, dmg: 5 }, { amount: 1 }, { dur: 0.5 }],
      evo: { with: 'bracer', into: 'void' },
    },

    // ---------- 进化武器 ----------
    bloodwhip: {
      name: '噬血之鞭', icon: 'i_bloodwhip', type: 'slash', evolved: true, from: 'whip',
      desc: '鞭击可暴击，暴击时吸取生命。',
      base: { dmg: 50, cd: 1.2, amount: 2, area: 1.4, speed: 1, dur: 0, pierce: 999, kb: 1.2, crit: 0.25, critMul: 2, healCrit: 2 },
    },
    holywand: {
      name: '神圣魔杖', icon: 'i_holywand', type: 'nearest', evolved: true, from: 'wand', pspr: 'p_bolt2',
      desc: '几乎没有冷却地倾泻圣光飞弹。',
      base: { dmg: 20, cd: 0.12, amount: 1, area: 1.3, speed: 1.3, dur: 0, pierce: 2, kb: 0.6 },
    },
    thousand: {
      name: '千刃', icon: 'i_thousand', type: 'facing', evolved: true, from: 'knife', pspr: 'p_knife',
      desc: '无止境的飞刀洪流。',
      base: { dmg: 16, cd: 0.07, amount: 1, area: 1.2, speed: 1.2, dur: 0, pierce: 3, kb: 0.4 },
    },
    spiral: {
      name: '死亡螺旋', icon: 'i_spiral', type: 'spiral', evolved: true, from: 'axe',
      desc: '向四周放射旋转的巨斧，无限穿透。',
      base: { dmg: 60, cd: 2.8, amount: 8, area: 1.8, speed: 1, dur: 0, pierce: 999, kb: 0.8 },
    },
    heaven: {
      name: '天堂之剑', icon: 'i_heaven', type: 'boom', evolved: true, from: 'cross',
      desc: '巨大的圣十字，可造成暴击。',
      base: { dmg: 40, cd: 1.5, amount: 3, area: 1.5, speed: 1.3, dur: 0, pierce: 999, kb: 0.6, hitDelay: 0.35, crit: 0.3, critMul: 2.5 },
    },
    sanctum: {
      name: '灵魂圣域', icon: 'i_sanctum', type: 'pool', evolved: true, from: 'holywater',
      desc: '圣域会不断扩大并追随角色。',
      base: { dmg: 25, cd: 3.0, amount: 4, area: 1.5, speed: 1, dur: 4.5, pierce: 999, kb: 0, hitDelay: 0.4, chase: 1 },
    },
    souleater: {
      name: '噬魂者', icon: 'i_souleater', type: 'aura', evolved: true, from: 'garlic',
      desc: '巨大的灵魂光环，每次命中都会回复生命。',
      base: { dmg: 18, cd: 0, amount: 0, area: 2.2, speed: 1, dur: 0, pierce: 999, kb: 0.6, hitDelay: 0.5, healHit: 0.15 },
    },
    vespers: {
      name: '永恒圣典', icon: 'i_vespers', type: 'orbit', evolved: true, from: 'bible',
      desc: '圣典永远环绕，永不停歇。',
      base: { dmg: 30, cd: 0, amount: 5, area: 1.5, speed: 1.6, dur: 0, pierce: 999, kb: 1, hitDelay: 0.4, permanent: 1 },
    },
    storm: {
      name: '雷暴', icon: 'i_storm', type: 'strike', evolved: true, from: 'lightning',
      desc: '每道落雷都会在原地再次轰击。',
      base: { dmg: 55, cd: 3.5, amount: 6, area: 2.0, speed: 1, dur: 0, pierce: 999, kb: 0, double: 1 },
    },
    hellfire: {
      name: '地狱火', icon: 'i_hellfire', type: 'fireball', evolved: true, from: 'firewand', pspr: 'p_fire2',
      desc: '缓慢而巨大的陨火，贯穿并引发大爆炸。',
      base: { dmg: 70, cd: 2.0, amount: 4, area: 1.6, speed: 0.8, dur: 0, pierce: 6, kb: 0.8 },
    },
    zero: {
      name: '绝对零度', icon: 'i_zero', type: 'nova', evolved: true, from: 'frost',
      desc: '冻结一切的极寒风暴。',
      base: { dmg: 40, cd: 3.0, amount: 2, area: 1.8, speed: 1, dur: 3.0, pierce: 999, kb: 0.3, freeze: 1 },
    },
    void: {
      name: '虚空回响', icon: 'i_void', type: 'bounce', evolved: true, from: 'runetracer', pspr: 'p_rune',
      desc: '大量虚空符文持续弹射。',
      base: { dmg: 40, cd: 2.5, amount: 4, area: 1.6, speed: 1.4, dur: 4.0, pierce: 999, kb: 0.5, hitDelay: 0.3 },
    },
  };
  for (const id in D.weapons) {
    const w = D.weapons[id];
    w.id = id;
    if (!w.levels) w.levels = [];
    w.maxLevel = w.levels.length + 1;
  }
  D.baseWeapons = Object.keys(D.weapons).filter((k) => !D.weapons[k].evolved);

  // ---------- 被动道具 ----------
  D.passives = {
    spinach: { name: '菠菜', icon: 'i_spinach', stat: 'might', per: 0.1, max: 5, desc: '伤害提高 10%。' },
    armor: { name: '护甲', icon: 'i_armor', stat: 'armor', per: 1, max: 5, desc: '受到的伤害减少 1。' },
    hollowheart: { name: '空心之心', icon: 'i_hollow', stat: 'hpPct', per: 0.2, max: 5, desc: '最大生命提高 20%。' },
    pummarola: { name: '番茄', icon: 'i_tomato', stat: 'recovery', per: 0.2, max: 5, desc: '每秒恢复 0.2 生命。' },
    tome: { name: '空白之书', icon: 'i_tome', stat: 'cooldown', per: -0.08, max: 5, desc: '武器冷却缩短 8%。' },
    candelabra: { name: '烛台', icon: 'i_candle', stat: 'area', per: 0.1, max: 5, desc: '攻击范围扩大 10%。' },
    bracer: { name: '护腕', icon: 'i_bracer', stat: 'speed', per: 0.1, max: 5, desc: '投射物速度提高 10%。' },
    spellbinder: { name: '咒缚卷轴', icon: 'i_scroll', stat: 'duration', per: 0.1, max: 5, desc: '武器效果持续时间延长 10%。' },
    duplicator: { name: '复制之戒', icon: 'i_dup', stat: 'amount', per: 1, max: 2, desc: '投射物数量 +1。' },
    wings: { name: '天使之翼', icon: 'i_wings', stat: 'move', per: 0.1, max: 5, desc: '移动速度提高 10%。' },
    attractorb: { name: '吸引之球', icon: 'i_orb', stat: 'magnet', per: 0.3, max: 5, desc: '拾取范围扩大 30%。' },
    clover: { name: '四叶草', icon: 'i_clover', stat: 'luck', per: 0.1, max: 5, desc: '幸运提高 10%（更多掉落与选项）。' },
    crown: { name: '王冠', icon: 'i_crown', stat: 'growth', per: 0.08, max: 5, desc: '获得的经验提高 8%。' },
  };
  for (const id in D.passives) D.passives[id].id = id;

  // ---------- 敌人 ----------
  // hp 生命, spd 速度(像素/秒), dmg 接触伤害, xp 经验, r 碰撞半径, kb 击退抗性
  D.enemies = {
    bat: { name: '蝙蝠', spr: 'bat', hp: 4, spd: 56, dmg: 5, xp: 1, r: 5, kb: 0, fly: true, anim: 'flap' },
    zombie: { name: '僵尸', spr: 'zombie', hp: 10, spd: 36, dmg: 8, xp: 1, r: 6, kb: 0.1 },
    skeleton: { name: '骷髅兵', spr: 'skeleton', hp: 16, spd: 42, dmg: 10, xp: 2, r: 6, kb: 0.1 },
    ghost: { name: '幽灵', spr: 'ghost', hp: 12, spd: 50, dmg: 8, xp: 2, r: 6, kb: 0, fly: true, alpha: 0.75 },
    slime: { name: '史莱姆', spr: 'slime', hp: 24, spd: 30, dmg: 10, xp: 3, r: 7, kb: 0.2, split: 'minislime', splitN: 2, anim: 'squish' },
    minislime: { name: '小史莱姆', spr: 'minislime', hp: 8, spd: 46, dmg: 6, xp: 1, r: 4, kb: 0, anim: 'squish' },
    mummy: { name: '木乃伊', spr: 'mummy', hp: 70, spd: 30, dmg: 15, xp: 5, r: 7, kb: 0.6 },
    werewolf: { name: '狼人', spr: 'werewolf', hp: 45, spd: 66, dmg: 14, xp: 4, r: 7, kb: 0.3 },
    eye: { name: '邪眼', spr: 'eye', hp: 30, spd: 38, dmg: 10, xp: 4, r: 6, kb: 0.2, fly: true, ranged: { range: 130, cd: 3.2, spd: 90, dmg: 8, spr: 'eb_purple' } },
    mushroom: { name: '毒蘑菇', spr: 'mushroom', hp: 35, spd: 28, dmg: 12, xp: 3, r: 6, kb: 0.3 },
    spider: { name: '洞穴蜘蛛', spr: 'spider', hp: 20, spd: 70, dmg: 9, xp: 2, r: 6, kb: 0 },
    knight: { name: '亡灵骑士', spr: 'knight', hp: 140, spd: 40, dmg: 20, xp: 8, r: 7, kb: 0.7 },
    demon: { name: '恶魔', spr: 'demon', hp: 90, spd: 58, dmg: 18, xp: 6, r: 7, kb: 0.4, fly: true },
    golem: { name: '石像魔', spr: 'golem', hp: 260, spd: 26, dmg: 26, xp: 12, r: 8, kb: 0.9 },
    imp: { name: '火小鬼', spr: 'imp', hp: 28, spd: 62, dmg: 12, xp: 3, r: 5, kb: 0.1, fly: true, ranged: { range: 110, cd: 2.6, spd: 100, dmg: 10, spr: 'eb_fire' } },
  };
  for (const id in D.enemies) D.enemies[id].id = id;

  // ---------- Boss ----------
  // attacks: dash 冲锋, jump 跳跃砸地, radial 环形弹幕, aimed 扇形瞄准, spiral 螺旋弹幕, summon 召唤, teleport 瞬移, hazard 地面陷阱
  D.bosses = {
    slime_king: {
      name: '史莱姆王', spr: 'b_slime', hp: 1500, spd: 34, dmg: 25, r: 14, xp: 120,
      attacks: [
        { t: 'jump', cd: 5 },
        { t: 'summon', cd: 9, e: 'minislime', n: 8 },
        { t: 'radial', cd: 7, n: 12, spd: 70, dmg: 12, spr: 'eb_green' },
      ],
    },
    lich: {
      name: '骸骨巫妖', spr: 'b_lich', hp: 3600, spd: 30, dmg: 28, r: 13, xp: 200,
      attacks: [
        { t: 'teleport', cd: 7 },
        { t: 'spiral', cd: 8, arms: 3, dur: 3, spd: 80, dmg: 14, spr: 'eb_purple' },
        { t: 'summon', cd: 10, e: 'skeleton', n: 10 },
        { t: 'aimed', cd: 3, n: 5, spread: 0.5, spd: 110, dmg: 14, spr: 'eb_purple' },
      ],
    },
    vampire_lord: {
      name: '吸血伯爵', spr: 'b_vampire', hp: 11000, spd: 44, dmg: 35, r: 14, xp: 400,
      attacks: [
        { t: 'dash', cd: 4.5 },
        { t: 'summon', cd: 8, e: 'bat', n: 16 },
        { t: 'radial', cd: 5, n: 20, spd: 80, dmg: 16, spr: 'eb_red' },
        { t: 'spiral', cd: 9, arms: 4, dur: 3, spd: 90, dmg: 16, spr: 'eb_red' },
      ],
    },
    treant: {
      name: '远古树妖', spr: 'b_treant', hp: 12000, spd: 26, dmg: 35, r: 15, xp: 400,
      attacks: [
        { t: 'hazard', cd: 4, n: 5, r: 18, dmg: 25 },
        { t: 'summon', cd: 8, e: 'mushroom', n: 10 },
        { t: 'radial', cd: 6, n: 24, spd: 65, dmg: 16, spr: 'eb_green' },
        { t: 'aimed', cd: 3.5, n: 7, spread: 0.7, spd: 100, dmg: 16, spr: 'eb_green' },
      ],
    },
    demon_lord: {
      name: '炎魔领主', spr: 'b_demon', hp: 9000, spd: 40, dmg: 36, r: 14, xp: 300,
      attacks: [
        { t: 'dash', cd: 5 },
        { t: 'hazard', cd: 5, n: 7, r: 16, dmg: 22 },
        { t: 'summon', cd: 9, e: 'imp', n: 10 },
        { t: 'aimed', cd: 2.5, n: 5, spread: 0.45, spd: 120, dmg: 16, spr: 'eb_fire' },
      ],
    },
    reaper: {
      name: '死神', spr: 'b_reaper', hp: 16000, spd: 48, dmg: 45, r: 14, xp: 600,
      attacks: [
        { t: 'teleport', cd: 6 },
        { t: 'dash', cd: 4 },
        { t: 'spiral', cd: 7, arms: 5, dur: 3, spd: 95, dmg: 18, spr: 'eb_purple' },
        { t: 'summon', cd: 8, e: 'ghost', n: 14 },
        { t: 'radial', cd: 5, n: 24, spd: 85, dmg: 18, spr: 'eb_red' },
      ],
    },
  };
  for (const id in D.bosses) D.bosses[id].id = id;

  // ---------- 角色 ----------
  D.chars = {
    knight: {
      name: '亚瑟', title: '流浪骑士', weapon: 'whip',
      look: { head: 'helmet', body: 'armor', colors: { M: 's', A: '6', C: '2', D: '3', P: '3', B: 'k' } },
      bonus: { maxHp: 20, armor: 1 },
      desc: '坚韧的骑士，生命和护甲更高。',
      unlock: { type: 'default' },
    },
    mage: {
      name: '伊梦娜', title: '见习法师', weapon: 'wand',
      look: { head: 'wizard', body: 'robe', colors: { T: '8', U: '2', H: 'e', C: '8', D: '2', A: 'e', B: '4' } },
      bonus: { cooldown: -0.1 },
      desc: '擅长魔法的少女，武器冷却更短。',
      unlock: { type: 'default' },
    },
    priest: {
      name: '克莱瑞克', title: '圣职者', weapon: 'garlic',
      look: { head: 'hood', body: 'robe', colors: { T: 'f', C: 'f', D: 'a', A: 'e', B: '4' } },
      bonus: { recovery: 0.4, maxHp: 10 },
      desc: '受到神的庇佑，持续回复生命。',
      unlock: { type: 'survive', v: 300, txt: '单局存活 5 分钟' },
    },
    rogue: {
      name: '罗宾', title: '林间游侠', weapon: 'knife',
      look: { head: 'hood', body: 'tunic', colors: { T: '5', C: '5', A: '4', D: 'k', P: '4', B: 'k' } },
      bonus: { move: 0.2, speed: 0.1 },
      desc: '身手敏捷，移动与弹速更快。',
      unlock: { type: 'level', v: 15, txt: '单局达到 15 级' },
    },
    woodcutter: {
      name: '波尔', title: '樵夫', weapon: 'axe',
      look: { head: 'bandana', body: 'tunic', colors: { T: '6', H: '4', C: 'r', A: 'k', D: '4', P: '2', B: 'k' } },
      bonus: { might: 0.2, move: -0.1 },
      desc: '力大无穷，但步伐稍慢。',
      unlock: { type: 'kills', v: 3000, txt: '累计击败 3000 名敌人' },
    },
    nun: {
      name: '塞西莉亚', title: '修女', weapon: 'bible',
      look: { head: 'nun', body: 'robe', colors: { T: '3', C: '3', D: '0', A: 'f', B: 'k' } },
      bonus: { area: 0.15, duration: 0.1 },
      desc: '圣典的守护者，范围与持续时间提升。',
      unlock: { type: 'boss', v: 1, txt: '击败任意 Boss' },
    },
    alchemist: {
      name: '帕拉', title: '炼金术士', weapon: 'holywater',
      look: { head: 'hood', body: 'robe', colors: { T: 'h', C: 'h', D: 'i', A: 'b', B: 'k' } },
      bonus: { duration: 0.3, greed: 0.2 },
      desc: '精于调配药剂，效果更持久，金币更多。',
      unlock: { type: 'chests', v: 5, txt: '累计开启 5 个宝箱' },
    },
    stormcaller: {
      name: '托尔', title: '唤雷者', weapon: 'lightning',
      look: { head: 'long', body: 'robe', colors: { H: 'a', C: '2', D: 't', A: 'e', B: 'k' } },
      bonus: { luck: 0.3, might: 0.1 },
      desc: '受雷神眷顾，幸运极高。',
      unlock: { type: 'evolve', v: 1, txt: '进化任意武器' },
    },
    witch: {
      name: '芙蕾雅', title: '冰雪女巫', weapon: 'frost',
      look: { head: 'wizard', body: 'robe', colors: { T: 'd', U: '8', H: 'f', C: 'd', D: '8', A: 'q', B: '2' } },
      bonus: { armor: 2, hpPct: 0.1 },
      desc: '寒冰护体，护甲极高。',
      unlock: { type: 'survive', v: 600, txt: '单局存活 10 分钟' },
    },
    pyromancer: {
      name: '伊芙丽特', title: '炎术士', weapon: 'firewand',
      look: { head: 'long', body: 'robe', colors: { H: '6', C: 'j', D: '1', A: 'm', B: 'k' } },
      bonus: { might: 0.1, area: 0.1 },
      desc: '操纵烈焰，伤害与范围提升。',
      unlock: { type: 'gold', v: 3000, txt: '累计获得 3000 金币' },
    },
    runemaster: {
      name: '卢恩', title: '符文大师', weapon: 'runetracer',
      look: { head: 'hood', body: 'robe', colors: { T: 't', C: 't', D: '2', A: 'd', B: 'k' } },
      bonus: { speed: 0.2, duration: 0.15 },
      desc: '古老符文的继承者，弹速与持续提升。',
      unlock: { type: 'level', v: 40, txt: '单局达到 40 级' },
    },
    hunter: {
      name: '维克托', title: '吸血鬼猎人', weapon: 'cross',
      look: { head: 'widehat', body: 'armor', colors: { T: 'k', U: 'k', H: 'k', M: 'a', C: '1', D: '0', A: '6', P: '0', B: 'k' } },
      bonus: { might: 0.1, move: 0.1, maxHp: 10, magnet: 0.2, amount: 1 },
      desc: '传说中的猎人，各项能力均衡提升。',
      unlock: { type: 'win', v: 1, txt: '通关任意关卡（击败最终 Boss）' },
    },
  };
  for (const id in D.chars) D.chars[id].id = id;
  D.charOrder = Object.keys(D.chars);

  // ---------- 关卡 ----------
  // waves[分钟]: p 敌人权重, min 最少在场数量, iv 刷怪间隔, n 每次数量
  D.stages = {
    graveyard: {
      name: '月光墓园', desc: '亡者在月光下苏醒。适合初次冒险。', theme: 'graveyard', music: 'stage1',
      mapW: 2400, mapH: 2400, hpMul: 0.9, dmgMul: 0.9, goldMul: 1.0, xpMul: 1.0,
      obstacles: { n: 70, types: ['tomb', 'tomb', 'tomb2', 'deadtree', 'rock'] }, braziers: 26,
      unlock: { type: 'default' },
      waves: [
        { p: { bat: 5, zombie: 3 }, min: 12, iv: 1.2, n: 2 },
        { p: { bat: 4, zombie: 5 }, min: 25, iv: 1.0, n: 3 },
        { p: { zombie: 4, skeleton: 4, bat: 2 }, min: 40, iv: 1.0, n: 3 },
        { p: { skeleton: 5, ghost: 3, bat: 3 }, min: 55, iv: 0.9, n: 4 },
        { p: { skeleton: 4, ghost: 4, zombie: 3 }, min: 70, iv: 0.8, n: 4 },
        { p: { ghost: 3, mummy: 2, skeleton: 4 }, min: 80, iv: 0.8, n: 5 },
        { p: { mummy: 3, ghost: 3, bat: 4 }, min: 100, iv: 0.7, n: 5 },
        { p: { mummy: 4, skeleton: 4, werewolf: 2 }, min: 120, iv: 0.7, n: 6 },
        { p: { werewolf: 3, mummy: 3, ghost: 3 }, min: 140, iv: 0.6, n: 6 },
        { p: { werewolf: 4, knight: 1, skeleton: 3 }, min: 160, iv: 0.6, n: 7 },
        { p: { knight: 2, mummy: 3, bat: 4 }, min: 180, iv: 0.55, n: 7 },
        { p: { knight: 3, werewolf: 4, ghost: 3 }, min: 200, iv: 0.5, n: 8 },
        { p: { knight: 3, golem: 1, mummy: 3 }, min: 220, iv: 0.5, n: 8 },
        { p: { golem: 2, knight: 3, werewolf: 3 }, min: 240, iv: 0.45, n: 9 },
        { p: { golem: 2, knight: 4, demon: 2 }, min: 260, iv: 0.4, n: 10 },
        { p: { knight: 4, golem: 3, demon: 3 }, min: 280, iv: 0.35, n: 10 },
      ],
      events: [
        { t: 45, type: 'swarm', e: 'bat', n: 24 },
        { t: 120, type: 'elite', e: 'skeleton' },
        { t: 180, type: 'ring', e: 'zombie', n: 30 },
        { t: 240, type: 'elite', e: 'ghost' },
        { t: 300, type: 'boss', id: 'slime_king' },
        { t: 390, type: 'swarm', e: 'bat', n: 40 },
        { t: 450, type: 'elite', e: 'mummy' },
        { t: 510, type: 'ring', e: 'skeleton', n: 40 },
        { t: 570, type: 'elite', e: 'werewolf' },
        { t: 600, type: 'boss', id: 'lich' },
        { t: 690, type: 'elite', e: 'knight' },
        { t: 720, type: 'swarm', e: 'ghost', n: 50 },
        { t: 780, type: 'elite', e: 'werewolf' },
        { t: 810, type: 'ring', e: 'mummy', n: 40 },
        { t: 840, type: 'elite', e: 'golem' },
        { t: 900, type: 'boss', id: 'vampire_lord', final: true },
      ],
    },
    forest: {
      name: '幽暗森林', desc: '迷雾笼罩的古老森林，怪物更凶猛。', theme: 'forest', music: 'stage2',
      mapW: 2400, mapH: 2400, hpMul: 1.15, dmgMul: 1.05, goldMul: 1.25, xpMul: 1.15,
      obstacles: { n: 90, types: ['pine', 'pine', 'pine', 'bush', 'rock'] }, braziers: 26,
      unlock: { type: 'surviveStage', stage: 'graveyard', v: 600, txt: '在「月光墓园」存活 10 分钟' },
      waves: [
        { p: { bat: 4, slime: 3 }, min: 12, iv: 1.2, n: 2 },
        { p: { slime: 4, mushroom: 3, bat: 2 }, min: 24, iv: 1.0, n: 3 },
        { p: { mushroom: 3, spider: 4, slime: 2 }, min: 38, iv: 0.95, n: 3 },
        { p: { spider: 4, eye: 2, bat: 3 }, min: 58, iv: 0.85, n: 4 },
        { p: { werewolf: 2, spider: 3, mushroom: 3 }, min: 72, iv: 0.8, n: 4 },
        { p: { werewolf: 3, eye: 2, slime: 3 }, min: 86, iv: 0.75, n: 5 },
        { p: { werewolf: 3, mushroom: 3, spider: 4 }, min: 105, iv: 0.7, n: 5 },
        { p: { eye: 3, werewolf: 4, ghost: 2 }, min: 125, iv: 0.65, n: 6 },
        { p: { werewolf: 4, mummy: 2, spider: 3 }, min: 145, iv: 0.6, n: 6 },
        { p: { werewolf: 4, eye: 3, mummy: 3 }, min: 165, iv: 0.55, n: 7 },
        { p: { mummy: 3, golem: 1, werewolf: 3 }, min: 185, iv: 0.5, n: 7 },
        { p: { golem: 2, eye: 3, spider: 5 }, min: 205, iv: 0.5, n: 8 },
        { p: { golem: 2, werewolf: 5, demon: 1 }, min: 225, iv: 0.45, n: 8 },
        { p: { demon: 2, golem: 2, eye: 3 }, min: 245, iv: 0.45, n: 9 },
        { p: { demon: 3, golem: 3, werewolf: 3 }, min: 265, iv: 0.4, n: 10 },
        { p: { demon: 4, golem: 3, knight: 3 }, min: 285, iv: 0.35, n: 10 },
      ],
      events: [
        { t: 50, type: 'swarm', e: 'bat', n: 30 },
        { t: 110, type: 'elite', e: 'slime' },
        { t: 170, type: 'ring', e: 'mushroom', n: 30 },
        { t: 230, type: 'elite', e: 'spider' },
        { t: 300, type: 'boss', id: 'slime_king', mul: 1.6 },
        { t: 380, type: 'swarm', e: 'spider', n: 40 },
        { t: 450, type: 'elite', e: 'werewolf' },
        { t: 520, type: 'ring', e: 'slime', n: 36 },
        { t: 570, type: 'elite', e: 'eye' },
        { t: 600, type: 'boss', id: 'vampire_lord', mul: 0.8 },
        { t: 690, type: 'elite', e: 'mummy' },
        { t: 740, type: 'swarm', e: 'bat', n: 60 },
        { t: 790, type: 'elite', e: 'golem' },
        { t: 830, type: 'ring', e: 'werewolf', n: 40 },
        { t: 860, type: 'elite', e: 'demon' },
        { t: 900, type: 'boss', id: 'treant', final: true },
      ],
    },
    dungeon: {
      name: '熔岩地牢', desc: '地底深处的炼狱，只有最强者才能生还。', theme: 'dungeon', music: 'stage3',
      mapW: 2400, mapH: 2400, hpMul: 1.4, dmgMul: 1.15, goldMul: 1.5, xpMul: 1.3,
      obstacles: { n: 80, types: ['pillar', 'pillar', 'lavarock', 'bones'] }, braziers: 26,
      unlock: { type: 'surviveStage', stage: 'forest', v: 600, txt: '在「幽暗森林」存活 10 分钟' },
      waves: [
        { p: { skeleton: 4, bat: 3 }, min: 12, iv: 1.2, n: 2 },
        { p: { skeleton: 4, imp: 1, bat: 2 }, min: 24, iv: 1.0, n: 3 },
        { p: { imp: 2, skeleton: 3, ghost: 2 }, min: 38, iv: 0.9, n: 3 },
        { p: { imp: 3, knight: 1, spider: 3 }, min: 52, iv: 0.85, n: 4 },
        { p: { knight: 2, imp: 3, eye: 2 }, min: 75, iv: 0.75, n: 5 },
        { p: { knight: 2, demon: 2, skeleton: 3 }, min: 90, iv: 0.7, n: 5 },
        { p: { demon: 3, imp: 3, eye: 2 }, min: 110, iv: 0.65, n: 6 },
        { p: { golem: 1, demon: 3, knight: 2 }, min: 130, iv: 0.6, n: 6 },
        { p: { golem: 2, imp: 4, knight: 2 }, min: 150, iv: 0.55, n: 7 },
        { p: { demon: 4, golem: 2, eye: 3 }, min: 170, iv: 0.5, n: 7 },
        { p: { knight: 4, golem: 2, imp: 3 }, min: 190, iv: 0.5, n: 8 },
        { p: { demon: 4, golem: 3, ghost: 3 }, min: 210, iv: 0.45, n: 8 },
        { p: { golem: 3, knight: 4, demon: 3 }, min: 230, iv: 0.42, n: 9 },
        { p: { golem: 4, demon: 4, imp: 4 }, min: 250, iv: 0.4, n: 9 },
        { p: { golem: 4, knight: 4, demon: 4 }, min: 270, iv: 0.36, n: 10 },
        { p: { golem: 5, demon: 5, knight: 4 }, min: 300, iv: 0.32, n: 11 },
      ],
      events: [
        { t: 40, type: 'swarm', e: 'bat', n: 30 },
        { t: 100, type: 'elite', e: 'skeleton' },
        { t: 160, type: 'ring', e: 'skeleton', n: 36 },
        { t: 220, type: 'elite', e: 'imp' },
        { t: 300, type: 'boss', id: 'lich' },
        { t: 370, type: 'swarm', e: 'imp', n: 40 },
        { t: 440, type: 'elite', e: 'knight' },
        { t: 500, type: 'ring', e: 'demon', n: 30 },
        { t: 560, type: 'elite', e: 'golem' },
        { t: 600, type: 'boss', id: 'demon_lord' },
        { t: 680, type: 'elite', e: 'demon' },
        { t: 730, type: 'swarm', e: 'ghost', n: 60 },
        { t: 780, type: 'elite', e: 'knight' },
        { t: 820, type: 'ring', e: 'golem', n: 30 },
        { t: 860, type: 'elite', e: 'golem' },
        { t: 900, type: 'boss', id: 'reaper', final: true },
      ],
    },
  };
  for (const id in D.stages) D.stages[id].id = id;
  D.stageOrder = Object.keys(D.stages);
  D.RUN_LENGTH = 900; // 15 分钟出现最终 Boss

  // ---------- 局外强化（金币购买，永久生效） ----------
  D.meta = {
    might: { name: '力量', icon: 'i_spinach', stat: 'might', per: 0.05, max: 5, base: 200 },
    armor: { name: '护甲', icon: 'i_armor', stat: 'armor', per: 1, max: 3, base: 600 },
    maxhp: { name: '最大生命', icon: 'i_heart', stat: 'hpPct', per: 0.1, max: 3, base: 200 },
    recovery: { name: '生命恢复', icon: 'i_tomato', stat: 'recovery', per: 0.1, max: 5, base: 200 },
    cooldown: { name: '冷却', icon: 'i_tome', stat: 'cooldown', per: -0.025, max: 2, base: 900 },
    area: { name: '范围', icon: 'i_candle', stat: 'area', per: 0.05, max: 2, base: 300 },
    speed: { name: '弹速', icon: 'i_bracer', stat: 'speed', per: 0.1, max: 2, base: 300 },
    duration: { name: '持续时间', icon: 'i_scroll', stat: 'duration', per: 0.15, max: 2, base: 300 },
    amount: { name: '投射物数量', icon: 'i_dup', stat: 'amount', per: 1, max: 1, base: 5000 },
    move: { name: '移动速度', icon: 'i_wings', stat: 'move', per: 0.05, max: 2, base: 300 },
    magnet: { name: '拾取范围', icon: 'i_orb', stat: 'magnet', per: 0.25, max: 2, base: 300 },
    luck: { name: '幸运', icon: 'i_clover', stat: 'luck', per: 0.1, max: 3, base: 600 },
    growth: { name: '成长', icon: 'i_crown', stat: 'growth', per: 0.03, max: 5, base: 900 },
    greed: { name: '贪婪', icon: 'coin', stat: 'greed', per: 0.1, max: 5, base: 200 },
    revival: { name: '复活', icon: 'i_ankh', stat: 'revival', per: 1, max: 1, base: 10000 },
    reroll: { name: '重抽', icon: 'i_dice', stat: 'reroll', per: 2, max: 5, base: 500 },
    skip: { name: '跳过', icon: 'i_skip', stat: 'skip', per: 1, max: 5, base: 300 },
    banish: { name: '封印', icon: 'i_banish', stat: 'banish', per: 1, max: 5, base: 300 },
  };
  for (const id in D.meta) D.meta[id].id = id;
  D.metaOrder = Object.keys(D.meta);

  // 经验需求曲线
  D.xpReq = (lv) => {
    if (lv < 20) return 5 + (lv - 1) * 10;
    if (lv < 40) return 195 + (lv - 20) * 13;
    return 455 + (lv - 40) * 30;
  };

  D.bonusText = (bonus) =>
    Object.keys(bonus).map((k) => (D.STAT[k] ? D.STAT[k].name + ' ' + D.STAT[k].fmt(bonus[k]) : '')).filter(Boolean).join('，');
})();
