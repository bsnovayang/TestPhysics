// 技能定義
// type：
//   gravityMult  重力倍率（相乘）
//   gravityDir   定向重力（向量相加，方向＝施放方向）
//   gravityPoint 點重力（向量相加，指向場域中心）
//   timeMult     時間倍率（相乘）
//   selfHaste    自身加速（不發射網）
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
};

// 除錯用：數字鍵 1～9 對應的技能
export const SKILL_ORDER = ['lowG', 'zeroG', 'reverseG', 'dirG', 'pointG', 'slow', 'slow2', 'stop', 'haste'];

export const DEFAULT_LOADOUT = ['lowG', 'reverseG', 'zeroG', 'stop', 'slow'];

export const TREE_COLORS = {
  gravity: '#a070ff',
  time: '#4aa8ff',
  space: '#3ddc84',
};
