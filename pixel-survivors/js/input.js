'use strict';
// 输入：键盘 / 鼠标(触屏) / 手柄，统一为移动向量 + 菜单导航动作
(function () {
  const PS = (window.PS = window.PS || {});
  const I = (PS.input = {
    keys: {},
    move: { x: 0, y: 0 },
    pointer: { x: 0, y: 0, down: false },
    gpPrev: [],
    gpAxisT: 0,
    gpAxisDir: null,
    lastDevice: 'kb',
    onAction: null, // (action, source) => void
  });

  const KEY_ACTIONS = {
    ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
    Enter: 'confirm', Space: 'confirm', NumpadEnter: 'confirm',
    Escape: 'back', Backspace: 'back', KeyP: 'pause',
    KeyR: 'reroll', KeyF: 'skip', KeyB: 'banish',
    ShiftLeft: 'dash', ShiftRight: 'dash', KeyK: 'dash',
    Digit1: 'opt1', Digit2: 'opt2', Digit3: 'opt3', Digit4: 'opt4',
    Numpad1: 'opt1', Numpad2: 'opt2', Numpad3: 'opt3', Numpad4: 'opt4',
    F11: null,
  };
  // 手柄按键（标准映射）
  // 对局中 A / LB / RB / LT / RT 均为冲刺（由界面层根据状态解释）
  const GP_ACTIONS = { 0: 'confirm', 1: 'back', 2: 'reroll', 3: 'skip', 4: 'banish', 5: 'banish', 6: 'dash', 7: 'dash', 8: 'back', 9: 'pause', 12: 'up', 13: 'down', 14: 'left', 15: 'right' };

  function emit(a, src, data) {
    if (I.onAction) I.onAction(a, src, data);
  }

  I.init = function (canvas) {
    window.addEventListener('keydown', (e) => {
      if (PS.audio) PS.audio.init();
      I.lastDevice = 'kb';
      const a = KEY_ACTIONS[e.code];
      I.keys[e.code] = true;
      if (a !== undefined) {
        // 阻止空格/方向键滚动页面
        if (e.code !== 'F11') e.preventDefault();
        if (a) emit(a, 'kb', { repeat: e.repeat });
      }
    });
    window.addEventListener('keyup', (e) => {
      I.keys[e.code] = false;
    });
    window.addEventListener('blur', () => {
      I.keys = {};
      I.pointer.down = false;
    });
    const setPtr = (e) => {
      I.pointer.x = e.clientX;
      I.pointer.y = e.clientY;
    };
    canvas.addEventListener('pointerdown', (e) => {
      if (PS.audio) PS.audio.init();
      I.lastDevice = 'mouse';
      setPtr(e);
      // 鼠标右键：朝光标方向冲刺
      if (e.button === 2) {
        emit('dash', 'mouse', { pointer: true });
        return;
      }
      I.pointer.down = true;
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    });
    canvas.addEventListener('pointermove', setPtr);
    const up = () => { I.pointer.down = false; };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('pointerdown', () => { if (PS.audio) PS.audio.init(); });
  };

  I.getPads = function () {
    try {
      return navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(Boolean) : [];
    } catch (e) {
      return [];
    }
  };

  // 每帧调用：dt 秒；playerScreen：玩家在屏幕上的坐标（用于鼠标移动）
  I.poll = function (dt, playerScreen, allowPointerMove) {
    let mx = 0, my = 0;
    const k = I.keys;
    if (k.KeyW || k.ArrowUp) my -= 1;
    if (k.KeyS || k.ArrowDown) my += 1;
    if (k.KeyA || k.ArrowLeft) mx -= 1;
    if (k.KeyD || k.ArrowRight) mx += 1;

    // 手柄
    const pads = I.getPads();
    let ax = 0, ay = 0;
    const pressed = [];
    for (const p of pads) {
      const x = p.axes[0] || 0, y = p.axes[1] || 0;
      if (Math.abs(x) > Math.abs(ax)) ax = x;
      if (Math.abs(y) > Math.abs(ay)) ay = y;
      p.buttons.forEach((b, i) => {
        if (b && (b.pressed || b.value > 0.5)) pressed[i] = true;
      });
    }
    const alen = Math.hypot(ax, ay);
    if (alen > 0.22) {
      const s = Math.min(1, (alen - 0.22) / 0.7);
      mx += (ax / alen) * s;
      my += (ay / alen) * s;
      I.lastDevice = 'pad';
    }
    if (pressed[12]) my -= 1;
    if (pressed[13]) my += 1;
    if (pressed[14]) mx -= 1;
    if (pressed[15]) mx += 1;
    // 按键沿触发
    for (const i in GP_ACTIONS) {
      if (pressed[i] && !I.gpPrev[i]) {
        I.lastDevice = 'pad';
        if (PS.audio) PS.audio.init();
        emit(GP_ACTIONS[i], 'pad');
      }
    }
    I.gpPrev = pressed;
    // 摇杆导航（带重复）
    let dir = null;
    if (alen > 0.6) dir = Math.abs(ax) > Math.abs(ay) ? (ax > 0 ? 'right' : 'left') : ay > 0 ? 'down' : 'up';
    if (dir) {
      if (dir !== I.gpAxisDir) {
        I.gpAxisDir = dir;
        I.gpAxisT = 0.35;
        emit(dir, 'stick');
      } else {
        I.gpAxisT -= dt;
        if (I.gpAxisT <= 0) {
          I.gpAxisT = 0.12;
          emit(dir, 'stick');
        }
      }
    } else I.gpAxisDir = null;

    // 鼠标/触屏按住移动
    if (allowPointerMove && I.pointer.down && playerScreen) {
      const dx = I.pointer.x - playerScreen.x, dy = I.pointer.y - playerScreen.y;
      const d = Math.hypot(dx, dy);
      if (d > 10) {
        mx += dx / d;
        my += dy / d;
      }
    }

    const len = Math.hypot(mx, my);
    if (len > 1) {
      mx /= len;
      my /= len;
    }
    I.move.x = mx;
    I.move.y = my;
  };
})();
