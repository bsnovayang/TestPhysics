// 可以固定種子的亂數（mulberry32）。同樣的種子永遠產生同樣的數列，
// 所以同樣的操作在謎題中永遠得到同樣的結果。純視覺的粒子效果不需要用這個
export function makeRng(seed) {
  let a = seed >>> 0;
  return function rand() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 由字串（例如房間地圖）算出種子，讓每個房間都有自己固定的種子
export function seedFromString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
