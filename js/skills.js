// 技能定義
// type：
//   gravityMult  重力倍率（相乘）
//   gravityDir   定向重力（向量相加，方向＝施放方向）
//   gravityPoint 點重力（向量相加，指向場域中心）
//   timeMult     時間倍率（相乘）
//   selfHaste    自身加速（不發射網）
//   grab         重力抓取：按住抓起游標下的物體，移動游標搬運，放開時保留速度（丟出去）
//   magnet       磁力場域：只吸引金屬物體（鐵塊、重裝兵、重壓兵），疊加在原本的重力上
//   reflectField 反射場：場域的邊界是一面會反彈的牆——外面的東西進不來、裡面的東西出不去（物體、子彈、雷射、水、蒸氣、熔岩）
//   wind         風場：把範圍內的東西吹向風向（LOL 式施放決定方向）。越輕的越容易被吹動、最多吹到和風一樣快、
//                被牆擋住的地方是避風處；疊加在原本的重力上（不改變地面方向）；也會吹動蒸氣
//   heat / cool  溫度場：範圍內加熱或冷卻（和火爐、冷凍裝置同一套規則：煮水、融冰、結冰、熔岩凝固、蒸氣凝結；冷卻讓敵人凍僵變慢）
//   railgun      電磁加速：把身邊的金屬物體朝游標方向高速射出（有冷卻）
//   charm        洗腦：網打中敵人，它變成自己人（攻擊敵人、不攻擊玩家）；打中地面時命令自己人走過去待命
//   possess      附身：網打中敵人就附身，直接操控它（本體被時間凍結：無敵、敵人不會瞄準它）；再按一次或 Esc 回到本體
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
  reflect:  { name: '反射場',   tree: 'vector',  type: 'reflectField' },
  heat:     { name: '加熱',     tree: 'thermal', type: 'heat', color: '#ff7a45', radius: 48 },
  wind:     { name: '風場',     tree: 'air',     type: 'wind', radius: 48 },
  cool:     { name: '冷卻',     tree: 'thermal', type: 'cool', color: '#7fd8ff', radius: 48 }, // 溫度要影響一片水面或熔岩，範圍比一般場域大
  railgun:  { name: '電磁加速', tree: 'gravity', type: 'railgun' },
  // 洗腦、附身：和其他系統沒有組合（單一用途），先移到「之後再考慮」——程式保留，但不放進技能選單
  charm:    { name: '洗腦',     tree: 'mind',    type: 'charm', shelved: true },
  possess:  { name: '附身',     tree: 'mind',    type: 'possess', shelved: true },
};

// 會展開場域的技能（可以附著）
const FIELD_TYPES = new Set(['gravityMult', 'gravityDir', 'gravityPoint', 'timeMult', 'magnet', 'reflectField', 'heat', 'cool', 'wind']);
export function isFieldSkill(skill) {
  return FIELD_TYPES.has(skill.type);
}

// 除錯用：數字鍵 1～9、0、-、=、、; 依序對應的技能
export const SKILL_ORDER = ['lowG', 'zeroG', 'reverseG', 'dirG', 'pointG', 'slow', 'slow2', 'stop', 'haste', 'blink', 'portal', 'grab', 'magnet', 'rewind', 'reflect', 'railgun', 'charm', 'possess', 'heat', 'cool', 'wind'];
export const DEBUG_KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0', 'Minus', 'Equal', 'Backslash', 'Semicolon', 'Quote', 'Comma', 'Period', 'Backquote', 'KeyY', 'KeyU', 'KeyO'];
// 按鍵代碼在畫面上顯示的文字
export function keyLabel(code) {
  return { Minus: '-', Equal: '=', Backslash: '\\', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Backquote: '`', KeyY: 'Y', KeyU: 'U', KeyO: 'O' }[code] ?? code.replace('Digit', '');
}

export const DEFAULT_LOADOUT = ['lowG', 'reverseG', 'stop', 'portal', 'blink'];

export const TREE_COLORS = {
  gravity: '#a070ff',
  time: '#4aa8ff',
  space: '#3ddc84',
  vector: '#ffb347', // 向量系（反射場）
  air: '#8ff0c8',    // 氣流系（風場）
  thermal: '#ff9a5a', // 溫度系（加熱、冷卻；畫面上各用自己的顏色）
  mind: '#ff7ad9',   // 精神系（洗腦）
};
