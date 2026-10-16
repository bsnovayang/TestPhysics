// 技能定義
// type：
//   gravityMult  重力倍率（相乘）
//   gravityDir   定向重力（向量相加，方向＝施放方向）
//   gravityPoint 點重力（向量相加，指向場域中心）
//   timeMult     時間倍率（相乘）
//   selfHaste    自身加速（不發射網）
//   grab         重力抓取：按住抓起游標下的物體，移動游標搬運，放開時保留速度（丟出去）
//   magnet       磁力場域：只吸引金屬物體（鐵塊、重裝兵、重壓兵），疊加在原本的重力上
//   rewind       時間倒轉：網打中的物體沿著過去 8 秒的路徑倒退回去（倒退中是實心的，可以站在上面被載回去）
// drag：場域內的阻力（每秒衰減率），讓物體在反重力場域上緣穩定漂浮，而不是一直上下彈跳
export const SKILLS = {
  lowG:     { name: '減重',     tree: 'gravity', type: 'gravityMult', value: 0.5 },
  zeroG:    { name: '無重力',   tree: 'gravity', type: 'gravityMult', value: 0 },
  reverseG: { name: '反重力',   tree: 'gravity', type: 'gravityMult', value: -1, drag: 12 },
  dirG:     { name: '定向重力', tree: 'gravity', type: 'gravityDir',  value: 1 },
  pointG:   { name: '點重力',   tree: 'gravity', type: 'gravityPoint', value: 1.5, drag: 4 },
  slow:     { name: '減速',     tree: 'time',    type: 'timeMult',    value: 0.5 },
  slow2:    { name: '強減速',   tree: 'time',    type: 'timeMult',    value: 0.2 },
  stop:     { name: '時停',     tree: 'time',    type: 'timeMult',    value: 0 },
  haste:    { name: '加速',     tree: 'time',    type: 'selfHaste',   value: 2, self: true },
  blink:    { name: '閃現',     tree: 'space',   type: 'blink' },
  portal:   { name: '傳送門',   tree: 'space',   type: 'portal' },
  grab:     { name: '重力抓取', tree: 'gravity', type: 'grab' },
  magnet:   { name: '磁力',     tree: 'gravity', type: 'magnet', value: 2, radius: 64, drag: 3 },
  rewind:   { name: '時間倒轉', tree: 'time',    type: 'rewind' },
};

// 會展開場域的技能（可以附著）
const FIELD_TYPES = new Set(['gravityMult', 'gravityDir', 'gravityPoint', 'timeMult', 'magnet']);
export function isFieldSkill(skill) {
  return FIELD_TYPES.has(skill.type);
}

// 除錯用：數字鍵 1～9、0、-、=、、; 依序對應的技能
export const SKILL_ORDER = ['lowG', 'zeroG', 'reverseG', 'dirG', 'pointG', 'slow', 'slow2', 'stop', 'haste', 'blink', 'portal', 'grab', 'magnet', 'rewind'];
export const DEBUG_KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0', 'Minus', 'Equal', 'Backslash', 'Semicolon'];
// 按鍵代碼在畫面上顯示的文字
export function keyLabel(code) {
  return { Minus: '-', Equal: '=', Backslash: '\\', Semicolon: ';' }[code] ?? code.replace('Digit', '');
}

export const DEFAULT_LOADOUT = ['lowG', 'reverseG', 'stop', 'portal', 'blink'];

export const TREE_COLORS = {
  gravity: '#a070ff',
  time: '#4aa8ff',
  space: '#3ddc84',
};
