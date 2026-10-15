import { cfg, COLS, ROWS } from './config.js';
import { TileMap } from './tilemap.js';
import { Field, FieldSystem } from './fields.js';
import { SKILLS, DEFAULT_LOADOUT, isFieldSkill } from './skills.js';
import { PortalSystem } from './portals.js';
import { rectsOverlap } from './body.js';
import { Player } from './player.js';
import { Web } from './projectiles.js';
import { Box, MovingPlatform, Blade, Crusher, Switch } from './objects.js';
import { Walker, Heavy, Jumper, Flyer, Turret } from './enemies.js';
import { ROOMS } from './rooms.js';

const KEEP_IN_MAP = new Set(['#', '^', 'D', '|']);

function parseRoom(def) {
  const rows = def.map.map((r) => r.padEnd(COLS, ' ').slice(0, COLS));
  while (rows.length < ROWS) rows.unshift('#'.padEnd(COLS - 1, ' ') + '#');
  const grid = rows.map((r) => r.split(''));
  const entities = [];
  const switches = [];
  let spawn = { tx: 2, ty: ROWS - 2 };

  for (let ty = 0; ty < ROWS; ty++) {
    for (let tx = 0; tx < COLS; tx++) {
      const c = grid[ty][tx];
      if (KEEP_IN_MAP.has(c) || c === ' ') continue;
      switch (c) {
        case 'P': spawn = { tx, ty }; break;
        case 'B': entities.push(new Box(tx, ty)); break;
        case 'K': entities.push(new Box(tx, ty, true)); break;
        case 'L': switches.push(new Switch(tx, ty, 'lock')); break;
        case 'S': switches.push(new Switch(tx, ty, 'plate')); break;
        case 'O': entities.push(new Blade(tx, ty)); break;
        case 'w': entities.push(new Walker(tx, ty)); break;
        case 'h': entities.push(new Heavy(tx, ty)); break;
        case 'j': entities.push(new Jumper(tx, ty)); break;
        case 'f': entities.push(new Flyer(tx, ty)); break;
        case 'T': entities.push(new Turret(tx, ty)); break;
        case 'V':
        case '=': {
          // 連續的同一個字元合成一個物件
          let n = 0;
          while (grid[ty][tx + n] === c) { grid[ty][tx + n] = ' '; n++; }
          entities.push(c === 'V' ? new Crusher(tx, ty, n) : new MovingPlatform(tx, ty, n));
          continue;
        }
        default:
          console.warn(`未知的地圖字元 "${c}"（${tx}, ${ty}）`);
      }
      grid[ty][tx] = ' ';
    }
  }
  return { rows: grid.map((r) => r.join('')), entities, switches, spawn };
}

export class World {
  constructor(input) {
    this.input = input;
    this.mouse = { x: 0, y: 0 };
    this.fields = new FieldSystem();
    this.portals = new PortalSystem();
    this.player = new Player();
    this.loadout = [...DEFAULT_LOADOUT];
    this.particles = [];
    this.toasts = [];
    this.time = 0;
    this.loadRoom(0);
  }

  get room() { return ROOMS[this.roomIndex]; }
  get roomCount() { return ROOMS.length; }

  loadRoom(index) {
    this.roomIndex = ((index % ROOMS.length) + ROOMS.length) % ROOMS.length;
    const parsed = parseRoom(this.room);
    this.map = new TileMap(parsed.rows);
    this.entities = parsed.entities;
    this.switches = parsed.switches;
    this.doorTiles = this.map.doorTiles();
    this.spawn = parsed.spawn;
    this.projectiles = [];
    this.fields.clear();
    this.portals.clear();
    this.player.respawn(this.spawn);
    this.pendingRoom = null;
    this.toast(this.room.name);
  }

  requestRoom(index) {
    this.pendingRoom = index;
  }

  resetRoom() {
    this.requestRoom(this.roomIndex);
  }

  // 玩家與所有受物理影響的物體
  bodies() {
    const list = [this.player];
    for (const e of this.entities) if (e.isBody && e.alive) list.push(e);
    return list;
  }

  overlap(a, b) {
    return rectsOverlap(a, b);
  }

  // 會穿過傳送門的東西：所有物理物體與子彈
  portalTravelers() {
    const list = this.bodies();
    for (const e of this.entities) if (e.isBullet && e.alive) list.push(e);
    return list;
  }

  // 矩形是否碰到實心地形。傳送門所在的牆格，對塞得進門的物體視為空地，讓物體可以走進門裡
  solidTiles(x, y, w, h) {
    if (!this.map.rectSolid(x, y, w, h)) return false;
    if (!this.portals.active) return true;
    return this.map.anyTileInRect(x, y, w, h,
      (tx, ty) => this.map.isSolid(tx, ty) && !this.portals.coversTile(tx, ty, x, y, w, h));
  }

  // 碰撞查詢：回傳 'tile'、擋住的實心物件，或 null
  rectBlocked(x, y, w, h, self) {
    if (this.solidTiles(x, y, w, h)) return 'tile';
    for (const e of this.entities) {
      if (e === self || !e.solid || !e.alive) continue;
      if (x < e.x + e.w && x + w > e.x && y < e.y + e.h && y + h > e.y) return e;
    }
    return null;
  }

  // 找出某一點附近可以被擊中的物件（箱子、敵人；includeBullets 時也包含子彈）
  hitTest(x, y, pad, includeBullets = false) {
    for (const e of this.entities) {
      if (!e.alive || !e.hittable) continue;
      if (e.isBullet && (!includeBullets || e.friendly)) continue;
      if (x > e.x - pad && x < e.x + e.w + pad && y > e.y - pad && y < e.y + e.h + pad) return e;
    }
    return null;
  }

  castSkill(slot, keyCode) {
    const id = this.loadout[slot];
    if (!id) return;
    const skill = SKILLS[id];
    const cost = cfg.mpMax * cfg.mpCostRatio;
    const p = this.player;
    const selfCast = isFieldSkill(skill) && this.isSelfCast();
    if (selfCast && !cfg.selfAttachUnlocked) {
      this.toast('尚未解鎖自身附著');
      return;
    }
    if (p.mp < cost) {
      this.toast('MP 不足');
      return;
    }
    p.mp -= cost;

    if (skill.self) {
      p.hasteT = cfg.fieldDuration;
      this.burst(p.cx, p.cy, '#4aa8ff', 14);
      return;
    }
    if (skill.type === 'blink') {
      this.blink();
      return;
    }

    const o = p.shoulder();
    let end = this.clampToRange(o, this.mouse);
    const dx = end.x - o.x;
    const dy = end.y - o.y;
    const d = Math.hypot(dx, dy);
    // 游標太靠近自己時（例如對自己施放定向重力），方向改用面向
    const dir = d > 8 ? { x: dx / d, y: dy / d } : { x: p.facing, y: 0 };
    // 傳送門：沿著瞄準方向飛到射程極限，直到撞到牆（不會停在游標位置）
    if (skill.type === 'portal') end = { x: o.x + dir.x * cfg.webRange, y: o.y + dir.y * cfg.webRange };

    if (selfCast) {
      this.fields.add(new Field(p.cx, p.cy, id, dir, p, keyCode));
      this.burst(p.cx, p.cy, '#ffffff', 10);
      return;
    }
    this.projectiles.push(new Web(o.x, o.y, end.x, end.y, id, dir));
  }

  // 閃現：朝游標瞬間移動，保留原本的速度。不能穿牆時，停在路徑上最後一個空位
  blink() {
    const p = this.player;
    const from = { x: p.cx, y: p.cy };
    const dx = this.mouse.x - from.x;
    const dy = this.mouse.y - from.y;
    const d = Math.min(Math.hypot(dx, dy), cfg.blinkRange);
    if (d < 1) return;
    const ux = dx / Math.hypot(dx, dy);
    const uy = dy / Math.hypot(dx, dy);
    const free = (t) => !this.rectBlocked(from.x + ux * t - p.w / 2, from.y + uy * t - p.h / 2, p.w, p.h, p);

    let best = 0;
    if (cfg.blinkThroughWalls) {
      for (let t = d; t > 0; t -= 2) if (free(t)) { best = t; break; }
    } else {
      for (let t = 2; t <= d; t += 2) {
        if (!free(t)) break;
        best = t;
      }
    }
    this.burst(p.cx, p.cy, '#3ddc84', 10);
    p.x = from.x + ux * best - p.w / 2;
    p.y = from.y + uy * best - p.h / 2;
    this.burst(p.cx, p.cy, '#3ddc84', 10);
  }

  // 技能失敗時退回 MP
  refundSkill() {
    this.player.mp = Math.min(cfg.mpMax, this.player.mp + cfg.mpMax * cfg.mpCostRatio);
  }

  // 維持型場域：放開按鍵或 MP 耗盡時結束
  updateChannels(dt) {
    const p = this.player;
    for (const f of this.fields.list.filter((f) => f.channel)) {
      if (!this.input.isDown(f.channel)) {
        this.fields.remove(f);
        continue;
      }
      p.mp -= cfg.selfDrain * dt;
      if (p.mp <= 0) {
        p.mp = 0;
        this.fields.remove(f);
        this.toast('MP 耗盡');
      }
    }
  }

  // 對自己施放：游標指在自己身上，或按住 C
  isSelfCast() {
    const p = this.player;
    const m = this.mouse;
    const pad = 4;
    const onSelf = m.x > p.x - pad && m.x < p.x + p.w + pad && m.y > p.y - pad && m.y < p.y + p.h + pad;
    return onSelf || this.input.isDown('KeyC');
  }

  clampToRange(origin, target) {
    const dx = target.x - origin.x;
    const dy = target.y - origin.y;
    const d = Math.hypot(dx, dy);
    if (d <= cfg.webRange) return { x: target.x, y: target.y };
    return { x: origin.x + (dx / d) * cfg.webRange, y: origin.y + (dy / d) * cfg.webRange };
  }

  // 預覽：網實際會在哪裡展開（和 Web.update 使用相同的判定）
  // target：場域會附著的對象
  previewWeb() {
    const o = this.player.shoulder();
    if (this.isSelfCast()) return { o, x: this.player.cx, y: this.player.cy, blocked: false, target: this.player };
    const end = this.clampToRange(o, this.mouse);
    const dx = end.x - o.x;
    const dy = end.y - o.y;
    const d = Math.hypot(dx, dy);
    let x = o.x;
    let y = o.y;
    for (let t = 0; t < d; t += 4) {
      const step = Math.min(4, d - t);
      const nx = x + (dx / d) * step;
      const ny = y + (dy / d) * step;
      if (this.map.pointSolid(nx, ny)) return { o, x, y, blocked: true, target: null };
      const hit = this.hitTest(nx, ny, 2);
      if (hit) {
        if (hit.isBody) return { o, x: hit.cx, y: hit.cy, blocked: true, target: hit };
        return { o, x, y, blocked: true, target: null };
      }
      x = nx;
      y = ny;
    }
    return { o, x, y, blocked: false, target: null };
  }

  hurtPlayer(amount, { respawn = false, fromX = null } = {}) {
    const p = this.player;
    if (this.pendingRoom !== null) return;
    if (!respawn && p.invT > 0) return;
    p.hp -= amount;
    if (p.hp <= 0) {
      p.hp = cfg.hp;
      p.mp = cfg.mpMax;
      this.toast('倒下了，房間重置');
      this.resetRoom();
      return;
    }
    if (respawn) {
      this.toast(`-${amount} HP，回到入口`);
      this.resetRoom();
      return;
    }
    p.invT = cfg.invulnTime;
    const away = fromX === null ? -p.facing : Math.sign(p.cx - fromX) || 1;
    p.vx = away * 160;
    if (p.groundAxis === 'y') p.vy = -p.groundSign * 160;
  }

  burst(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 30 + Math.random() * 90;
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.3 + Math.random() * 0.3, color });
    }
  }

  toast(text) {
    this.toasts.push({ text, life: 2 });
    if (this.toasts.length > 4) this.toasts.shift();
  }

  update(dt) {
    this.time += dt;
    this.fields.update(dt);
    this.portals.update(dt, this);
    this.player.update(this, dt);
    this.updateChannels(dt);

    if (this.pendingRoom === null) {
      for (const e of this.entities) if (e.alive) e.update(this, dt);
      for (const p of this.projectiles) if (p.alive) p.update(this, dt);
      for (const b of this.portalTravelers()) this.portals.tryTeleport(this, b);
      this.updateSwitches();
    }

    this.fields.followTargets();
    this.entities = this.entities.filter((e) => e.alive);
    this.projectiles = this.projectiles.filter((p) => p.alive);

    for (const pt of this.particles) {
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.life -= dt;
    }
    this.particles = this.particles.filter((pt) => pt.life > 0);
    for (const t of this.toasts) t.life -= dt;
    this.toasts = this.toasts.filter((t) => t.life > 0);

    if (this.pendingRoom !== null) this.loadRoom(this.pendingRoom);
  }

  updateSwitches() {
    for (const s of this.switches) s.update(this);
    if (!this.doorTiles.length) return;
    const open = this.switches.length > 0 && this.switches.every((s) => s.pressed);
    if (open === this.map.doorOpen) return;
    if (!open) {
      // 有東西卡在門的位置時先不要關門
      const blocked = this.doorTiles.some(({ tx, ty }) =>
        this.bodies().some((b) => rectsOverlap(b, { x: tx * 16, y: ty * 16, w: 16, h: 16 })),
      );
      if (blocked) return;
    }
    this.map.doorOpen = open;
    this.toast(open ? '門打開了' : '門關上了');
  }
}
