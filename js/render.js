import { cfg, TILE, COLS, ROWS, VIEW_W, VIEW_H, SLOT_KEYS } from './config.js';
import { SKILLS, TREE_COLORS } from './skills.js';
import { Box, MovingPlatform, Blade, Crusher } from './objects.js';
import { Heavy, Jumper, Flyer, Turret } from './enemies.js';

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
    this.drawSwitchesAndDoors(world);
    for (const e of world.entities) this.drawEntity(world, e);
    this.drawPlayer(world);
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
      else this.drawPlateIcon(mid.tx * TILE + 8, mid.ty * TILE + 8);
    }

    for (const s of world.switches) {
      const x = s.tx * TILE;
      const y = s.ty * TILE;
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

  drawEntity(world, e) {
    const ctx = this.ctx;
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

    if (e instanceof Heavy) {
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
    ctx.fillText(world.room.hint, VIEW_W / 2, 22);

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
    ctx.textBaseline = 'alphabetic';
  }

  drawCursor(world) {
    const ctx = this.ctx;
    const { x, y } = world.mouse;
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
