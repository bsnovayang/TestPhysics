import { cfg, STEP, SLOT_KEYS } from './config.js';
import { Input } from './input.js';
import { World } from './world.js';
import { Renderer } from './render.js';
import { SKILLS, SKILL_ORDER, DEBUG_KEYS, TREE_COLORS } from './skills.js';
import { createDebugPanel } from './debug.js';
import { ROOMS } from './rooms.js';

// 水的版本：預設為 Noita 風像素水（正式版）；?water=cell（原版格子水）、?water=particle（粒子版）、?water=fx（原版＋粒子特效）用來比較
const DEFAULT_WATER = 'pixel';
const WATER_VERSIONS = {
  cell: { name: '原版（格子水）' },
  particle: { name: '粒子版', module: '../experiments/particle-water/particle-water.js' },
  fx: { name: '原版＋粒子特效', module: '../experiments/water-fx/water-fx.js' },
  pixel: { name: 'Noita 風像素水（正式）', module: '../experiments/pixel-water/pixel-water.js' },
};
const waterParam = new URLSearchParams(location.search).get('water');
const waterMode = WATER_VERSIONS[waterParam] ? waterParam : DEFAULT_WATER;
const waterModule = WATER_VERSIONS[waterMode].module ? await import(WATER_VERSIONS[waterMode].module) : {};

const canvas = document.getElementById('game');
const input = new Input();
input.attach(canvas);
// 畫布上的文字要等像素字型載入完才會用到它
await document.fonts.load('12px "FusionPixel"', '測試').catch(() => {});
const renderer = new Renderer(canvas);
const world = new World(input, { createWater: waterModule.createWater });
if (waterModule.createFx) renderer.fx = waterModule.createFx();
renderer.versionLabel = WATER_VERSIONS[waterMode].name;
buildVersionLinks();
buildLevelGrid(document.getElementById('levels-start'));
window.world = world; // 方便在主控台除錯

const overlays = {
  start: document.getElementById('start'),
  help: document.getElementById('help'),
  loadout: document.getElementById('loadout'),
  levels: document.getElementById('levels'),
};
let started = false;
let paused = false;
let slowMo = false;

function isPaused() {
  return !started || paused || !overlays.loadout.hidden || !overlays.levels.hidden;
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
if (params.has('room')) {
  world.loadRoom(Number(params.get('room')) - 1);
  world.toasts = world.toasts.slice(-1); // 只留新房間的名稱
}

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
    btn.innerHTML = `<small>${DEBUG_KEYS[i].replace('Digit', '').replace('Minus', '-')}</small>${sk.name}`;
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
      if (!overlays.levels.hidden) toggleLevels(false);
      else if (!overlays.loadout.hidden) toggleLoadout(false);
      else { paused = !paused; overlays.help.hidden = !paused; }
      break;
    case 'KeyL':
      toggleLevels();
      break;
    case 'KeyH':
      overlays.help.hidden = !overlays.help.hidden;
      break;
    case 'Slash':
      cfg.showHints = !cfg.showHints;
      break;
    case 'F2':
      if (!debugPanel) {
        world.toast('除錯面板無法載入（需要網路）');
        break;
      }
      debugVisible = !debugVisible;
      debugPanel.show(debugVisible);
      break;
    case 'BracketRight':
      world.loadRoom(world.roomIndex + 1);
      break;
    case 'BracketLeft':
      world.loadRoom(world.roomIndex - 1);
      break;
    case 'KeyT':
      world.player.mp = cfg.mpMax;
      world.loadRoom(world.roomIndex);
      break;
    case 'KeyG':
      cfg.showHitboxes = !cfg.showHitboxes;
      break;
    case 'KeyK':
      if (!world.debugHit(world.mouse.x, world.mouse.y, 3)) world.toast('游標下沒有敵人');
      break;
    case 'KeyJ':
      world.debugBossPhase2();
      break;
    case 'KeyI':
      cfg.godMode = !cfg.godMode;
      world.toast(cfg.godMode ? '無敵：開' : '無敵：關');
      break;
    case 'KeyM':
      slowMo = !slowMo;
      cfg.globalTimeScale = slowMo ? 0.25 : 1;
      world.toast(slowMo ? '整體慢動作 0.25x' : '恢復正常速度');
      break;
    default: {
      const id = SKILL_ORDER[DEBUG_KEYS.indexOf(code)];
      if (id) {
        world.loadout[0] = id;
        world.toast(`右鍵技能：${SKILLS[id].name}`);
      }
    }
  }
});

// 選關：一排 10 個（CSS grid），滿了自動換行；點一下就進入那一關
function buildLevelGrid(box) {
  if (!box) return;
  box.innerHTML = '';
  ROOMS.forEach((room, i) => {
    const [letter, ...rest] = room.name.split(' ');
    const btn = document.createElement('button');
    btn.innerHTML = '<b>' + letter + '</b><small>' + rest.join(' ') + '</small>';
    btn.title = room.name;
    if (i === world.roomIndex) btn.className = 'current';
    btn.addEventListener('click', (e) => {
      e.stopPropagation(); // 開始畫面點任何地方都會開始遊戲，這裡要先攔下來
      world.player.hp = cfg.hp;
      world.player.mp = cfg.mpMax;
      world.loadRoom(i);
      started = true;
      overlays.start.hidden = true;
      toggleLevels(false);
    });
    box.appendChild(btn);
  });
}

function toggleLevels(show = overlays.levels.hidden) {
  overlays.levels.hidden = !show;
  if (show) buildLevelGrid(document.getElementById('levels-menu'));
}

// 開始畫面的版本切換連結（保留其他網址參數）
function buildVersionLinks() {
  const box = document.getElementById('versions');
  if (!box) return;
  for (const [key, v] of Object.entries(WATER_VERSIONS)) {
    const p = new URLSearchParams(location.search);
    if (key === DEFAULT_WATER) p.delete('water'); else p.set('water', key);
    const a = document.createElement('a');
    a.href = '?' + p.toString();
    a.textContent = v.name;
    if (key === waterMode) a.className = 'current';
    a.addEventListener('click', (e) => e.stopPropagation());
    box.appendChild(a);
  }
}

// 除錯：按住 B 在游標位置噴蒸氣、按住 N 倒水
function debugSpawn() {
  const tx = Math.floor(world.mouse.x / 16);
  const ty = Math.floor(world.mouse.y / 16);
  if (input.isDown('KeyB')) world.water.addSteam(tx, ty, 0.2);
  if (input.isDown('KeyN')) world.water.add(tx, ty, 0.1);
}

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
      debugSpawn();
      world.update(STEP);
      renderer.fx?.update(world, STEP);
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

let debugPanel = null;
let debugVisible = false;
createDebugPanel(world).then((gui) => { debugPanel = gui; });
