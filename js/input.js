// 鍵盤與滑鼠輸入。滑鼠按鍵以 'Mouse0'（左）、'Mouse1'（中）、'Mouse2'（右）表示，和鍵盤共用同一套查詢。
const PREVENT = new Set(['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Backquote']);

export class Input {
  constructor() {
    this.down = new Set();
    this.pressed = new Set();
    this.clientX = 0;
    this.clientY = 0;
    this.keyListeners = [];
  }

  attach(target) {
    window.addEventListener('keydown', (e) => {
      if (PREVENT.has(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.down.add(e.code);
      this.pressed.add(e.code);
      for (const fn of this.keyListeners) fn(e.code);
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());
    target.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const code = 'Mouse' + e.button;
      this.down.add(code);
      this.pressed.add(code);
    });
    window.addEventListener('mouseup', (e) => this.down.delete('Mouse' + e.button));
    window.addEventListener('mousemove', (e) => {
      this.clientX = e.clientX;
      this.clientY = e.clientY;
    });
    target.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  onKey(fn) {
    this.keyListeners.push(fn);
  }

  isDown(code) {
    return this.down.has(code);
  }

  wasPressed(code) {
    return this.pressed.has(code);
  }

  // 每個固定步長結束後呼叫，清除「這一步按下」的紀錄
  endStep() {
    this.pressed.clear();
  }
}
