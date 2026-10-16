import { cfg } from './config.js';
import { SKILLS } from './skills.js';

export class Field {
  // target：附著的對象（玩家、箱子、敵人）。有附著對象時，場域會跟著它移動
  // channel：維持中的按鍵代碼（自身附著）。維持型場域沒有時間限制，放開按鍵或 MP 耗盡時結束
  constructor(x, y, skillId, dir, target = null, channel = null) {
    this.x = x;
    this.y = y;
    this.target = target;
    this.channel = channel;
    this.r = cfg.fieldRadius;
    this.skillId = skillId;
    this.skill = SKILLS[skillId];
    this.dir = dir; // 定向重力的方向（單位向量）
    this.maxLife = cfg.fieldDuration;
    this.life = channel ? Infinity : this.maxLife;
  }

  contains(x, y) {
    const dx = x - this.x;
    const dy = y - this.y;
    return dx * dx + dy * dy <= this.r * this.r;
  }
}

export class FieldSystem {
  constructor() {
    this.list = [];
    this.jammers = []; // 由 World 每幀更新：{ x, y, r, kind }
    // 整個房間的基本重力方向（重力魔王會轉動它）；預設向下
    this.base = { x: 0, y: 1 };
    // 敵人自帶的重力盾（由 World 每幀更新）：{ x, y, r, value, owner }。
    // 和玩家的場域分開：不佔場上數量、不會被解除；疊加在基本重力上（不會取代它），擁有者自己不受影響
    this.innate = [];
  }

  // 重力盾往外推的加速度。點上有重力盾時，連同同一點的所有點重力一起加總，
  // 所以玩家在盾上放一個點重力（吸引）就能把盾抵消。shield：只算盾本身的推力大小
  shieldPush(x, y) {
    const G = cfg.gravity;
    let px = 0;
    let py = 0;
    let inShield = false;
    const add = (fx, fy, value) => {
      const dx = fx - x;
      const dy = fy - y;
      const d = Math.hypot(dx, dy);
      if (d < 0.001) return;
      const k = (G * value * Math.min(1, d / 8)) / d;
      px += dx * k;
      py += dy * k;
    };
    for (const s of this.innate) {
      if (Math.hypot(x - s.x, y - s.y) > s.r || this.jammedAt(x, y, 'gravity')) continue;
      inShield = true;
      add(s.x, s.y, s.value);
    }
    if (!inShield) return null;
    const shield = Math.hypot(px, py);
    for (const f of this.list) {
      if (f.skill.type === 'gravityPoint' && f.contains(x, y) && !this.jammedAt(x, y, f.skill.tree)) add(f.x, f.y, f.skill.value);
    }
    return { x: px, y: py, shield };
  }

  // 這一點是否被干擾（tree：'gravity'、'time'、'space'）
  jammedAt(x, y, tree) {
    return this.jammers.some((j) => (j.kind === tree || j.kind === 'all') && Math.hypot(x - j.x, y - j.y) <= j.r);
  }

  // 光線在這一點受到的彎曲（只有定向重力與點重力會讓光彎曲，就像有質量的物體）
  lightBend(x, y) {
    const G = cfg.gravity;
    let bx = 0;
    let by = 0;
    for (const f of this.list) {
      if (!f.contains(x, y) || this.jammedAt(x, y, f.skill.tree)) continue;
      if (f.skill.type === 'gravityDir') {
        bx += f.dir.x * G * f.skill.value;
        by += f.dir.y * G * f.skill.value;
      } else if (f.skill.type === 'gravityPoint') {
        const dx = f.x - x;
        const dy = f.y - y;
        const d = Math.hypot(dx, dy);
        if (d > 0.001) {
          const k = (G * f.skill.value * Math.min(1, d / 8)) / d;
          bx += dx * k;
          by += dy * k;
        }
      }
    }
    return { x: bx, y: by };
  }

  clear() {
    this.list.length = 0;
  }

  // 維持型場域不佔用場上數量上限，也不會被新的場域擠掉
  add(field) {
    this.list.push(field);
    const placed = () => this.list.filter((f) => !f.channel);
    while (placed().length > cfg.maxFields) this.list.splice(this.list.indexOf(placed()[0]), 1);
  }

  remove(field) {
    this.list = this.list.filter((f) => f !== field);
  }

  get channeling() {
    return this.list.some((f) => f.channel);
  }

  // 場域的持續時間用真實時間計算，不受時間場域影響
  update(dt) {
    for (const f of this.list) f.life -= dt;
    this.list = this.list.filter((f) => f.life > 0);
    this.followTargets();
  }

  // 附著的場域移到對象目前的位置。對象消失時，場域留在原地
  followTargets() {
    for (const f of this.list) {
      if (!f.target) continue;
      if (!f.target.alive) { f.target = null; continue; }
      f.x = f.target.cx;
      f.y = f.target.cy;
    }
  }

  // 取得某一點的物理參數。疊加規則：先加總方向型，再乘上所有倍率。
  // self：取樣的物體（它自己的重力盾不影響它自己）
  sample(x, y, self = null) {
    const G = cfg.gravity;
    let dirX = 0;
    let dirY = 0;
    let hasDir = false;
    let gMult = 1;
    let tMult = 1;
    let drag = 0;
    let inField = false;

    for (const f of this.list) {
      if (!f.contains(x, y)) continue;
      const s = f.skill;
      if (this.jammedAt(x, y, s.tree)) continue; // 干擾裝置範圍內，這個顏色的場域失效
      inField = true;
      drag += s.drag ?? 0;
      switch (s.type) {
        case 'gravityMult':
          gMult *= s.value;
          break;
        case 'gravityDir':
          dirX += f.dir.x * G * s.value;
          dirY += f.dir.y * G * s.value;
          hasDir = true;
          break;
        case 'gravityPoint': {
          const dx = f.x - x;
          const dy = f.y - y;
          const d = Math.hypot(dx, dy);
          if (d > 0.001) {
            // 靠近中心時減弱，避免在中心來回抖動
            const k = (G * s.value * Math.min(1, d / 8)) / d;
            dirX += dx * k;
            dirY += dy * k;
          }
          hasDir = true;
          break;
        }
        case 'timeMult':
          tMult *= s.value;
          break;
      }
    }

    let gx = hasDir ? dirX : G * this.base.x;
    let gy = hasDir ? dirY : G * this.base.y;
    gx *= gMult;
    gy *= gMult;
    // 重力盾：往外推，疊加在上面
    for (const sh of this.innate) {
      if (sh.owner === self) continue;
      const dx = sh.x - x; // 和點重力相同的算法：value 為負時往外推
      const dy = sh.y - y;
      const d = Math.hypot(dx, dy);
      if (d > sh.r || d < 0.001 || this.jammedAt(x, y, 'gravity')) continue;
      const k = (G * sh.value * Math.min(1, d / 8)) / d;
      gx += dx * k;
      gy += dy * k;
      inField = true;
    }
    const mag = Math.hypot(gx, gy);
    const maxG = G * cfg.maxGravityMult;
    if (mag > maxG) {
      gx *= maxG / mag;
      gy *= maxG / mag;
    }

    return { gx, gy, time: Math.min(tMult, cfg.maxTimeScale), drag, inField };
  }
}
