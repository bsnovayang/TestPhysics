import { cfg, TILE, COLS, ROWS, VIEW_W, VIEW_H, SLOT_KEYS } from './config.js';
import { SKILLS, TREE_COLORS } from './skills.js';
import { Box, BoxSpawner, MovingPlatform, Blade, Crusher } from './objects.js';
import { Heavy, Jumper, Flyer, Turret, LaserEnemy } from './enemies.js';
import { Emitter, MirrorBox } from './light.js';

const JAMMER_COLORS = { ...TREE_COLORS, all: '#ffffff' };

const FONT = '"Microsoft JhengHei", "PingFang TC", "Noto Sans TC", sans-serif';
const C = {
  bg: '#141821',
  bgGrid: '#1a1f2b',
  tile: '#3a4357',
  tileTop: '#56627d',
  spike: '#e05555',
  door: '#7a5c3a',
  key: '#ffd34d',
  plate: '#8fd18f',
  box: '#b98a4f',
  boxEdge: '#8a6435',
  platform: '#5d8aa8',
  player: '#e8edf5',
  playerBand: '#4ad0ff',
  web: '#ffffff',
  shot: '#cfe8ff',
  bullet: '#ff5e5e',
  hud: '#e8edf5',
  dim: '#7d869a',
};

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.scale = 1;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    this.scale = Math.max(0.5, Math.min(window.innerWidth / VIEW_W, window.innerHeight / VIEW_H));
    const cssW = Math.floor(VIEW_W * this.scale);
    const cssH = Math.floor(VIEW_H * this.scale);
    this.canvas.style.width = cssW + 'px';
    this.canvas.style.height = cssH + 'px';
    this.canvas.width = Math.floor(cssW * dpr);
    this.canvas.height = Math.floor(cssH * dpr);
    this.pixelScale = (cssW * dpr) / VIEW_W;
  }

  screenToGame(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    return {
      x: ((clientX - r.left) / r.width) * VIEW_W,
      y: ((clientY - r.top) / r.height) * VIEW_H,
    };
  }

  draw(world) {
    const ctx = this.ctx;
    ctx.setTransform(this.pixelScale, 0, 0, this.pixelScale, 0, 0);
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    this.drawGrid();
    this.drawFieldFills(world);
    this.drawTiles(world);
    // 實驗版本可以自訂水的畫法（粒子水），或在原本的水上加特效
    if (!world.water.draw?.(this.ctx, world)) this.drawWater(world);
    this.fx?.draw(this.ctx, world);
    this.drawPortals(world);
    this.drawSwitchesAndDoors(world);
    this.drawJammerRanges(world);
    for (const e of world.entities) this.drawEntity(world, e);
    this.drawPlayer(world);
    this.drawSteam(world);
    this.drawBeams(world);
    this.drawProjectiles(world);
    this.drawParticles(world);
    this.drawFieldOutlines(world);
    this.drawPreview(world);
    if (cfg.showHitboxes) this.drawHitboxes(world);
    this.drawHud(world);
    this.drawCursor(world);
  }

  drawGrid() {
    const ctx = this.ctx;
    ctx.strokeStyle = C.bgGrid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= VIEW_W; x += TILE) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, VIEW_H); }
    for (let y = 0; y <= VIEW_H; y += TILE) { ctx.moveTo(0, y + 0.5); ctx.lineTo(VIEW_W, y + 0.5); }
    ctx.stroke();
  }

  drawTiles(world) {
    const ctx = this.ctx;
    const map = world.map;
    for (let ty = 0; ty < ROWS; ty++) {
      for (let tx = 0; tx < COLS; tx++) {
        const c = map.get(tx, ty);
        const x = tx * TILE;
        const y = ty * TILE;
        if (c === '#') {
          ctx.fillStyle = C.tile;
          ctx.fillRect(x, y, TILE, TILE);
          if (!map.isSolid(tx, ty - 1)) {
            ctx.fillStyle = C.tileTop;
            ctx.fillRect(x, y, TILE, 3);
          }
        } else if (c === 'I') {
          // 冰牆格：被光照時越來越紅、越亮
          const heat = Math.min(1, world.water.meltProgress(tx, ty));
          ctx.fillStyle = heat > 0 ? `rgb(${Math.round(190 + heat * 65)},${Math.round(232 - heat * 60)},255)` : '#bfe8ff';
          ctx.fillRect(x, y, TILE, TILE);
          ctx.fillStyle = 'rgba(255,255,255,0.6)';
          ctx.fillRect(x + 2, y + 2, 5, 2);
          ctx.strokeStyle = '#8cc8e8';
          ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);
        } else if (c === 'Z') {
          // 熔岩：橘紅色，表面有流動的亮紋
          ctx.fillStyle = '#c4361b';
          ctx.fillRect(x, y, TILE, TILE);
          ctx.fillStyle = '#ff8a3d';
          const wave = Math.sin(world.time * 3 + tx) * 2;
          ctx.fillRect(x, y + 3 + wave, TILE, 2);
          ctx.fillStyle = 'rgba(255,210,120,0.8)';
          ctx.fillRect(x + ((world.time * 10 + tx * 7) % TILE), y + 8, 3, 2);
        } else if (c === '^') {
          this.drawSpike(x, y, map.isSolid(tx, ty - 1) && !map.isSolid(tx, ty + 1));
        } else if (c === '|' && cfg.showHitboxes) {
          ctx.strokeStyle = '#555';
          ctx.strokeRect(x + 7.5, y + 0.5, 1, TILE - 1);
        }
      }
    }
    // 畫面最下方不足一格的部分，延伸最後一列的地板
    ctx.fillStyle = C.tile;
    for (let tx = 0; tx < COLS; tx++) {
      if (map.get(tx, ROWS - 1) === '#') ctx.fillRect(tx * TILE, ROWS * TILE, TILE, VIEW_H - ROWS * TILE);
    }
  }

  // 水：從格子底部往上填；上方也有水時整格填滿。被時停的水畫成淡青色並加框
  drawWater(world) {
    const ctx = this.ctx;
    const w = world.water;
    for (let ty = 0; ty < ROWS; ty++) {
      for (let tx = 0; tx < COLS; tx++) {
        const a = w.get(tx, ty);
        if (a <= 0.01) continue;
        const full = a >= 0.99 || w.get(tx, ty - 1) > 0.01;
        const h = full ? TILE : Math.max(1, a * TILE);
        const x = tx * TILE;
        const y = ty * TILE + TILE - h;
        const frozen = w.frozen.has(w.idx(tx, ty));
        ctx.fillStyle = frozen ? 'rgba(150,220,255,0.7)' : 'rgba(60,140,255,0.45)';
        ctx.fillRect(x, y, TILE, h);
        if (!full || w.get(tx, ty - 1) <= 0.01) {
          ctx.fillStyle = frozen ? '#e0f6ff' : 'rgba(170,215,255,0.8)';
          ctx.fillRect(x, y, TILE, 1);
        }
        // 加熱中的水會冒泡，越接近沸騰泡泡越多
        const heat = w.boil[w.idx(tx, ty)] / cfg.boilTime;
        if (heat > 0.05 && !frozen) {
          ctx.fillStyle = 'rgba(230,245,255,0.85)';
          const n = Math.ceil(heat * 4);
          for (let k = 0; k < n; k++) {
            const phase = (world.time * (1.5 + k * 0.4) + k * 0.37 + tx * 0.13) % 1;
            const bx = x + 3 + ((k * 5 + tx * 3) % 10);
            const by = y + h - phase * h;
            ctx.beginPath();
            ctx.arc(bx, by, 1 + heat, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        if (frozen) {
          ctx.strokeStyle = 'rgba(200,240,255,0.8)';
          ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, h - 1);
        }
      }
    }
  }

  // 蒸氣：半透明的白色雲團，濃度越高越不透明（超過擋光門檻時明顯變濃）
  drawSteam(world) {
    const ctx = this.ctx;
    const w = world.water;
    for (let ty = 0; ty < ROWS; ty++) {
      for (let tx = 0; tx < COLS; tx++) {
        const s = w.steamAt(tx, ty);
        if (s <= 0.02) continue;
        const frozen = world.fields.sample(tx * TILE + 8, ty * TILE + 8).time < 0.05;
        const t = world.time + tx * 1.7 + ty * 0.9;
        ctx.globalAlpha = Math.min(0.75, s * (s > cfg.steamBlock ? 0.9 : 0.6));
        ctx.fillStyle = frozen ? '#cfefff' : '#e8edf5';
        for (let k = 0; k < 2; k++) {
          const ox = frozen ? 0 : Math.sin(t * 1.3 + k * 2) * 3;
          const oy = frozen ? 0 : Math.cos(t + k) * 2;
          ctx.beginPath();
          ctx.arc(tx * TILE + 5 + k * 6 + ox, ty * TILE + 8 + oy, 6 + s * 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  // 傳送門：貼在牆面上的發光線。只有一個門（沒有作用）時畫得比較淡；快消失時閃爍
  drawPortals(world) {
    const ctx = this.ctx;
    const active = world.portals.active;
    for (const p of world.portals.list) {
      if (p.life < 5 && Math.floor(world.time * 6) % 2 === 0) continue;
      const alpha = active ? 1 : 0.45;
      const len = p.s1 - p.s0;
      // 光暈往空地那一側延伸
      for (let i = 0; i < 3; i++) {
        ctx.globalAlpha = alpha * (0.35 - i * 0.1);
        ctx.fillStyle = p.color;
        const depth = 3 + i * 3;
        if (p.nx !== 0) ctx.fillRect(p.nx > 0 ? p.plane : p.plane - depth, p.s0, depth, len);
        else ctx.fillRect(p.s0, p.ny > 0 ? p.plane : p.plane - depth, len, depth);
      }
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      if (p.nx !== 0) ctx.fillRect(p.plane - 1.5, p.s0, 3, len);
      else ctx.fillRect(p.s0, p.plane - 1.5, len, 3);
    }
    ctx.globalAlpha = 1;
  }

  drawSpike(x, y, pointDown) {
    const ctx = this.ctx;
    ctx.fillStyle = C.spike;
    ctx.beginPath();
    for (let i = 0; i < 2; i++) {
      const bx = x + i * 8;
      if (pointDown) {
        ctx.moveTo(bx, y);
        ctx.lineTo(bx + 8, y);
        ctx.lineTo(bx + 4, y + 12);
      } else {
        ctx.moveTo(bx, y + TILE);
        ctx.lineTo(bx + 8, y + TILE);
        ctx.lineTo(bx + 4, y + 4);
      }
    }
    ctx.fill();
  }

  drawSwitchesAndDoors(world) {
    const ctx = this.ctx;
    const hasLock = world.switches.some((s) => s.kind === 'lock');
    const doors = world.doorTiles;

    // 開關到門的連線
    if (doors.length) {
      const dcx = doors.reduce((a, d) => a + d.tx, 0) / doors.length * TILE + TILE / 2;
      const dcy = doors.reduce((a, d) => a + d.ty, 0) / doors.length * TILE + TILE / 2;
      ctx.save();
      ctx.setLineDash([3, 4]);
      for (const s of world.switches) {
        ctx.strokeStyle = s.pressed ? 'rgba(255,211,77,0.9)' : 'rgba(255,255,255,0.15)';
        ctx.beginPath();
        ctx.moveTo(s.tx * TILE + 8, s.ty * TILE + 12);
        ctx.lineTo(dcx, dcy);
        ctx.stroke();
      }
      ctx.restore();
    }

    for (const d of doors) {
      const x = d.tx * TILE;
      const y = d.ty * TILE;
      if (world.map.doorOpen) {
        ctx.strokeStyle = 'rgba(122,92,58,0.6)';
        ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);
      } else {
        ctx.fillStyle = C.door;
        ctx.fillRect(x, y, TILE, TILE);
        ctx.strokeStyle = '#5a4026';
        ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);
      }
    }
    // 門上的圖案畫在中間那一格
    if (doors.length && !world.map.doorOpen) {
      const mid = doors[Math.floor(doors.length / 2)];
      if (hasLock) this.drawLock(mid.tx * TILE + 8, mid.ty * TILE + 8, C.key);
      else if (world.switches.some((s) => s.kind === 'steam')) {
        ctx.strokeStyle = '#ffd34d';
        ctx.beginPath();
        for (let k = 0; k < 3; k++) {
          const a = (k / 3) * Math.PI * 2;
          ctx.moveTo(mid.tx * TILE + 8, mid.ty * TILE + 8);
          ctx.lineTo(mid.tx * TILE + 8 + Math.cos(a) * 4, mid.ty * TILE + 8 + Math.sin(a) * 4);
        }
        ctx.stroke();
      } else if (world.switches.some((s) => s.kind === 'light')) {
        ctx.fillStyle = '#7ff3ff';
        ctx.beginPath();
        ctx.arc(mid.tx * TILE + 8, mid.ty * TILE + 8, 3.5, 0, Math.PI * 2);
        ctx.fill();
      } else this.drawPlateIcon(mid.tx * TILE + 8, mid.ty * TILE + 8);
    }

    for (const s of world.switches) {
      const x = s.tx * TILE;
      const y = s.ty * TILE;
      if (s.kind === 'steam') {
        // 蒸氣渦輪：蒸氣越多轉得越快，啟動時發亮
        ctx.fillStyle = '#2a2f3c';
        ctx.fillRect(x, y, TILE, TILE);
        ctx.strokeStyle = s.pressed ? '#ffd34d' : '#9aa7bd';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let k = 0; k < 3; k++) {
          const a = s.spin + (k / 3) * Math.PI * 2;
          ctx.moveTo(x + 8, y + 8);
          ctx.lineTo(x + 8 + Math.cos(a) * 6, y + 8 + Math.sin(a) * 6);
        }
        ctx.stroke();
        ctx.lineWidth = 1;
        continue;
      }
      if (s.kind === 'light') {
        // 光線接收器：被照到時發亮
        ctx.fillStyle = '#2a2f3c';
        ctx.fillRect(x, y, TILE, TILE);
        ctx.fillStyle = s.pressed ? '#bffaff' : '#4a6a72';
        ctx.beginPath();
        ctx.arc(x + 8, y + 8, s.pressed ? 5 : 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#7ff3ff';
        ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);
        continue;
      }
      const color = s.kind === 'lock' ? C.key : C.plate;
      ctx.fillStyle = s.pressed ? color : '#555c6b';
      ctx.fillRect(x + 1, y + (s.pressed ? 14 : 12), TILE - 2, s.pressed ? 2 : 4);
      if (s.kind === 'lock') this.drawLock(x + 8, y + 5, s.pressed ? C.key : '#c9b26a');
    }
  }

  drawLock(cx, cy, color) {
    const ctx = this.ctx;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy - 2, 2.5, Math.PI, 0);
    ctx.stroke();
    ctx.fillRect(cx - 4, cy - 2, 8, 6);
    ctx.fillStyle = '#222';
    ctx.fillRect(cx - 0.5, cy, 1, 2);
    ctx.lineWidth = 1;
  }

  drawKey(cx, cy, color) {
    const ctx = this.ctx;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx - 2.5, cy, 2.2, 0, Math.PI * 2);
    ctx.moveTo(cx - 0.3, cy);
    ctx.lineTo(cx + 4.5, cy);
    ctx.moveTo(cx + 3, cy);
    ctx.lineTo(cx + 3, cy + 2.5);
    ctx.moveTo(cx + 4.5, cy);
    ctx.lineTo(cx + 4.5, cy + 2);
    ctx.stroke();
    ctx.lineWidth = 1;
  }

  drawPlateIcon(cx, cy) {
    const ctx = this.ctx;
    ctx.fillStyle = C.plate;
    ctx.fillRect(cx - 4, cy + 1, 8, 2);
    ctx.beginPath();
    ctx.moveTo(cx, cy + 0.5);
    ctx.lineTo(cx - 3, cy - 3);
    ctx.lineTo(cx + 3, cy - 3);
    ctx.fill();
  }

  // 被時間場域影響的物件畫上淡藍色外框，讓玩家看出它變慢了
  timeTint(obj) {
    const t = obj.time ?? obj.mods?.time ?? 1;
    if (t === 1) return;
    const ctx = this.ctx;
    ctx.strokeStyle = t === 0 ? 'rgba(120,200,255,0.95)' : 'rgba(74,168,255,0.6)';
    ctx.strokeRect(obj.x - 1.5, obj.y - 1.5, obj.w + 3, obj.h + 3);
  }

  // 干擾裝置的範圍：對應技能顏色的虛線圓
  drawJammerRanges(world) {
    const ctx = this.ctx;
    for (const e of world.entities) {
      if (!e.isJammer) continue;
      const color = JAMMER_COLORS[e.kind];
      ctx.globalAlpha = 0.07;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(e.cx, e.cy, e.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.6;
      ctx.strokeStyle = color;
      ctx.setLineDash([2, 4]);
      ctx.lineDashOffset = -world.time * 8;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineDashOffset = 0;
      ctx.globalAlpha = 1;
    }
  }

  // 光線：解謎用的光（青色）、集氣預告（紅色細線，鎖定後變亮）、雷射（粗白線加紅色光暈）
  drawBeams(world) {
    const ctx = this.ctx;
    const styles = {
      emitter: [{ color: 'rgba(127,243,255,0.25)', width: 5 }, { color: '#bffaff', width: 1.5 }],
      telegraph: [{ color: 'rgba(255,80,120,0.45)', width: 1, dash: [3, 3] }],
      locked: [{ color: Math.floor(world.time * 16) % 2 ? '#ff5078' : '#ffc0d0', width: 1.5 }],
      laser: [{ color: 'rgba(255,60,110,0.5)', width: 7 }, { color: '#ffffff', width: 2.5 }],
    };
    ctx.lineCap = 'round';
    for (const beam of world.beams) {
      for (const st of styles[beam.kind]) {
        ctx.strokeStyle = st.color;
        ctx.lineWidth = st.width;
        ctx.setLineDash(st.dash ?? []);
        for (const seg of beam.segments) {
          if (seg.length < 2) continue;
          ctx.beginPath();
          ctx.moveTo(seg[0].x, seg[0].y);
          for (let i = 1; i < seg.length; i++) ctx.lineTo(seg[i].x, seg[i].y);
          ctx.stroke();
        }
      }
    }
    ctx.setLineDash([]);
    ctx.lineWidth = 1;
    ctx.lineCap = 'butt';
  }

  drawEntity(world, e) {
    const ctx = this.ctx;
    if (e.isHeater) {
      // 火爐：點燃時顯示範圍和發紅的爐口；熄滅時爐口是暗灰色
      if (e.on) {
        ctx.strokeStyle = 'rgba(255,140,60,0.35)';
        ctx.setLineDash([2, 4]);
        ctx.beginPath();
        ctx.arc(e.cx, e.cy, cfg.heatRadius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.fillStyle = '#3b2a24';
      ctx.fillRect(e.x, e.y, e.w, e.h);
      ctx.fillStyle = e.on ? `rgba(255,${Math.round(110 + Math.sin(world.time * 6) * 30)},40,1)` : '#5a5f6b';
      ctx.fillRect(e.x + 3, e.y + 4, e.w - 6, 3);
      ctx.fillRect(e.x + 3, e.y + 9, e.w - 6, 3);
      return;
    }
    if (e.isSteamPlatform) {
      ctx.fillStyle = '#7d8799';
      ctx.fillRect(e.x, e.y, e.w, e.h);
      ctx.fillStyle = '#2a2f3c';
      for (let x = e.x + 4; x < e.x + e.w - 2; x += 8) ctx.fillRect(x, e.y + 3, 4, 2);
      ctx.fillStyle = '#c9d2e0';
      ctx.fillRect(e.x, e.y, e.w, 1);
      this.timeTint(e);
      return;
    }
    if (e.isCooler) {
      // 冷凍裝置：雪花＋範圍
      ctx.strokeStyle = 'rgba(200,240,255,0.35)';
      ctx.setLineDash([2, 4]);
      ctx.beginPath();
      ctx.arc(e.cx, e.cy, cfg.coldRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#2a2f3c';
      ctx.fillRect(e.x, e.y, e.w, e.h);
      ctx.strokeStyle = '#e0f6ff';
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI + world.time * 0.5;
        ctx.moveTo(e.cx - Math.cos(a) * 5, e.cy - Math.sin(a) * 5);
        ctx.lineTo(e.cx + Math.cos(a) * 5, e.cy + Math.sin(a) * 5);
      }
      ctx.stroke();
      return;
    }
    if (e.isIce) {
      const heat = Math.min(1, e.heat / cfg.meltTime);
      ctx.fillStyle = heat > 0 ? `rgba(${Math.round(200 + heat * 55)},${Math.round(235 - heat * 60)},255,0.9)` : 'rgba(200,235,255,0.85)';
      ctx.fillRect(e.x, e.y, e.w, e.h);
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fillRect(e.x + 2, e.y + 2, 6, 2);
      ctx.strokeStyle = '#8cc8e8';
      ctx.strokeRect(e.x + 0.5, e.y + 0.5, e.w - 1, e.h - 1);
      this.timeTint(e);
      return;
    }
    if (e.isJammer) {
      const color = JAMMER_COLORS[e.kind];
      ctx.fillStyle = '#2a2f3c';
      ctx.fillRect(e.x, e.y, e.w, e.h);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(e.x + 1, e.y + 1, e.w - 2, e.h - 2);
      // 禁止符號
      ctx.beginPath();
      ctx.arc(e.cx, e.cy, 4.5, 0, Math.PI * 2);
      ctx.moveTo(e.cx - 3.2, e.cy + 3.2);
      ctx.lineTo(e.cx + 3.2, e.cy - 3.2);
      ctx.stroke();
      ctx.lineWidth = 1;
      // 可移動的干擾器底部畫兩條線，和固定的區分
      if (e instanceof Box) {
        ctx.fillStyle = color;
        ctx.fillRect(e.x + 2, e.y + e.h - 3, e.w - 4, 1);
      }
      this.timeTint(e);
      return;
    }
    if (e instanceof Emitter) {
      ctx.fillStyle = '#3b4250';
      ctx.fillRect(e.x, e.y, e.w, e.h);
      ctx.fillStyle = '#7ff3ff';
      const d = e.dir ?? { x: 1, y: 0 };
      ctx.fillRect(e.cx + d.x * 5 - 2, e.cy + d.y * 5 - 2, 4, 4);
      return;
    }
    if (e instanceof MirrorBox) {
      ctx.fillStyle = '#4b5a6b';
      ctx.fillRect(e.x, e.y, e.w, e.h);
      ctx.strokeStyle = '#d8f6ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (e.orient === '/') { ctx.moveTo(e.x + 2, e.y + e.h - 2); ctx.lineTo(e.x + e.w - 2, e.y + 2); }
      else { ctx.moveTo(e.x + 2, e.y + 2); ctx.lineTo(e.x + e.w - 2, e.y + e.h - 2); }
      ctx.stroke();
      ctx.lineWidth = 1;
      this.timeTint(e);
      return;
    }
    if (e instanceof BoxSpawner) {
      // 生成器：外框＋補充進度條
      ctx.strokeStyle = '#8a6435';
      ctx.setLineDash([2, 2]);
      ctx.strokeRect(e.x + 0.5, e.y + 0.5, e.w - 1, e.h - 1);
      ctx.setLineDash([]);
      ctx.fillStyle = '#8a6435';
      ctx.fillRect(e.x - 2, e.y - 4, e.w + 4, 2);
      if (e.progress < 1) {
        ctx.fillStyle = '#ffd34d';
        ctx.fillRect(e.x - 2, e.y - 4, (e.w + 4) * e.progress, 2);
      }
      return;
    }
    if (e instanceof Box) {
      ctx.fillStyle = C.box;
      ctx.fillRect(e.x, e.y, e.w, e.h);
      ctx.strokeStyle = C.boxEdge;
      ctx.strokeRect(e.x + 0.5, e.y + 0.5, e.w - 1, e.h - 1);
      if (e.key) this.drawKey(e.cx, e.cy, C.key);
      else {
        ctx.beginPath();
        ctx.moveTo(e.x + 3, e.y + 3); ctx.lineTo(e.x + e.w - 3, e.y + e.h - 3);
        ctx.moveTo(e.x + e.w - 3, e.y + 3); ctx.lineTo(e.x + 3, e.y + e.h - 3);
        ctx.stroke();
      }
      this.timeTint(e);
    } else if (e instanceof MovingPlatform) {
      ctx.fillStyle = C.platform;
      ctx.fillRect(e.x, e.y, e.w, e.h);
      ctx.fillStyle = '#8fb8d4';
      ctx.fillRect(e.x, e.y, e.w, 2);
      this.timeTint(e);
    } else if (e instanceof Blade) {
      const c = Math.cos(e.angle) * e.len;
      const s = Math.sin(e.angle) * e.len;
      ctx.strokeStyle = e.time === 1 ? '#d0d6e2' : '#7cc4ff';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(e.x - c, e.y - s);
      ctx.lineTo(e.x + c, e.y + s);
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.fillStyle = '#666';
      ctx.beginPath();
      ctx.arc(e.x, e.y, 4, 0, Math.PI * 2);
      ctx.fill();
    } else if (e instanceof Crusher) {
      ctx.fillStyle = '#6b7385';
      ctx.fillRect(e.x, e.y, e.w, e.h);
      ctx.fillStyle = C.spike;
      for (let x = e.x; x < e.x + e.w; x += 8) {
        ctx.beginPath();
        ctx.moveTo(x, e.y + e.h);
        ctx.lineTo(x + 8, e.y + e.h);
        ctx.lineTo(x + 4, e.y + e.h + 5);
        ctx.fill();
      }
      ctx.strokeStyle = '#444b5a';
      ctx.beginPath();
      ctx.moveTo(e.cx, 0);
      ctx.lineTo(e.cx, e.y);
      ctx.stroke();
      this.timeTint(e);
    } else if (e.isBullet) {
      ctx.fillStyle = e.friendly ? C.shot : C.bullet;
      ctx.fillRect(e.x, e.y, e.w, e.h);
      if (e.solid) {
        ctx.strokeStyle = '#9fdcff';
        ctx.strokeRect(e.x - 1.5, e.y - 1.5, e.w + 3, e.h + 3);
      }
    } else if (e.isEnemy) {
      this.drawEnemy(world, e);
    }
  }

  drawEnemy(world, e) {
    const ctx = this.ctx;
    ctx.fillStyle = e.flashT > 0 ? '#ffffff' : e.color;
    ctx.fillRect(e.x, e.y, e.w, e.h);
    const up = e.groundAxis === 'y' && e.groundSign < 0;
    const eyeY = up ? e.y + e.h - 5 : e.y + 3;
    ctx.fillStyle = '#1b1b1b';

    if (e instanceof Turret) {
      const p = world.player;
      const a = Math.atan2(p.cy - e.cy, p.cx - e.cx);
      ctx.strokeStyle = '#3b4250';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(e.cx, e.cy);
      ctx.lineTo(e.cx + Math.cos(a) * 11, e.cy + Math.sin(a) * 11);
      ctx.stroke();
      ctx.lineWidth = 1;
    } else if (e instanceof Flyer) {
      const flap = Math.sin(world.time * 20) * 3;
      ctx.fillStyle = '#ffd1ef';
      ctx.fillRect(e.x - 4, e.y + 2 + flap, 4, 3);
      ctx.fillRect(e.x + e.w, e.y + 2 - flap, 4, 3);
      ctx.fillStyle = '#1b1b1b';
      ctx.fillRect(e.cx - 1, eyeY, 2, 2);
    } else {
      const dir = e.dir ?? (Math.sign(world.player.cx - e.cx) || 1);
      ctx.fillRect(dir > 0 ? e.x + e.w - 5 : e.x + 3, eyeY, 2, 2);
    }

    if (e instanceof LaserEnemy) {
      // 眼睛：集氣時越來越亮
      const charge = e.state === 'charge' ? Math.min(1, e.timer / cfg.laserCharge) : e.state === 'fire' ? 1 : 0;
      ctx.fillStyle = `rgba(255,${Math.round(220 - charge * 180)},${Math.round(240 - charge * 160)},1)`;
      ctx.beginPath();
      ctx.arc(e.eye.x, e.eye.y, 2 + charge * 2, 0, Math.PI * 2);
      ctx.fill();
    } else if (e instanceof Heavy) {
      ctx.strokeStyle = '#ffd34d';
      ctx.lineWidth = 2;
      ctx.strokeRect(e.x + 1, e.y + 1, e.w - 2, e.h - 2);
      ctx.lineWidth = 1;
    } else if (e instanceof Jumper) {
      ctx.fillStyle = '#b8900b';
      ctx.fillRect(e.x + 2, up ? e.y : e.y + e.h - 3, e.w - 4, 3);
    }

    // 血量
    if (!e.armored && e.hp < e.maxHp) {
      for (let i = 0; i < e.maxHp; i++) {
        ctx.fillStyle = i < e.hp ? '#ff6b6b' : '#444';
        ctx.fillRect(e.x + i * 4, e.y - 5, 3, 2);
      }
    }
    this.timeTint(e);
  }

  drawPlayer(world) {
    const ctx = this.ctx;
    const p = world.player;
    if (p.invT > 0 && Math.floor(world.time * 20) % 2 === 0) return;

    // 頭的方向和重力相反
    const axis = p.groundAxis ?? 'y';
    const sign = p.groundAxis ? p.groundSign : 1;
    ctx.fillStyle = C.player;
    ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.fillStyle = C.playerBand;
    if (axis === 'y') {
      const bandY = sign > 0 ? p.y + 6 : p.y + p.h - 8;
      ctx.fillRect(p.x, bandY, p.w, 2);
      const eyeY = sign > 0 ? p.y + 3 : p.y + p.h - 5;
      ctx.fillStyle = '#1b2333';
      ctx.fillRect(p.facing > 0 ? p.x + p.w - 4 : p.x + 2, eyeY, 2, 2);
    } else {
      const bandX = sign > 0 ? p.x + 2 : p.x + p.w - 4;
      ctx.fillRect(bandX, p.y, 2, p.h);
    }

    // 指向游標的砲管
    const o = p.shoulder();
    const a = Math.atan2(world.mouse.y - o.y, world.mouse.x - o.x);
    ctx.strokeStyle = '#9aa7bd';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(o.x, o.y);
    ctx.lineTo(o.x + Math.cos(a) * 11, o.y + Math.sin(a) * 11);
    ctx.stroke();
    ctx.lineWidth = 1;

    if (p.timeScale !== 1) this.timeTint({ x: p.x, y: p.y, w: p.w, h: p.h, time: p.timeScale });
    if (p.hasteT > 0) {
      ctx.strokeStyle = 'rgba(74,168,255,0.8)';
      ctx.setLineDash([2, 2]);
      ctx.strokeRect(p.x - 3.5, p.y - 3.5, p.w + 7, p.h + 7);
      ctx.setLineDash([]);
    }
  }

  drawProjectiles(world) {
    const ctx = this.ctx;
    for (const pr of world.projectiles) {
      if (pr.skillId) {
        const color = TREE_COLORS[SKILLS[pr.skillId].tree];
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 + world.time * 10;
          ctx.moveTo(pr.x, pr.y);
          ctx.lineTo(pr.x + Math.cos(a) * 5, pr.y + Math.sin(a) * 5);
        }
        ctx.stroke();
        ctx.fillStyle = C.web;
        ctx.fillRect(pr.x - 1.5, pr.y - 1.5, 3, 3);
      } else {
        ctx.fillStyle = C.shot;
        ctx.beginPath();
        ctx.arc(pr.x, pr.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  drawParticles(world) {
    const ctx = this.ctx;
    for (const pt of world.particles) {
      ctx.globalAlpha = Math.max(0, Math.min(1, pt.life * 3));
      ctx.fillStyle = pt.color;
      ctx.fillRect(pt.x - 1, pt.y - 1, 2, 2);
    }
    // 傷害數字
    ctx.font = `bold 9px ${FONT}`;
    ctx.textAlign = 'center';
    for (const pp of world.popups) {
      ctx.globalAlpha = Math.min(1, pp.life * 3);
      ctx.fillStyle = '#000';
      ctx.fillText(pp.text, pp.x + 1, pp.y + 1);
      ctx.fillStyle = pp.color;
      ctx.fillText(pp.text, pp.x, pp.y);
    }
    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;
  }

  drawFieldFills(world) {
    const ctx = this.ctx;
    for (const f of world.fields.list) {
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = TREE_COLORS[f.skill.tree];
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  drawFieldOutlines(world) {
    const ctx = this.ctx;
    for (const f of world.fields.list) {
      const color = TREE_COLORS[f.skill.tree];
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.5;
      // 附著的場域用虛線外框，和固定在原地的場域區分
      if (f.target) ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      // 剩餘時間；維持型場域沒有時間限制，改用閃爍的完整外圈表示
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (f.channel) {
        ctx.globalAlpha = 0.6 + Math.sin(world.time * 12) * 0.3;
        ctx.arc(f.x, f.y, f.r + 2, 0, Math.PI * 2);
      } else {
        ctx.globalAlpha = 0.95;
        ctx.arc(f.x, f.y, f.r + 2, -Math.PI / 2, -Math.PI / 2 + (f.life / f.maxLife) * Math.PI * 2);
      }
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.globalAlpha = 1;
      this.drawFieldIcon(f, color);
    }
  }

  drawFieldIcon(f, color) {
    const ctx = this.ctx;
    const s = f.skill;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    if (s.type === 'gravityMult') {
      if (s.value === 0) {
        ctx.beginPath();
        ctx.arc(f.x, f.y, 4, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        this.drawArrow(f.x, f.y, 0, Math.sign(s.value), 4 + Math.abs(s.value) * 6);
      }
    } else if (s.type === 'gravityDir') {
      this.drawArrow(f.x, f.y, f.dir.x, f.dir.y, 10);
    } else if (s.type === 'gravityPoint') {
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        this.drawArrow(f.x + Math.cos(a) * 14, f.y + Math.sin(a) * 14, -Math.cos(a), -Math.sin(a), 6);
      }
    } else if (s.type === 'timeMult') {
      ctx.beginPath();
      ctx.arc(f.x, f.y, 6, 0, Math.PI * 2);
      ctx.stroke();
      if (s.value === 0) {
        ctx.fillRect(f.x - 3, f.y - 3, 2, 6);
        ctx.fillRect(f.x + 1, f.y - 3, 2, 6);
      } else {
        ctx.beginPath();
        ctx.moveTo(f.x, f.y);
        ctx.lineTo(f.x, f.y - 4);
        ctx.moveTo(f.x, f.y);
        ctx.lineTo(f.x + 3, f.y);
        ctx.stroke();
      }
    }
    ctx.font = `8px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(s.name, f.x, f.y + f.r - 4);
    ctx.textAlign = 'left';
  }

  drawArrow(x, y, dx, dy, len) {
    const ctx = this.ctx;
    const ex = x + dx * len / 2;
    const ey = y + dy * len / 2;
    ctx.beginPath();
    ctx.moveTo(x - dx * len / 2, y - dy * len / 2);
    ctx.lineTo(ex, ey);
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex - dx * 3 - dy * 3, ey - dy * 3 + dx * 3);
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex - dx * 3 + dy * 3, ey - dy * 3 - dx * 3);
    ctx.stroke();
  }

  drawPreview(world) {
    const ctx = this.ctx;
    const pv = world.previewWeb();
    ctx.save();
    ctx.setLineDash([4, 4]);
    if (pv.target !== world.player) {
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath();
      ctx.moveTo(pv.o.x, pv.o.y);
      ctx.lineTo(pv.x, pv.y);
      ctx.stroke();
    }
    ctx.strokeStyle = pv.target ? 'rgba(120,255,180,0.6)' : pv.blocked ? 'rgba(255,200,120,0.5)' : 'rgba(255,255,255,0.3)';
    ctx.beginPath();
    ctx.arc(pv.x, pv.y, cfg.fieldRadius, 0, Math.PI * 2);
    ctx.stroke();
    // 會附著的對象加上外框
    if (pv.target) {
      ctx.setLineDash([]);
      ctx.strokeRect(pv.target.x - 2.5, pv.target.y - 2.5, pv.target.w + 5, pv.target.h + 5);
      ctx.setLineDash([4, 4]);
    }
    // 射程
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.setLineDash([2, 6]);
    ctx.beginPath();
    ctx.arc(pv.o.x, pv.o.y, cfg.webRange, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  drawHitboxes(world) {
    const ctx = this.ctx;
    ctx.strokeStyle = '#00ff88';
    for (const b of [world.player, ...world.entities]) {
      if (b.w) ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
    }
    for (const s of world.switches) {
      ctx.strokeStyle = '#ffff00';
      ctx.strokeRect(s.x, s.y, s.w, s.h);
    }
    const p = world.player;
    const m = p.mods;
    ctx.fillStyle = '#00ff88';
    ctx.font = `8px monospace`;
    ctx.fillText(
      `g=(${m.gx.toFixed(0)},${m.gy.toFixed(0)}) t=${p.timeScale.toFixed(2)} v=(${p.vx.toFixed(0)},${p.vy.toFixed(0)}) ${p.grounded ? 'ground' : 'air'}`,
      4, VIEW_H - 40,
    );
  }

  drawHud(world) {
    const ctx = this.ctx;
    const p = world.player;
    ctx.font = `9px ${FONT}`;
    ctx.textBaseline = 'middle';

    // HP / MP
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(4, 4, 128, 28);
    ctx.fillStyle = C.hud;
    ctx.fillText('HP', 8, 12);
    for (let i = 0; i < cfg.hp; i++) {
      ctx.fillStyle = i < p.hp ? '#ff6b6b' : '#3a3f4b';
      ctx.fillRect(24 + i * 10, 8, 8, 8);
    }
    ctx.fillStyle = C.hud;
    ctx.fillText('MP', 8, 25);
    ctx.fillStyle = '#3a3f4b';
    ctx.fillRect(24, 21, 100, 8);
    // 維持自身附著時，MP 條改成閃爍的黃色，提醒正在持續消耗
    ctx.fillStyle = world.fields.channeling && Math.floor(world.time * 8) % 2 ? '#ffd34d' : '#4aa8ff';
    ctx.fillRect(24, 21, (p.mp / cfg.mpMax) * 100, 8);
    const cost = cfg.mpMax * cfg.mpCostRatio;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    for (let x = cost; x < cfg.mpMax; x += cost) ctx.fillRect(24 + (x / cfg.mpMax) * 100, 21, 1, 8);

    // 房間名稱與提示
    ctx.textAlign = 'center';
    ctx.fillStyle = C.hud;
    ctx.font = `10px ${FONT}`;
    ctx.fillText(`${world.room.name}（${world.roomIndex + 1}/${world.roomCount}）`, VIEW_W / 2, 10);
    ctx.font = `8px ${FONT}`;
    ctx.fillStyle = C.dim;
    ctx.fillText(cfg.showHints ? world.room.hint : '卡關時按 / 顯示提示', VIEW_W / 2, 22);

    // 訊息
    world.toasts.forEach((t, i) => {
      ctx.globalAlpha = Math.min(1, t.life * 2);
      ctx.fillStyle = '#ffe9a8';
      ctx.font = `9px ${FONT}`;
      ctx.fillText(t.text, VIEW_W / 2, 40 + i * 12);
    });
    ctx.globalAlpha = 1;

    // 技能欄（右上角直排，避免擋住地板與尖刺）
    const slotW = 66;
    const x = VIEW_W - slotW - 6;
    ctx.textAlign = 'left';
    SLOT_KEYS.forEach((slot, i) => {
      const id = world.loadout[i];
      const sk = id ? SKILLS[id] : null;
      const y = 30 + i * 16;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(x, y, slotW, 14);
      if (sk) {
        ctx.fillStyle = TREE_COLORS[sk.tree];
        ctx.fillRect(x, y, 3, 14);
      }
      ctx.font = `7px ${FONT}`;
      ctx.fillStyle = C.dim;
      ctx.fillText(slot.label, x + 6, y + 7);
      ctx.font = `9px ${FONT}`;
      ctx.fillStyle = sk && p.mp >= cost ? C.hud : C.dim;
      ctx.fillText(sk ? sk.name : '—', x + 26, y + 7);
    });

    ctx.font = `8px ${FONT}`;
    ctx.fillStyle = C.dim;
    ctx.fillText('H：操作說明　Tab：裝備', 6, 40);
    if (this.versionLabel) ctx.fillText('水：' + this.versionLabel, 6, 52);
    ctx.textBaseline = 'alphabetic';
  }

  // 游標旁的施放方式提示
  drawCastHint(world, x, y) {
    const ctx = this.ctx;
    let text = null;
    let color = '#e8edf5';
    if (world.fields.channeling) {
      text = '維持中：放開按鍵結束';
      color = '#ffd34d';
    } else if (world.isSelfCast()) {
      if (cfg.selfAttachUnlocked) {
        text = '長按：附著自己（持續耗 MP）';
        color = '#78ffb4';
      } else {
        text = '自身附著尚未解鎖';
        color = '#7d869a';
      }
    } else {
      const pv = world.previewWeb();
      if (pv.target) {
        text = '按一下：附著在目標上';
        color = '#78ffb4';
      }
    }
    if (!text) return;
    ctx.font = `8px ${FONT}`;
    const w = ctx.measureText(text).width;
    // 靠近右邊緣時改顯示在游標左側
    const tx = x + 10 + w > VIEW_W - 4 ? x - 10 - w : x + 10;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(tx - 3, y + 6, w + 6, 12);
    ctx.fillStyle = color;
    ctx.textBaseline = 'middle';
    ctx.fillText(text, tx, y + 12);
    ctx.textBaseline = 'alphabetic';
  }

  drawCursor(world) {
    const ctx = this.ctx;
    const { x, y } = world.mouse;
    this.drawCastHint(world, x, y);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - 6, y); ctx.lineTo(x - 2, y);
    ctx.moveTo(x + 2, y); ctx.lineTo(x + 6, y);
    ctx.moveTo(x, y - 6); ctx.lineTo(x, y - 2);
    ctx.moveTo(x, y + 2); ctx.lineTo(x, y + 6);
    ctx.stroke();
  }
}
