import { cfg, TILE, COLS, ROWS, VIEW_W, VIEW_H, SLOT_KEYS } from './config.js';
import { SKILLS, TREE_COLORS } from './skills.js';
import { Box, BoxSpawner, MovingPlatform, Blade, Crusher } from './objects.js';
import { Heavy, Jumper, Flyer, Turret, LaserEnemy } from './enemies.js';
import { Presser, Balloon, CeilingWalker, ShieldSoldier, GravityBoss } from './gravity-enemies.js';
import { Emitter, MirrorBox } from './light.js';
import { heroSprites, HERO_ANIMS, enemySprites, wallTile, wallTop, spikeTile, doorTile, crateSprite, noise } from './pixel/art.js';

const JAMMER_COLORS = { ...TREE_COLORS, all: '#ffffff' };

// 像素字型（Fusion Pixel 12px，只用 12px 一種大小才會清楚）
const FONT = '"FusionPixel", "Microsoft JhengHei", sans-serif';
const TEXT = `12px ${FONT}`;
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
    this.out = canvas.getContext('2d');
    // 整個遊戲畫在 640×360 的低解析度畫布上（1 世界像素 = 1 像素），最後整數倍放大
    this.low = document.createElement('canvas');
    this.low.width = VIEW_W;
    this.low.height = VIEW_H;
    this.ctx = this.low.getContext('2d');
    this.scale = 1;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  // 以裝置像素算放大倍率：放得下 1 倍以上就取整數倍，每個像素大小一致；太小才用小數倍
  resize() {
    const dpr = window.devicePixelRatio || 1;
    const fit = Math.min((window.innerWidth * dpr) / VIEW_W, (window.innerHeight * dpr) / VIEW_H);
    const k = fit >= 1 ? Math.floor(fit) : Math.max(0.25, fit);
    this.canvas.width = Math.round(VIEW_W * k);
    this.canvas.height = Math.round(VIEW_H * k);
    this.canvas.style.width = this.canvas.width / dpr + 'px';
    this.canvas.style.height = this.canvas.height / dpr + 'px';
    this.scale = k / dpr;
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
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    this.drawGrid();
    this.drawFieldFills(world);
    this.drawTiles(world);
    // 實驗版本可以自訂水的畫法（粒子水），或在原本的水上加特效
    if (!world.water.draw?.(this.ctx, world)) this.drawWater(world);
    if (!world.water.drawsLava) this.drawLava(world);
    this.fx?.draw(this.ctx, world);
    this.drawPortals(world);
    this.drawSwitchesAndDoors(world);
    this.drawJammerRanges(world);
    for (const e of world.entities) this.drawEntity(world, e);
    this.drawPlayer(world);
    if (world.water.drawSteamLayer) world.water.drawSteamLayer(this.ctx); else this.drawSteam(world);
    this.drawReflect(world);
    this.drawBeams(world);
    this.drawProjectiles(world);
    this.drawBolts(world);
    this.drawParticles(world);
    this.drawFieldOutlines(world);
    this.drawStasisArrows(world);
    this.drawDirAim(world);
    this.drawGrab(world);
    this.drawRewinds(world);
    this.drawPreview(world);
    if (cfg.showHitboxes) this.drawHitboxes(world);
    this.drawHud(world);
    if (world.hasBoss) this.drawBossHud(world);
    this.drawCursor(world);
    const out = this.out;
    out.imageSmoothingEnabled = false;
    out.drawImage(this.low, 0, 0, this.canvas.width, this.canvas.height);
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
          ctx.drawImage(wallTile(Math.floor(noise(tx, ty, 7) * 4)), x, y);
          if (!map.isSolid(tx, ty - 1) && ty > 0) ctx.drawImage(wallTop(), x, y);
          // 外露的左、右、下緣畫一條暗邊
          ctx.fillStyle = '#262c3a';
          if (tx > 0 && !map.isSolid(tx - 1, ty)) ctx.fillRect(x, y, 1, TILE);
          if (tx < COLS - 1 && !map.isSolid(tx + 1, ty)) ctx.fillRect(x + TILE - 1, y, 1, TILE);
          if (ty < ROWS - 1 && !map.isSolid(tx, ty + 1)) ctx.fillRect(x, y + TILE - 1, TILE, 1);
        } else if ((c === 'I' || c === 'Q') && world.water.drawsSolids) {
          // 像素版：冰和石頭由像素畫，這裡不畫整格
        } else if (c === 'I') {
          // 冰牆格：被光照時越來越紅、越亮
          const heat = Math.min(1, world.water.meltProgress(tx, ty));
          ctx.fillStyle = heat > 0 ? `rgb(${Math.round(190 + heat * 65)},${Math.round(232 - heat * 60)},255)` : '#bfe8ff';
          ctx.fillRect(x, y, TILE, TILE);
          ctx.fillStyle = 'rgba(255,255,255,0.6)';
          ctx.fillRect(x + 2, y + 2, 5, 2);
          ctx.strokeStyle = '#8cc8e8';
          ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);
        } else if (c === 'Q') {
          // 石頭：熔岩凝固而成，深灰色帶一點紅
          ctx.fillStyle = '#3d3436';
          ctx.fillRect(x, y, TILE, TILE);
          ctx.fillStyle = '#4f4446';
          ctx.fillRect(x + 2, y + 3, 5, 3);
          ctx.fillRect(x + 9, y + 9, 4, 3);
          ctx.fillStyle = 'rgba(200,80,40,0.35)';
          ctx.fillRect(x + 6, y + 12, 3, 1);
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

  // 熔岩：從格子底部往上填，表面有流動的亮紋；被時停的熔岩畫成暗紅色並加框（可以站、不燙）
  drawLava(world) {
    const ctx = this.ctx;
    const w = world.water;
    for (let ty = 0; ty < ROWS; ty++) {
      for (let tx = 0; tx < COLS; tx++) {
        if (w.lavaAt(tx, ty) <= 0.02) continue;
        const r = w.liquidRect(w.lava, tx, ty);
        const frozen = w.frozenLava.has(w.idx(tx, ty));
        ctx.fillStyle = frozen ? '#6b2a1c' : '#c4361b';
        ctx.fillRect(r.x, r.y, r.w, r.h);
        const top = w.lavaAt(tx, ty - 1) <= 0.02;
        if (frozen) {
          ctx.strokeStyle = 'rgba(200,240,255,0.6)';
          ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
        } else if (top) {
          ctx.fillStyle = '#ff8a3d';
          ctx.fillRect(r.x, r.y + Math.sin(world.time * 3 + tx) * 1, r.w, 2);
          ctx.fillStyle = 'rgba(255,210,120,0.8)';
          ctx.fillRect(r.x + ((world.time * 10 + tx * 7) % TILE), r.y + Math.min(r.h - 2, 6), 3, 2);
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
    this.ctx.drawImage(spikeTile(pointDown), x, y);
  }

  drawSpikeVector(x, y, pointDown) {
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
        ctx.drawImage(doorTile(), x, y);
      }
    }
    // 門上的圖案畫在中間那一格
    if (doors.length && !world.map.doorOpen && !world.hasBoss && world.room.openWhen !== 'enemies') {
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
    if (e.isLavaBlob) {
      // 飛行中的熔岩塊；被時停時畫成暗紅色並加框（可以站、不燙）
      // 用 2 px 的小方塊組成（和熔岩池同樣的像素質感與顏色），四個角挖掉，看起來像一團熔岩
      const frozen = e.time < 0.05;
      const seed = Math.floor(e.x * 7 + e.y * 13);
      for (let py = 0; py < 4; py++) {
        for (let px = 0; px < 4; px++) {
          if ((px === 0 || px === 3) && (py === 0 || py === 3)) continue;
          const n = (seed + px * 31 + py * 17) % 7;
          ctx.fillStyle = frozen ? (n < 3 ? '#6b2a1c' : '#7a3322') : py === 0 ? '#ff9640' : n < 2 ? '#ffb347' : n < 5 ? '#d8441c' : '#c4361b';
          ctx.fillRect(Math.round(e.x) + px * 2, Math.round(e.y) + py * 2, 2, 2);
        }
      }
      if (frozen) {
        ctx.strokeStyle = 'rgba(200,240,255,0.7)';
        ctx.strokeRect(e.x - 0.5, e.y - 0.5, e.w + 1, e.h + 1);
      }
      return;
    }
    if (e.isBomb) {
      // 火山彈：黑色石塊帶橘色裂紋
      ctx.save();
      ctx.translate(e.cx, e.cy);
      ctx.rotate(e.spin);
      ctx.fillStyle = '#2b2426';
      ctx.fillRect(-4, -4, 8, 8);
      ctx.strokeStyle = '#ff8a3d';
      ctx.beginPath();
      ctx.moveTo(-3, -1); ctx.lineTo(1, 1); ctx.lineTo(3, -2);
      ctx.stroke();
      ctx.restore();
      if (e.time < 0.05) this.timeTint(e);
      return;
    }
    if (e.isVent) {
      // 噴發口：火山口的形狀，預兆時越來越亮
      const glow = e.state === 'warn' ? 1 - e.timer / cfg.ventWarn : e.state === 'erupt' ? 1 : 0.15;
      ctx.fillStyle = '#3a2a26';
      ctx.beginPath();
      ctx.moveTo(e.x - 2, e.y + e.h);
      ctx.lineTo(e.x + 4, e.y + 4);
      ctx.lineTo(e.x + e.w - 4, e.y + 4);
      ctx.lineTo(e.x + e.w + 2, e.y + e.h);
      ctx.fill();
      ctx.fillStyle = `rgba(255,${Math.round(90 + glow * 120)},40,${0.4 + glow * 0.6})`;
      ctx.fillRect(e.x + 5, e.y + 3, e.w - 10, 3);
      if (e.blocked) {
        ctx.fillStyle = '#7d869a';
        ctx.font = TEXT;
        ctx.textAlign = 'center';
        ctx.fillText('封住', e.cx, e.y - 2);
        ctx.textAlign = 'left';
      }
      return;
    }
    if (e.isSource) {
      // 液體源：牆上的出水口，開啟時有液體流出的顏色
      ctx.fillStyle = '#3b4250';
      ctx.fillRect(e.x, e.y, e.w, e.h);
      const color = e.liquid === 'lava' ? '#ff6a2a' : '#4aa8ff';
      ctx.fillStyle = e.on ? color : '#5a5f6b';
      const d = e.dir ?? { x: 0, y: 1 };
      ctx.fillRect(e.cx + d.x * 5 - 3, e.cy + d.y * 5 - 3, 6, 6);
      // 開啟時畫出流出去的液柱：從出口往下，直到碰到地面或液面；關閉時就沒有，一眼看得出狀態
      if (e.on && !e.full) {
        const sx = e.cx + d.x * 10;
        let sy = e.cy + d.y * 10;
        const y0 = sy;
        while (sy < VIEW_H && !world.map.pointSolid(sx, sy) && !world.water.pointInWater(sx, sy) && !world.water.pointInLava(sx, sy)) sy += 2;
        ctx.fillStyle = e.liquid === 'lava' ? 'rgba(255,120,40,0.85)' : 'rgba(90,160,255,0.7)';
        for (let y = y0; y < sy; y += 2) ctx.fillRect(sx - 1 + (Math.floor(world.time * 20 + y / 2) % 3 === 0 ? 1 : 0), y, 2, 2);
      }
      ctx.strokeStyle = color;
      ctx.strokeRect(e.x + 0.5, e.y + 0.5, e.w - 1, e.h - 1);
      return;
    }
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
      const crate = crateSprite(e.isIron ? 'iron' : 'box');
      if (e.w === 16 && e.h === 16) ctx.drawImage(crate, Math.round(e.x), Math.round(e.y));
      else ctx.drawImage(crate, Math.round(e.x), Math.round(e.y), e.w, e.h);
      if (e.key) this.drawKey(Math.round(e.cx), Math.round(e.cy), C.key);
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
      ctx.fillStyle = e.friendly ? C.shot : e.gravityBullet ? '#c070ff' : C.bullet;
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
    const up = e.groundAxis === 'y' && e.groundSign < 0;
    const kind = e instanceof GravityBoss ? (e.phase === 2 ? 'boss2' : 'boss') : e instanceof Presser ? 'presser'
      : e instanceof Balloon ? 'balloon' : e instanceof CeilingWalker ? 'ceiling' : e instanceof ShieldSoldier ? 'shield'
      : e instanceof LaserEnemy ? 'laser' : e instanceof Heavy ? 'heavy' : e instanceof Jumper ? 'jumper'
      : e instanceof Flyer ? 'flyer' : e instanceof Turret ? 'turret' : 'walker';
    if (e.shieldR) this.drawShield(world, e);
    const frames = enemySprites(kind);
    const fr = frames[Math.floor(world.time * (kind === 'flyer' ? 10 : 5) + e.x * 0.01) % 2];
    const img = e.flashT > 0 ? fr.flash : fr.canvas;
    const dir = e.dir ?? (Math.sign(world.player.cx - e.cx) || 1);
    ctx.save();
    ctx.translate(Math.round(e.cx), Math.round(e.cy));
    ctx.scale(dir < 0 ? -1 : 1, up ? -1 : 1);
    ctx.drawImage(img, -Math.floor(img.width / 2), -Math.floor(img.height / 2));
    ctx.restore();

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
    }

    if (e instanceof LaserEnemy) {
      // 眼睛：集氣時越來越亮
      const charge = e.state === 'charge' ? Math.min(1, e.timer / cfg.laserCharge) : e.state === 'fire' ? 1 : 0;
      if (charge > 0) {
        ctx.fillStyle = `rgba(255,${Math.round(220 - charge * 180)},${Math.round(240 - charge * 160)},1)`;
        const r = Math.round(1 + charge * 2);
        ctx.fillRect(Math.round(e.eye.x) - r, Math.round(e.eye.y) - r, r * 2, r * 2);
      }
    }

    // 血量
    if (!e.armored && !e.isBoss && e.hp < e.maxHp) {
      for (let i = 0; i < e.maxHp; i++) {
        ctx.fillStyle = i < e.hp ? '#ff6b6b' : '#444';
        ctx.fillRect(e.x + i * 4, e.y - 5, 3, 2);
      }
    }
    this.timeTint(e);
  }

  // 重力盾：紫色的虛線圈，被干擾時變暗
  drawShield(world, e) {
    const ctx = this.ctx;
    const on = !world.fields.jammedAt(e.cx, e.cy, 'gravity');
    const n = 28;
    const spin = world.time * 1.5;
    ctx.fillStyle = on ? 'rgba(201,168,255,0.85)' : 'rgba(120,120,140,0.5)';
    for (let i = 0; i < n; i++) {
      if (i % 2) continue;
      const a = (i / n) * Math.PI * 2 + spin;
      ctx.fillRect(Math.round(e.cx + Math.cos(a) * e.shieldR) - 1, Math.round(e.cy + Math.sin(a) * e.shieldR) - 1, 2, 2);
    }
  }

  // 魔王房間：畫面下方顯示重力時鐘與魔王的血條；王身上顯示目前的重力方向與倒數
  drawBossHud(world) {
    const boss = world.entities.find((e) => e.isBoss && e.alive);
    if (!boss) return;
    const ctx = this.ctx;
    const blink = Math.floor(world.time * 6) % 2 === 0;
    const warn = !!boss.warnDir && boss.moveT <= 0;

    // 王身上：外圈轉動的光點（預告時越轉越快），箭頭指向目前的重力方向，預告時改指下一個方向並閃爍
    const spin = world.time * (warn ? 6 : 1.5);
    ctx.fillStyle = warn ? '#ffd34d' : 'rgba(201,168,255,0.8)';
    for (let i = 0; i < 6; i++) {
      const a = spin + (i / 6) * Math.PI * 2;
      ctx.fillRect(Math.round(boss.cx + Math.cos(a) * 21) - 1, Math.round(boss.cy + Math.sin(a) * 21) - 1, 2, 2);
    }
    const g = world.fields.base;
    const d = warn ? boss.warnDir : g;
    if (!warn || blink) {
      ctx.strokeStyle = warn ? '#ffd34d' : '#ffffff';
      ctx.lineWidth = 2;
      this.drawArrow(boss.cx + d.x * 30, boss.cy + d.y * 30, d.x, d.y, 14);
      ctx.lineWidth = 1;
    }
    ctx.font = TEXT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (warn) {
      // 倒數 3、2、1（顯示在王的另一側，避免被箭頭擋住）
      ctx.fillStyle = '#ffd34d';
      ctx.fillText(String(Math.ceil(boss.timer)), Math.round(boss.cx - d.x * 32), Math.round(boss.cy - d.y * 32));
    }

    // 重力時鐘（畫在最下面那排地板上，不會擋住玩家）：整個循環排成一排，框起目前的方向；
    // 下一格在預告時閃爍；下面的條是距離下次轉向的時間
    const c = boss.clock(world);
    const cell = 16;
    const n = c.cycle.length;
    const x0 = Math.round(VIEW_W / 2 - (n * cell) / 2);
    const y0 = 339;
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(x0 - 3, y0 - 2, n * cell + 6, cell + 3);
    c.cycle.forEach((dir, i) => {
      const cx = x0 + i * cell + cell / 2;
      const cy = y0 + cell / 2;
      const cur = i === c.index;
      const next = i === (c.index + 1) % n;
      if (cur) {
        ctx.fillStyle = '#a070ff';
        ctx.fillRect(x0 + i * cell + 1, y0, cell - 2, cell);
      }
      ctx.strokeStyle = cur ? '#ffffff' : next && warn ? (blink ? '#ffd34d' : '#7d869a') : next ? '#ffd34d' : '#7d869a';
      ctx.lineWidth = 2;
      this.drawArrow(cx, cy, dir.x, dir.y, 9);
      ctx.lineWidth = 1;
    });
    ctx.fillStyle = '#3a3f4b';
    ctx.fillRect(x0, y0 + cell - 1, n * cell, 2);
    ctx.fillStyle = warn ? '#ffd34d' : '#c9a8ff';
    ctx.fillRect(x0, y0 + cell - 1, Math.round((1 - Math.max(0, c.timer) / c.period) * n * cell), 2);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    // 血條（中間的白線：進入第二階段的位置）
    const w = 140;
    const x = x0 + n * cell + 12;
    const y = 344;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x - 2, y - 2, w + 4, 10);
    ctx.fillStyle = '#3a3f4b';
    ctx.fillRect(x, y, w, 6);
    ctx.fillStyle = boss.phase === 2 ? '#d060c0' : '#a070ff';
    ctx.fillRect(x, y, Math.round((boss.hp / boss.maxHp) * w), 6);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x + w / 2, y, 1, 6);
  }

  drawPlayer(world) {
    const ctx = this.ctx;
    const p = world.player;
    if (p.invT > 0 && Math.floor(world.time * 20) % 2 === 0) return;

    // 精靈：腳朝向重力方向（重力反轉就倒過來、側向重力就轉 90 度）
    const axis = p.groundAxis ?? 'y';
    const sign = p.groundAxis ? p.groundSign : 1;
    const along = axis === 'y' ? p.vx : p.vy;
    const across = (axis === 'y' ? p.vy : p.vx) * sign;
    let anim = 'idle';
    if (!p.grounded && p.groundAxis) anim = across < 0 ? 'jump' : 'fall';
    else if (!p.groundAxis) anim = 'fall';
    else if (Math.abs(along) > 10) anim = 'run';
    const A = HERO_ANIMS[anim];
    const pose = A.frames[Math.floor(world.time * A.fps) % A.frames.length];
    const spr = heroSprites()[pose];
    const img = p.stunT > 0 ? spr.flash : spr.canvas;
    const rot = axis === 'y' ? (sign > 0 ? 0 : Math.PI) : sign > 0 ? -Math.PI / 2 : Math.PI / 2;
    // 面向：畫面上的左右（倒立時精靈左右也會跟著反過來，所以要補回來）
    const face = axis === 'y' ? p.facing * sign : p.facing;
    ctx.save();
    ctx.translate(Math.round(p.cx), Math.round(p.cy));
    ctx.rotate(rot);
    ctx.scale(face < 0 ? -1 : 1, 1);
    ctx.drawImage(img, -9, -19);
    ctx.restore();

    // 指向游標的砲管：逐像素畫的短管，管口一點亮色
    const o = p.shoulder();
    const a = Math.atan2(world.mouse.y - o.y, world.mouse.x - o.x);
    for (let k = 2; k <= 10; k++) {
      const bx = Math.round(o.x + Math.cos(a) * k);
      const by = Math.round(o.y + Math.sin(a) * k);
      ctx.fillStyle = '#10131a';
      ctx.fillRect(bx - 2, by - 2, 4, 4);
    }
    for (let k = 2; k <= 10; k++) {
      const bx = Math.round(o.x + Math.cos(a) * k);
      const by = Math.round(o.y + Math.sin(a) * k);
      ctx.fillStyle = k >= 9 ? '#4ad0ff' : '#9aa7bd';
      ctx.fillRect(bx - 1, by - 1, 2, 2);
    }

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
    ctx.font = TEXT;
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

  // 畫出來的場域半徑：附著的時停只凍結目標本身，所以只畫一個貼著目標的小圈
  fieldDrawR(f) {
    if (f.target && f.skill.type === 'timeMult' && f.skill.value === 0) return Math.hypot(f.target.w, f.target.h) / 2 + 3;
    return f.r;
  }

  drawFieldFills(world) {
    const ctx = this.ctx;
    for (const f of world.fields.list) {
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = TREE_COLORS[f.skill.tree];
      ctx.beginPath();
      ctx.arc(f.x, f.y, this.fieldDrawR(f), 0, Math.PI * 2);
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
      const r = this.fieldDrawR(f);
      ctx.beginPath();
      ctx.arc(f.x, f.y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      // 剩餘時間；維持型場域沒有時間限制，改用閃爍的完整外圈表示
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (f.channel) {
        ctx.globalAlpha = 0.6 + Math.sin(world.time * 12) * 0.3;
        ctx.arc(f.x, f.y, r + 2, 0, Math.PI * 2);
      } else {
        ctx.globalAlpha = 0.95;
        ctx.arc(f.x, f.y, r + 2, -Math.PI / 2, -Math.PI / 2 + (f.life / f.maxLife) * Math.PI * 2);
      }
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.globalAlpha = 1;
      if (r === f.r) this.drawFieldIcon(f, color);
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
    } else if (s.type === 'magnet') {
      // 馬蹄形磁鐵
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(f.x, f.y - 1, 5, Math.PI, 0);
      ctx.moveTo(f.x - 5, f.y - 1); ctx.lineTo(f.x - 5, f.y + 5);
      ctx.moveTo(f.x + 5, f.y - 1); ctx.lineTo(f.x + 5, f.y + 5);
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(f.x - 6, f.y + 4, 3, 2);
      ctx.fillRect(f.x + 4, f.y + 4, 3, 2);
      ctx.fillStyle = color;
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
    ctx.font = TEXT;
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

  // 時停中累積的力：從物體中心畫出箭頭，力道越大越長、越粗、越亮（時間系的藍色；紅色保留給「加熱」）
  drawStasisArrows(world) {
    const ctx = this.ctx;
    for (const e of world.entities) {
      if (!e.isBody || !e.alive || e.mods.time >= 0.05) continue;
      const v = Math.hypot(e.vx, e.vy);
      if (v < 20) continue;
      const k = Math.min(1, v / 900);
      const len = Math.round(10 + k * 30);
      const ux = e.vx / v;
      const uy = e.vy / v;
      const c = Math.round(120 + k * 135);
      ctx.strokeStyle = `rgb(${Math.round(74 + k * 181)},${Math.round(168 + k * 87)},255)`;
      ctx.lineWidth = k > 0.6 ? 3 : 2;
      this.drawArrow(e.cx + (ux * len) / 2, e.cy + (uy * len) / 2, ux, uy, len);
      ctx.lineWidth = 1;
      if (c > 250 && Math.floor(world.time * 8) % 2) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(Math.round(e.cx + ux * len) - 1, Math.round(e.cy + uy * len) - 1, 3, 3);
      }
    }
  }

  // 向量反射場：角色周圍一圈轉動的橘色六角形，反射成功時閃白
  drawReflect(world) {
    const rf = world.reflect;
    if (!rf) return;
    const ctx = this.ctx;
    const p = world.player;
    const R = cfg.reflectRadius;
    const spin = world.time * 2;
    ctx.strokeStyle = rf.flash > 0 ? '#ffffff' : 'rgba(255,179,71,0.85)';
    ctx.lineWidth = rf.flash > 0 ? 2 : 1;
    ctx.beginPath();
    for (let i = 0; i <= 6; i++) {
      const a = spin + (i / 6) * Math.PI * 2;
      const x = Math.round(p.cx + Math.cos(a) * R) + 0.5;
      const y = Math.round(p.cy + Math.sin(a) * R) + 0.5;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = '#ffb347';
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // 電磁加速的閃電：鋸齒狀的青白色線，外層粗、內層白色細線，逐漸淡出
  drawBolts(world) {
    const ctx = this.ctx;
    for (const b of world.bolts) {
      const len = Math.hypot(b.x2 - b.x1, b.y2 - b.y1);
      const n = Math.max(2, Math.round(len / 6));
      const nx = -(b.y2 - b.y1) / (len || 1);
      const ny = (b.x2 - b.x1) / (len || 1);
      const pts = [];
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const j = i === 0 || i === n ? 0 : (Math.random() - 0.5) * 8;
        pts.push({ x: b.x1 + (b.x2 - b.x1) * t + nx * j, y: b.y1 + (b.y2 - b.y1) * t + ny * j });
      }
      ctx.globalAlpha = Math.min(1, b.life * 4);
      for (const [color, width] of [['#5fd8ff', 3], ['#ffffff', 1]]) {
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.beginPath();
        pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.lineWidth = 1;
    }
  }

  // 重力抓取：從肩膀到被抓的物體一串紫色光點，物體外圍一圈
  drawGrab(world) {
    const g = world.grab;
    if (!g) return;
    const ctx = this.ctx;
    const o = world.player.shoulder();
    const t = g.target;
    const d = Math.hypot(t.cx - o.x, t.cy - o.y);
    ctx.fillStyle = '#c9a8ff';
    for (let k = 6; k < d; k += 6) {
      const wob = Math.sin(world.time * 20 + k * 0.3) * 1.5;
      ctx.fillRect(Math.round(o.x + ((t.cx - o.x) / d) * k + wob) - 1, Math.round(o.y + ((t.cy - o.y) / d) * k) - 1, 2, 2);
    }
    ctx.strokeStyle = '#c9a8ff';
    ctx.strokeRect(Math.round(t.x) - 2.5, Math.round(t.y) - 2.5, t.w + 5, t.h + 5);
  }

  // 時間倒轉中：剩下要走的路徑畫成淡藍色的點，物體本身染成藍色
  drawRewinds(world) {
    const ctx = this.ctx;
    for (const e of world.entities) {
      const r = e.rewind;
      if (!r || !e.alive) continue;
      ctx.fillStyle = 'rgba(159,216,255,0.7)';
      for (let k = Math.ceil(r.i); k < r.frames.length; k += 6) {
        const p = r.frames[k];
        ctx.fillRect(Math.round(p.x + e.w / 2) - 1, Math.round(p.y + e.h / 2) - 1, 2, 2);
      }
      ctx.fillStyle = 'rgba(74,168,255,0.35)';
      ctx.fillRect(Math.round(e.x), Math.round(e.y), e.w, e.h);
    }
  }

  // 定向重力施放中：從起點到游標的方向箭頭
  drawDirAim(world) {
    const anchor = world.dirAimAnchor?.();
    if (!anchor) return;
    const ctx = this.ctx;
    const dir = world.dirAim.web.dir;
    ctx.strokeStyle = '#d0b0ff';
    ctx.lineWidth = 2;
    this.drawArrow(anchor.x + dir.x * 20, anchor.y + dir.y * 20, dir.x, dir.y, 28);
    ctx.lineWidth = 1;
    ctx.fillStyle = '#d0b0ff';
    ctx.fillRect(Math.round(anchor.x) - 1, Math.round(anchor.y) - 1, 3, 3);
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
    ctx.font = TEXT;
    ctx.textBaseline = 'middle';

    // HP / MP
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(4, 4, 134, 30);
    ctx.fillStyle = C.hud;
    ctx.fillText('HP', 8, 11);
    for (let i = 0; i < cfg.hp; i++) {
      ctx.fillStyle = i < p.hp ? '#ff6b6b' : '#3a3f4b';
      ctx.fillRect(28 + i * 10, 7, 8, 8);
      if (i < p.hp) { ctx.fillStyle = '#ffb0b0'; ctx.fillRect(28 + i * 10, 7, 3, 2); }
    }
    ctx.fillStyle = C.hud;
    ctx.fillText('MP', 8, 26);
    ctx.fillStyle = '#3a3f4b';
    ctx.fillRect(28, 22, 104, 8);
    // 維持自身附著時，MP 條改成閃爍的黃色，提醒正在持續消耗
    ctx.fillStyle = world.fields.channeling && Math.floor(world.time * 8) % 2 ? '#ffd34d' : '#4aa8ff';
    ctx.fillRect(28, 22, Math.round((p.mp / cfg.mpMax) * 104), 8);
    const cost = cfg.mpMax * cfg.mpCostRatio;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    for (let x = cost; x < cfg.mpMax; x += cost) ctx.fillRect(28 + Math.round((x / cfg.mpMax) * 104), 22, 1, 8);

    // 房間名稱與提示
    ctx.textAlign = 'center';
    ctx.fillStyle = C.hud;
    ctx.fillText(`${world.room.name}（${world.roomIndex + 1}/${world.roomCount}）`, VIEW_W / 2, 10);
    ctx.fillStyle = C.dim;
    ctx.fillText(cfg.showHints ? world.room.hint : '卡關時按 / 顯示提示', VIEW_W / 2, 25);

    // 訊息
    world.toasts.forEach((t, i) => {
      ctx.globalAlpha = Math.min(1, t.life * 2);
      ctx.fillStyle = '#ffe9a8';
      ctx.fillText(t.text, VIEW_W / 2, 44 + i * 14);
    });
    ctx.globalAlpha = 1;

    // 技能欄（右上角直排，避免擋住地板與尖刺）
    const slotW = 84;
    const x = VIEW_W - slotW - 4;
    ctx.textAlign = 'left';
    SLOT_KEYS.forEach((slot, i) => {
      const id = world.loadout[i];
      const sk = id ? SKILLS[id] : null;
      const y = 36 + i * 16;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(x, y, slotW, 15);
      if (sk) {
        ctx.fillStyle = TREE_COLORS[sk.tree];
        ctx.fillRect(x, y, 3, 15);
      }
      ctx.fillStyle = C.dim;
      ctx.fillText(slot.label, x + 6, y + 8);
      const cd = id ? world.cooldowns[id] ?? 0 : 0;
      ctx.fillStyle = sk && p.mp >= cost && cd <= 0 ? C.hud : C.dim;
      ctx.fillText(sk ? sk.name : '—', x + 32, y + 8);
      // 冷卻中：暗色進度條加剩餘秒數；維持中的向量反射：橘色外框
      if (cd > 0) {
        const total = id === 'reflect' ? cfg.reflectCdEmpty : id === 'railgun' ? cfg.railCd : 1;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(x + 3, y, Math.round((slotW - 3) * Math.min(1, cd / total)), 15);
        ctx.fillStyle = '#ffd34d';
        ctx.textAlign = 'right';
        ctx.fillText(cd.toFixed(1), x + slotW - 3, y + 8);
        ctx.textAlign = 'left';
      }
      if (id === 'reflect' && world.reflect) {
        ctx.strokeStyle = '#ffb347';
        ctx.strokeRect(x + 0.5, y + 0.5, slotW - 1, 14);
      }
    });

    ctx.fillStyle = C.dim;
    ctx.fillText('H 說明　Tab 裝備', 6, 44);
    if (this.versionLabel) ctx.fillText('水：' + this.versionLabel, 6, 58);
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
    } else if (world.dirAim) {
      text = '移動游標決定方向，放開確定';
      color = '#d0b0ff';
    } else if (world.grab) {
      text = '移動游標搬運，放開丟出';
      color = '#d0b0ff';
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
    ctx.font = TEXT;
    const w = ctx.measureText(text).width;
    // 靠近右邊緣時改顯示在游標左側
    const tx = x + 10 + w > VIEW_W - 4 ? x - 10 - w : x + 10;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(Math.round(tx) - 3, y + 6, Math.ceil(w) + 6, 15);
    ctx.fillStyle = color;
    ctx.textBaseline = 'middle';
    ctx.fillText(text, Math.round(tx), y + 14);
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
