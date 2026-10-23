'use strict';
// 通用工具：数学、随机数、空间哈希网格
(function () {
  const PS = (window.PS = window.PS || {});
  const U = (PS.U = {});

  U.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.rand = (a, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
  U.randi = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
  U.chance = (p) => Math.random() < p;
  U.pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  U.dist2 = (ax, ay, bx, by) => {
    const dx = ax - bx, dy = ay - by;
    return dx * dx + dy * dy;
  };
  U.dist = (ax, ay, bx, by) => Math.sqrt(U.dist2(ax, ay, bx, by));

  U.weighted = (items, wf) => {
    let total = 0;
    for (const it of items) total += wf(it);
    if (total <= 0) return items[0];
    let r = Math.random() * total;
    for (const it of items) {
      r -= wf(it);
      if (r <= 0) return it;
    }
    return items[items.length - 1];
  };

  U.shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = arr[i];
      arr[i] = arr[j];
      arr[j] = t;
    }
    return arr;
  };

  // 交换删除，O(1)
  U.removeAt = (arr, i) => {
    const last = arr.length - 1;
    if (i < 0 || i > last) return;
    if (i !== last) arr[i] = arr[last];
    arr.length = last;
  };

  U.fmtTime = (s) => {
    s = Math.max(0, Math.floor(s));
    const m = Math.floor(s / 60), ss = s % 60;
    return (m < 10 ? '0' : '') + m + ':' + (ss < 10 ? '0' : '') + ss;
  };

  U.fmtNum = (n) => {
    n = Math.round(n);
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e4) return (n / 1e3).toFixed(1) + 'K';
    return String(n);
  };

  // 确定性哈希 → [0,1)
  U.hash2 = (x, y, seed) => {
    let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 1442695041);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };

  // 可种子化随机数 mulberry32
  U.rng = (seed) => {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  // 空间哈希网格：每帧重建，用于敌人碰撞查询
  class Grid {
    constructor(w, h, cell) {
      this.cell = cell;
      this.cols = Math.ceil(w / cell) + 2;
      this.rows = Math.ceil(h / cell) + 2;
      this.cells = new Array(this.cols * this.rows);
      for (let i = 0; i < this.cells.length; i++) this.cells[i] = [];
      this.used = [];
      this.pool = []; // 查询结果数组池，允许嵌套查询
      this.depth = 0;
    }
    clear() {
      for (const c of this.used) c.length = 0;
      this.used.length = 0;
    }
    idx(x, y) {
      let cx = Math.floor(x / this.cell) + 1, cy = Math.floor(y / this.cell) + 1;
      if (cx < 0) cx = 0; else if (cx >= this.cols) cx = this.cols - 1;
      if (cy < 0) cy = 0; else if (cy >= this.rows) cy = this.rows - 1;
      return cy * this.cols + cx;
    }
    insert(e) {
      const c = this.cells[this.idx(e.x, e.y)];
      if (c.length === 0) this.used.push(c);
      c.push(e);
    }
    // 返回圆形区域附近格子中的所有实体（粗筛）
    query(x, y, r) {
      const out = this.pool[this.depth] || (this.pool[this.depth] = []);
      out.length = 0;
      const cs = this.cell;
      let x0 = Math.floor((x - r) / cs) + 1, x1 = Math.floor((x + r) / cs) + 1;
      let y0 = Math.floor((y - r) / cs) + 1, y1 = Math.floor((y + r) / cs) + 1;
      if (x0 < 0) x0 = 0;
      if (y0 < 0) y0 = 0;
      if (x1 >= this.cols) x1 = this.cols - 1;
      if (y1 >= this.rows) y1 = this.rows - 1;
      for (let cy = y0; cy <= y1; cy++) {
        const row = cy * this.cols;
        for (let cx = x0; cx <= x1; cx++) {
          const c = this.cells[row + cx];
          for (let i = 0; i < c.length; i++) out.push(c[i]);
        }
      }
      return out;
    }
    // 嵌套查询时使用：begin/end 包裹
    begin() { this.depth++; }
    end() { this.depth--; }
  }
  U.Grid = Grid;
})();
