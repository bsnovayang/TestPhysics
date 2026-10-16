import { cfg, TILE, COLS, ROWS, VIEW_W, VIEW_H } from '../config.js';
import { wallTile, wallTop, spikeTile, doorTile, noise } from '../pixel/art.js';
import { C, JAMMER_COLORS } from './common.js';

// 地形與環境：背景格線、圖塊、水、熔岩、蒸氣、傳送門、開關與門、干擾範圍、光線
// 這些方法會掛到 Renderer 上（Object.assign），裡面的 this 就是 renderer
export const TerrainRenderer = {
  drawGrid() {
    const ctx = this.ctx;
    ctx.strokeStyle = C.bgGrid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= VIEW_W; x += TILE) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, VIEW_H); }
    for (let y = 0; y <= VIEW_H; y += TILE) { ctx.moveTo(0, y + 0.5); ctx.lineTo(VIEW_W, y + 0.5); }
    ctx.stroke();
  },

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
  },

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
  },

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
  },

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
  },

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
  },

  drawSpike(x, y, pointDown) {
    this.ctx.drawImage(spikeTile(pointDown), x, y);
  },

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
  },

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
  },

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
  },

  drawPlateIcon(cx, cy) {
    const ctx = this.ctx;
    ctx.fillStyle = C.plate;
    ctx.fillRect(cx - 4, cy + 1, 8, 2);
    ctx.beginPath();
    ctx.moveTo(cx, cy + 0.5);
    ctx.lineTo(cx - 3, cy - 3);
    ctx.lineTo(cx + 3, cy - 3);
    ctx.fill();
  },

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
  },

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
  },
};
