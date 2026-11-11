// 世界狀態（正式遊戲的存檔）：拿到的能力、升級、解開的門與捷徑、去過的房間、最後存檔的女神像。
// 房間內的物件（箱子、冰、繩子）不存：離開房間再回來會還原
const SAVE_KEY = 'testphysics-save-v1';

export function newSave() {
  return {
    room: null,      // 最後存檔的房間 id（女神像）；null 表示區域的起點
    abilities: ['lowG'], // 拿到的能力（技能 id）；起始能力：減重
    flags: {},       // 解開的門（door:房間）、捷徑、打開的寶箱（chest:房間）、拿到的升級（up:房間）
    visited: [],     // 去過的房間 id（小地圖）
    mpBonus: 0,      // MP 上限升級
  };
}

// 讀不到（沒有存檔、瀏覽器擋住儲存空間、Node 測試）時回傳 null
export function loadSave() {
  try {
    const raw = globalThis.localStorage?.getItem(SAVE_KEY);
    return raw ? { ...newSave(), ...JSON.parse(raw) } : null;
  } catch {
    return null;
  }
}

export function writeSave(save) {
  try {
    globalThis.localStorage?.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    // 儲存空間被擋住時不存，遊戲照常進行
  }
}

export function clearSave() {
  try {
    globalThis.localStorage?.removeItem(SAVE_KEY);
  } catch {
    // 同上
  }
}

// 房間的亂數種子：用房間 id（或名稱）算，房間增減、換順序時同一個房間的結果不變
export function roomSeed(room) {
  const s = room.id ?? room.name;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
