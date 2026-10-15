import { cfg, STEP, SLOT_KEYS } from './config.js';
import { Input } from './input.js';
import { World } from './world.js';
import { Renderer } from './render.js';
import { SKILLS, SKILL_ORDER, TREE_COLORS } from './skills.js';
import { createDebugPanel } from './debug.js';

const canvas = document.getElementById('game');
const input = new Input();
input.attach(canvas);
const renderer = new Renderer(canvas);
const world = new World(input);
window.world = world; // 方便在主控台除錯

const overlays = {
  start: document.getElementById('start'),
  help: document.getElementById('help'),
  loadout: document.getElementById('loadout'),
};
let started = false;
let paused = false;
let slowMo = false;

function isPaused() {
  return !started || paused || !overlays.loadout.hidden;
}

overlays.start.addEventListener('click', () => {
  started = true;
  overlays.start.hidden = true;
});

// 開發用網址參數：?autostart 跳過開始畫面，?room=N 直接進入第 N 個房間（從 1 開始）
const params = new URLSearchParams(location.search);
if (params.has('autostart')) {
  started = true;
  overlays.start.hidden = true;
}
if (params.has('room')) world.loadRoom(Number(params.get('room')) - 1);

// ---- 裝備選單 ----
let selectedSlot = 0;
function buildLoadout() {
  const slotsEl = document.getElementById('loadout-slots');
  const skillsEl = document.getElementById('loadout-skills');
  slotsEl.innerHTML = '';
  skillsEl.innerHTML = '';
  SLOT_KEYS.forEach((slot, i) => {
    const id = world.loadout[i];
    const btn = document.createElement('button');
    btn.className = 'slot' + (i === selectedSlot ? ' selected' : '');
    btn.innerHTML = `<small>${slot.label}</small>${id ? SKILLS[id].name : '—'}`;
    if (id) btn.style.borderLeftColor = TREE_COLORS[SKILLS[id].tree];
    btn.onclick = () => { selectedSlot = i; buildLoadout(); };
    slotsEl.appendChild(btn);
  });
  SKILL_ORDER.forEach((id, i) => {
    const sk = SKILLS[id];
    const btn = document.createElement('button');
    btn.className = 'skill';
    btn.style.borderLeftColor = TREE_COLORS[sk.tree];
    btn.innerHTML = `<small>${i + 1}</small>${sk.name}`;
    btn.onclick = () => { world.loadout[selectedSlot] = id; buildLoadout(); };
    skillsEl.appendChild(btn);
  });
}

function toggleLoadout(show = overlays.loadout.hidden) {
  overlays.loadout.hidden = !show;
  if (show) buildLoadout();
}

// ---- 不受暫停影響的按鍵 ----
input.onKey((code) => {
  if (!started) return;
  switch (code) {
    case 'Tab':
      toggleLoadout();
      break;
    case 'Escape':
      if (!overlays.loadout.hidden) toggleLoadout(false);
      else { paused = !paused; overlays.help.hidden = !paused; }
      break;
    case 'KeyH':
      overlays.help.hidden = !overlays.help.hidden;
      break;
    case 'BracketRight':
      world.loadRoom(world.roomIndex + 1);
      break;
    case 'BracketLeft':
      world.loadRoom(world.roomIndex - 1);
      break;
    case 'KeyT':
      world.loadRoom(world.roomIndex);
      break;
    case 'KeyG':
      cfg.showHitboxes = !cfg.showHitboxes;
      break;
    case 'KeyM':
      slowMo = !slowMo;
      cfg.globalTimeScale = slowMo ? 0.25 : 1;
      world.toast(slowMo ? '整體慢動作 0.25x' : '恢復正常速度');
      break;
    default:
      if (code.startsWith('Digit')) {
        const n = Number(code.slice(5));
        const id = SKILL_ORDER[n - 1];
        if (id) {
          world.loadout[0] = id;
          world.toast(`右鍵技能：${SKILLS[id].name}`);
        }
      }
  }
});

// ---- 主迴圈（固定時間步長）----
let last = performance.now();
let acc = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const m = renderer.screenToGame(input.clientX, input.clientY);
  world.mouse.x = m.x;
  world.mouse.y = m.y;

  if (isPaused()) {
    input.endStep();
    acc = 0;
  } else {
    acc += dt * cfg.globalTimeScale;
    let steps = 0;
    while (acc >= STEP && steps < 5) {
      world.update(STEP);
      input.endStep();
      acc -= STEP;
      steps++;
    }
    if (steps === 5) acc = 0;
  }
  renderer.draw(world);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

createDebugPanel();
