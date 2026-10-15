import { cfg } from './config.js';
import { SKILLS } from './skills.js';

export class Field {
  constructor(x, y, skillId, dir) {
    this.x = x;
    this.y = y;
    this.r = cfg.fieldRadius;
    this.skillId = skillId;
    this.skill = SKILLS[skillId];
    this.dir = dir; // 定向重力的方向（單位向量）
    this.maxLife = cfg.fieldDuration;
    this.life = this.maxLife;
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
  }

  clear() {
    this.list.length = 0;
  }

  add(field) {
    this.list.push(field);
    while (this.list.length > cfg.maxFields) this.list.shift();
  }

  // 場域的持續時間用真實時間計算，不受時間場域影響
  update(dt) {
    for (const f of this.list) f.life -= dt;
    this.list = this.list.filter((f) => f.life > 0);
  }

  // 取得某一點的物理參數。疊加規則：先加總方向型，再乘上所有倍率。
  sample(x, y) {
    const G = cfg.gravity;
    let dirX = 0;
    let dirY = 0;
    let hasDir = false;
    let gMult = 1;
    let tMult = 1;
    let inField = false;

    for (const f of this.list) {
      if (!f.contains(x, y)) continue;
      inField = true;
      const s = f.skill;
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

    let gx = hasDir ? dirX : 0;
    let gy = hasDir ? dirY : G;
    gx *= gMult;
    gy *= gMult;
    const mag = Math.hypot(gx, gy);
    const maxG = G * cfg.maxGravityMult;
    if (mag > maxG) {
      gx *= maxG / mag;
      gy *= maxG / mag;
    }

    return { gx, gy, time: Math.min(tMult, cfg.maxTimeScale), inField };
  }
}
