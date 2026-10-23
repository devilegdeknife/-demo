'use strict';
// 音频：WebAudio 实时合成的 8-bit 音效与芯片音乐，无需任何音频文件
(function () {
  const PS = (window.PS = window.PS || {});
  const A = (PS.audio = { ctx: null, track: null, last: {}, gemCombo: 0, gemT: 0 });

  A.init = function () {
    if (A.ctx) {
      if (A.ctx.state === 'suspended') A.ctx.resume().catch(() => {});
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      A.ctx = new AC();
    } catch (e) {
      A.ctx = null;
      return;
    }
    const c = A.ctx;
    A.master = c.createGain();
    A.master.gain.value = 0.9;
    A.master.connect(c.destination);
    A.sfxGain = c.createGain();
    A.musGain = c.createGain();
    A.sfxGain.connect(A.master);
    A.musGain.connect(A.master);
    // 白噪声
    const len = c.sampleRate;
    A.noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = A.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // 25% 占空比脉冲波
    const N = 32, re = new Float32Array(N), im = new Float32Array(N);
    for (let n = 1; n < N; n++) im[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * 0.25);
    A.pulse = c.createPeriodicWave(re, im);
    A.applyVolume();
    A.startScheduler();
  };

  A.applyVolume = function () {
    if (!A.ctx) return;
    const s = PS.save && PS.save.data ? PS.save.data.settings : { music: 0.5, sfx: 0.7 };
    A.sfxGain.gain.value = s.sfx * 0.6;
    A.musGain.gain.value = s.music * 0.35;
  };

  function tone(type, f0, f1, dur, vol, when, dest) {
    const c = A.ctx;
    const t = when || c.currentTime;
    const o = c.createOscillator();
    const g = c.createGain();
    if (type === 'pulse') o.setPeriodicWave(A.pulse);
    else o.type = type;
    o.frequency.setValueAtTime(Math.max(20, f0), t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g);
    g.connect(dest || A.sfxGain);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
  function noise(dur, vol, freq, when, ftype, f1, dest) {
    const c = A.ctx;
    const t = when || c.currentTime;
    const s = c.createBufferSource();
    s.buffer = A.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = ftype || 'lowpass';
    f.frequency.setValueAtTime(freq, t);
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    s.connect(f);
    f.connect(g);
    g.connect(dest || A.sfxGain);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.02);
  }

  const THROTTLE = { hit: 0.05, gem: 0.035, shoot: 0.06, knife: 0.05, whip: 0.08, explode: 0.08, thunder: 0.08, coin: 0.05, freeze: 0.1, ebullet: 0.12, kill: 0.04 };

  A.sfx = function (name) {
    const c = A.ctx;
    if (!c || c.state !== 'running') return;
    const now = c.currentTime;
    const th = THROTTLE[name];
    if (th && A.last[name] && now - A.last[name] < th) return;
    A.last[name] = now;
    switch (name) {
      case 'hit': tone('square', 260, 90, 0.06, 0.05); break;
      case 'kill': tone('square', 500, 900, 0.03, 0.02); break;
      case 'gem': {
        A.gemCombo = now - A.gemT < 0.4 ? Math.min(A.gemCombo + 1, 24) : 0;
        A.gemT = now;
        tone('pulse', 700 * Math.pow(2, A.gemCombo / 24), 0, 0.07, 0.07);
        break;
      }
      case 'coin': tone('square', 988, 0, 0.05, 0.06); tone('square', 1319, 0, 0.12, 0.06, now + 0.05); break;
      case 'levelup': [523, 659, 784, 1047, 1319].forEach((f, i) => tone('pulse', f, 0, 0.12, 0.09, now + i * 0.06)); break;
      case 'hurt': tone('sawtooth', 180, 50, 0.18, 0.14); noise(0.1, 0.1, 1200); break;
      case 'whip': noise(0.12, 0.09, 3000, 0, 'bandpass', 500); break;
      case 'shoot': tone('triangle', 1100, 500, 0.07, 0.06); break;
      case 'knife': tone('square', 1400, 900, 0.03, 0.025); break;
      case 'axe': tone('triangle', 300, 600, 0.12, 0.06); break;
      case 'explode': noise(0.35, 0.16, 900, 0, 'lowpass', 80); tone('sine', 140, 40, 0.3, 0.14); break;
      case 'thunder': noise(0.3, 0.14, 4000, 0, 'highpass', 400); tone('square', 90, 40, 0.2, 0.08); break;
      case 'freeze': tone('triangle', 1600, 3200, 0.2, 0.04); tone('sine', 2400, 1200, 0.25, 0.03); break;
      case 'ebullet': tone('square', 400, 300, 0.05, 0.02); break;
      case 'chest': [392, 523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone('pulse', f, 0, 0.14, 0.08, now + i * 0.08)); break;
      case 'evolve': [262, 330, 392, 523, 659, 784, 1047].forEach((f, i) => tone('square', f, 0, 0.2, 0.08, now + i * 0.07)); noise(0.6, 0.06, 6000, now + 0.45, 'highpass'); break;
      case 'boss':
        for (let i = 0; i < 3; i++) {
          tone('sawtooth', 440, 0, 0.22, 0.08, now + i * 0.45);
          tone('sawtooth', 330, 0, 0.22, 0.08, now + i * 0.45 + 0.22);
        }
        break;
      case 'select': tone('pulse', 660, 990, 0.06, 0.07); break;
      case 'move': tone('square', 440, 0, 0.03, 0.035); break;
      case 'back': tone('square', 330, 220, 0.07, 0.06); break;
      case 'deny': tone('square', 110, 90, 0.12, 0.08); break;
      case 'heal': tone('triangle', 523, 1047, 0.2, 0.09); break;
      case 'pickup': tone('pulse', 784, 1568, 0.12, 0.08); break;
      case 'bomb': noise(0.8, 0.22, 2000, 0, 'lowpass', 60); tone('sine', 120, 30, 0.6, 0.2); break;
      case 'death': tone('sawtooth', 440, 50, 1.2, 0.14); noise(0.8, 0.08, 800, now + 0.2, 'lowpass', 100); break;
      case 'victory': [523, 523, 523, 659, 784, 659, 784, 1047].forEach((f, i) => tone('pulse', f, 0, 0.22, 0.09, now + i * 0.13)); break;
      case 'unlock': [784, 988, 1175, 1568].forEach((f, i) => tone('pulse', f, 0, 0.12, 0.08, now + i * 0.07)); break;
    }
  };

  // ================= 芯片音乐 =================
  // 每小节 8 个八分音符；'-' 延音，'.' 休止
  const NOTE = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
  function freq(n) {
    const m = n.match(/^([A-G]#?)(\d)$/);
    if (!m) return 0;
    const midi = (parseInt(m[2], 10) + 1) * 12 + NOTE[m[1]];
    return 440 * Math.pow(2, (midi - 69) / 12);
  }
  const TRACKS = {
    title: {
      bpm: 96,
      lead: ['E4 - - G4 A4 - - .', 'B4 - A4 - G4 - E4 .', 'D4 - - F4 G4 - - .', 'A4 - G4 - F4 - D4 .',
        'E4 - - G4 A4 - - .', 'B4 - D5 - C5 - B4 A4', 'G4 - - - E4 - - .', 'E4 - - - - - - .'],
      bass: ['A2 - - - E3 - - -', 'A2 - - - E3 - - -', 'D2 - - - A2 - - -', 'D2 - - - A2 - - -',
        'C3 - - - G2 - - -', 'G2 - - - D3 - - -', 'E2 - - - B2 - - -', 'E2 - - - B2 - - -'],
      drums: ['k...h...', 'k...h...', 'k...h...', 'k...h..h', 'k...h...', 'k...h...', 'k...h...', 'k.h.h.hh'],
    },
    stage1: {
      bpm: 150,
      lead: ['A4 - C5 - E5 D5 C5 B4', 'A4 - - F4 A4 C5 - .', 'B4 - D5 - G5 F5 E5 D5', 'E5 - - - B4 - . .',
        'A5 - G5 - E5 - C5 D5', 'C5 - A4 - F4 - A4 C5', 'D5 - B4 - G4 - B4 D5', 'E5 - - - E4 - . .'],
      bass: ['A2 A3 A2 A3 A2 A3 A2 A3', 'F2 F3 F2 F3 F2 F3 F2 F3', 'G2 G3 G2 G3 G2 G3 G2 G3', 'E2 E3 E2 E3 E2 E3 E2 E3',
        'A2 A3 A2 A3 A2 A3 A2 A3', 'F2 F3 F2 F3 F2 F3 F2 F3', 'G2 G3 G2 G3 G2 G3 G2 G3', 'E2 E3 E2 E3 G#2 G#3 B2 B3'],
      drums: ['k.h.s.h.', 'k.h.s.hk', 'k.h.s.h.', 'k.h.s.ss', 'k.h.s.h.', 'k.h.s.hk', 'k.h.s.h.', 'k.s.s.ss'],
    },
    stage2: {
      bpm: 138,
      lead: ['D5 - A4 - F4 - A4 D5', 'C5 - - A4 G4 - E4 .', 'A#4 - D5 - F5 - E5 D5', 'C#5 - - - A4 - . .',
        'F5 - E5 D5 C5 - A4 .', 'G4 - A4 - A#4 - C5 .', 'D5 - F5 - E5 - C#5 .', 'D5 - - - D4 - . .'],
      bass: ['D2 - D3 - D2 - D3 -', 'C2 - C3 - C2 - C3 -', 'A#1 - A#2 - A#1 - A#2 -', 'A1 - A2 - A1 - A2 -',
        'D2 - D3 - D2 - D3 -', 'G1 - G2 - G1 - G2 -', 'A1 - A2 - A1 - A2 -', 'D2 - D3 - A1 - A2 -'],
      drums: ['k...s..h', 'k.k.s..h', 'k...s..h', 'k.k.s.ss', 'k...s..h', 'k.k.s..h', 'k...s..h', 'k.s.s.ss'],
    },
    stage3: {
      bpm: 165,
      lead: ['E5 E5 . E5 G5 - E5 .', 'D5 - C5 - B4 - A4 B4', 'E5 E5 . E5 A5 - G5 .', 'F#5 - - - B4 - . .',
        'C5 - E5 - G5 - F#5 E5', 'D5 - F#5 - A5 - G5 F#5', 'E5 - G5 - B5 - A5 G5', 'F#5 - D#5 - B4 - . .'],
      bass: ['E2 E2 E3 E2 E2 E3 E2 E3', 'D2 D2 D3 D2 D2 D3 D2 D3', 'C2 C2 C3 C2 C2 C3 C2 C3', 'B1 B1 B2 B1 B1 B2 B1 B2',
        'C2 C2 C3 C2 C2 C3 C2 C3', 'D2 D2 D3 D2 D2 D3 D2 D3', 'E2 E2 E3 E2 E2 E3 E2 E3', 'B1 B1 B2 B1 D#2 D#3 F#2 F#3'],
      drums: ['k.hks.h.', 'k.hks.hk', 'k.hks.h.', 'k.hks.ss', 'k.hks.h.', 'k.hks.hk', 'k.hks.h.', 'kksss.ss'],
    },
    boss: {
      bpm: 172,
      lead: ['A4 A#4 A4 . E5 - D#5 .', 'A4 A#4 A4 . F5 - E5 .', 'A4 A#4 A4 . G5 - F5 E5', 'D#5 - - - E5 - - .',
        'C5 - A4 - C5 - D#5 -', 'E5 - D#5 - C5 - A4 -', 'F5 - E5 - D#5 - C5 -', 'B4 - - - E5 - - .'],
      bass: ['A1 A2 A1 A2 A1 A2 A1 A2', 'A1 A2 A1 A2 A1 A2 A1 A2', 'F1 F2 F1 F2 F1 F2 F1 F2', 'E1 E2 E1 E2 E1 E2 E1 E2',
        'A1 A2 A1 A2 A1 A2 A1 A2', 'A1 A2 A1 A2 A1 A2 A1 A2', 'F1 F2 F1 F2 F1 F2 F1 F2', 'E1 E2 E1 E2 G#1 G#2 B1 B2'],
      drums: ['kks.kks.', 'kks.kkss', 'kks.kks.', 'kksskkss', 'kks.kks.', 'kks.kkss', 'kks.kks.', 'ksksksss'],
    },
    over: {
      bpm: 80,
      lead: ['A4 - - - G4 - - -', 'F4 - - - E4 - - -', 'D4 - - - E4 - F4 -', 'E4 - - - - - - .'],
      bass: ['A2 - - - - - - -', 'D2 - - - - - - -', 'B1 - - - - - - -', 'E2 - - - - - - -'],
      drums: ['........', '........', '........', '........'],
    },
  };
  // 预解析
  for (const id in TRACKS) {
    const t = TRACKS[id];
    const parse = (bars) => bars.map((b) => b.trim().split(/\s+/));
    t.L = parse(t.lead);
    t.B = parse(t.bass);
    t.bars = t.L.length;
  }

  A.music = function (id) {
    if (A.trackId === id) return;
    A.trackId = id;
    A.track = TRACKS[id] || null;
    A.step = 0;
    if (A.ctx) A.nextT = A.ctx.currentTime + 0.1;
  };
  A.stopMusic = function () {
    A.trackId = null;
    A.track = null;
  };

  function noteLen(arr, i) {
    let n = 1;
    while (i + n < arr.length && arr[i + n] === '-') n++;
    return n;
  }

  A.startScheduler = function () {
    if (A.timer) return;
    A.nextT = A.ctx.currentTime + 0.1;
    A.step = 0;
    A.timer = setInterval(() => {
      const c = A.ctx;
      if (!c || c.state !== 'running' || !A.track) return;
      const t = A.track;
      const stepDur = 60 / t.bpm / 2; // 八分音符
      if (A.nextT < c.currentTime - 0.5) A.nextT = c.currentTime + 0.05;
      while (A.nextT < c.currentTime + 0.15) {
        const bar = Math.floor(A.step / 8) % t.bars, s = A.step % 8;
        const L = t.L[bar], B = t.B[bar], Dr = t.drums[bar];
        const ln = L[s], bn = B[s], dn = Dr[s];
        if (ln && ln !== '-' && ln !== '.') tone('pulse', freq(ln), 0, stepDur * noteLen(L, s) * 0.95, 0.12, A.nextT, A.musGain);
        if (bn && bn !== '-' && bn !== '.') tone('triangle', freq(bn), 0, stepDur * noteLen(B, s) * 0.95, 0.28, A.nextT, A.musGain);
        if (dn === 'k') tone('sine', 150, 40, 0.12, 0.35, A.nextT, A.musGain);
        else if (dn === 's') noise(0.1, 0.18, 2500, A.nextT, 'bandpass', 0, A.musGain);
        else if (dn === 'h') noise(0.03, 0.08, 7000, A.nextT, 'highpass', 0, A.musGain);
        A.nextT += stepDur;
        A.step++;
      }
    }, 30);
  };

  // 手柄震动
  A.rumble = function (strength, ms) {
    try {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      for (const p of pads) {
        if (p && p.vibrationActuator && p.vibrationActuator.playEffect) {
          p.vibrationActuator.playEffect('dual-rumble', { duration: ms, strongMagnitude: strength, weakMagnitude: strength * 0.6 }).catch(() => {});
        }
      }
    } catch (e) {
      /* 部分浏览器不支持 */
    }
  };
})();
