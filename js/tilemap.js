import { TILE, COLS, ROWS } from './config.js';

// 地形字元：
//   #  實心
//   ^  尖刺（不實心，碰到會受傷）
//   D  門（關閉時實心）
//   |  移動平台的折返標記（只對平台有效，其他物體可以穿過）
//   I  冰牆格（實心、很滑；被光照到會融化，水遇冷會結成冰牆格）
export class TileMap {
  constructor(rows) {
    // 存成字元陣列，讓冰可以在遊戲中出現或消失
    this.rows = rows.map((r) => r.split(''));
    this.doorOpen = false;
  }

  set(tx, ty, c) {
    if (tx >= 0 && tx < COLS && ty >= 0 && ty < ROWS) this.rows[ty][tx] = c;
  }

  get(tx, ty) {
    if (tx < 0) return '#';
    if (tx >= COLS || ty < 0 || ty >= ROWS) return ' ';
    return this.rows[ty][tx];
  }

  isSolid(tx, ty) {
    const c = this.get(tx, ty);
    return c === '#' || c === 'I' || (c === 'D' && !this.doorOpen);
  }

  pointSolid(x, y) {
    return this.isSolid(Math.floor(x / TILE), Math.floor(y / TILE));
  }

  // 找出矩形範圍內的格子，對每一格呼叫 test，只要有一格成立就回傳 true
  anyTileInRect(x, y, w, h, test) {
    const tx0 = Math.floor(x / TILE);
    const ty0 = Math.floor(y / TILE);
    const tx1 = Math.floor((x + w - 0.001) / TILE);
    const ty1 = Math.floor((y + h - 0.001) / TILE);
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        if (test(tx, ty)) return true;
      }
    }
    return false;
  }

  rectSolid(x, y, w, h) {
    return this.anyTileInRect(x, y, w, h, (tx, ty) => this.isSolid(tx, ty));
  }

  rectSpikes(x, y, w, h) {
    return this.anyTileInRect(x, y, w, h, (tx, ty) => this.get(tx, ty) === '^');
  }

  rectPlatformStop(x, y, w, h) {
    return this.anyTileInRect(x, y, w, h, (tx, ty) => this.isSolid(tx, ty) || this.get(tx, ty) === '|');
  }

  // 列出所有門的格子
  doorTiles() {
    const list = [];
    for (let ty = 0; ty < ROWS; ty++) {
      for (let tx = 0; tx < COLS; tx++) {
        if (this.rows[ty][tx] === 'D') list.push({ tx, ty });
      }
    }
    return list;
  }
}
