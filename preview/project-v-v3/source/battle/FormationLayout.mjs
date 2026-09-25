// Common presentation stations are independent of the five-card save/API contract.
export const GRID = Object.freeze({original: {columns: 7, rows: 6}, wide: {kind: 'OCCUPIED_STATIONS', mercenariesPerTeam: 1}});
export const FORMATIONS = Object.freeze({
  allies: [[0, 1], [2, 1], [0, 3], [2, 3], [0, 5]],
  enemies: [[6, 0], [6, 2], [4, 2], [4, 0], [4, 4]],
  support: [2, 5]
});
// Every station is an integer cell on one shared lattice. Content may change
// occupancy, never pitch, team separation or individual station coordinates.
// Portrait reflows the same seven roles into two columns to keep SDs readable.
export const FORMATION_LAYOUT_VERSION = 'UNIFORM_LATTICE_V2';
// Duo owns four five-card squads. Only this payload opts into the larger board;
// every existing PVE/PVP station stays unchanged.
export const DUO_BOARDS = Object.freeze({
 desktop: Object.freeze({width:1800,height:970,left:100,top:260,columnPitch:200,rowPitch:260,columns:9,actorScale:.5}),
 compact: Object.freeze({width:1200,height:1690,left:120,top:260,columnPitch:240,rowPitch:260,columns:5,actorScale:.64})
});
export function duoStation(kind,index,team,compact=false){
 const b=DUO_BOARDS[compact?'compact':'desktop'],merc=kind==='mercenaries';
 if(!['ALLY','ENEMY'].includes(team)||!['cards','mercenaries'].includes(kind)||!Number.isInteger(index)||index<0||index>=(merc?2:10))throw new Error('INVALID_DUO_STATION');
 const owner=merc?index:Math.floor(index/5),local=merc?5:index%5;
 const cells=[[0,0],[1,0],[0,1],[1,1],[0,2],[1,2]];
 const [col,row]=cells[local],ownColumn=col+(compact?0:owner*2),column=team==='ENEMY'?b.columns-1-ownColumn:ownColumn;
 return {x:b.left+column*b.columnPitch,y:b.top+(row+(compact?owner*3:0))*b.rowPitch};
}
export const FORMATION_LATTICES = Object.freeze({
  desktop: Object.freeze({width: 1600, height: 820, columns: 7, left: 170, top: 240,
    columnPitch: 210, rowPitch: 176, tileWidth: 190, tileHeight: 64, actorScale: 1}),
  compact: Object.freeze({width: 1080, height: 1240, columns: 5, left: 108, top: 280,
    columnPitch: 216, rowPitch: 300, tileWidth: 190, tileHeight: 64, actorScale: 1.3})
});
const CELLS = {
  desktop: {squad: [[1,1],[0,0],[2,0],[0,1],[2,1],[1,2],[1,0]], cards: [[0, 0], [2, 0], [0, 1], [2, 1], [1, 2]], mercenaries: [[1, 0]], support: [[1, 1]], boss: [[4, 1]], objective: [[3, 2]]},
  compact: {squad: [[1,1],[0,0],[0,1],[0,2],[1,2],[0,3],[1,0]], cards: [[0, 0], [0, 1], [0, 2], [1, 2], [0, 3]], mercenaries: [[1, 0]], support: [[1, 1]], boss: [[3, 1]], objective: [[2, 2]]}
};
export function latticeStation(kind, index = 0, team = 'ALLY', profile = 'desktop') {
  const layout = FORMATION_LATTICES[profile], cell = CELLS[profile]?.[kind]?.[index];
  if (!layout || !cell || !['ALLY', 'ENEMY'].includes(team)) throw new Error('INVALID_FORMATION_STATION');
  const column = team === 'ENEMY' && !['objective', 'boss'].includes(kind) ? layout.columns - 1 - cell[0] : cell[0];
  return {x: layout.left + column * layout.columnPitch, y: layout.top + cell[1] * layout.rowPitch};
}
export function formationActorScale(compact = false, mobile = false) {
  return .5 * (compact ? FORMATION_LATTICES.compact.actorScale : mobile ? 1050 / FORMATION_LATTICES.compact.width : 1);
}
export function configuration(mobile = false, mode = 'wide') {
  const original = mobile
    ? {originX: 525, originY: 414, tileWidth: 132, tileHeight: 68, farY: 470, nearY: 720, minScale: .84, maxScale: 1.1}
    : {originX: 800, originY: 292, tileWidth: 190, tileHeight: 90, farY: 405, nearY: 650, minScale: .82, maxScale: 1.08};
  const factor = mobile ? 1050 / FORMATION_LATTICES.compact.width : 1;
  return mode === 'original' ? original : {...original, tileWidth: 190 * factor, tileHeight: 64 * factor, minScale: 1, maxScale: 1};
}
export function project(config, x, y) {
  return {x: config.originX + (x - y) * config.tileWidth / 2,
    y: config.originY + (x + y) * config.tileHeight / 2};
}
export function unproject(config, x, y) {
  const dx = (x - config.originX) / (config.tileWidth / 2), dy = (y - config.originY) / (config.tileHeight / 2);
  return {x: (dx + dy) / 2, y: (dy - dx) / 2};
}
export function stationPoint(kind, index = 0, team = 'ALLY', mobile = false) {
  const point = latticeStation(kind, index, team, mobile ? 'compact' : 'desktop');
  const factor = mobile ? 1050 / FORMATION_LATTICES.compact.width : 1;
  return {x: point.x * factor, y: point.y * factor};
}
export function formationPoint(x, y, team, mode = 'wide', mobile = false) {
  if (mode === 'original') return {x, y};
  const rows = team === 'ENEMY' ? FORMATIONS.enemies : FORMATIONS.allies;
  const index = rows.findIndex(p => p[0] === x && p[1] === y);
  const support = team === 'ALLY' && x === FORMATIONS.support[0] && y === FORMATIONS.support[1];
  if (index < 0 && !support) throw new Error('UNKNOWN_CANONICAL_FORMATION');
  const p = stationPoint(support ? 'support' : 'cards', index, team, mobile);
  return unproject(configuration(mobile), p.x, p.y);
}
export function mercenaryCount(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number > 1) throw new Error('INVALID_MERCENARY_COUNT');
  return number;
}
export function occupiedStations({mobile = false, scenario = 'PVP', allySlots = [0, 1, 2, 3, 4],
  enemySlots = [0, 1, 2, 3, 4], allyMercenaries = 1, enemyMercenaries = 1, support = true} = {}) {
  if (!['PVP', 'PVE'].includes(scenario)) throw new Error('INVALID_GRID_SCENARIO');
  const rows = [];
  const add = (kind, index, team) => rows.push({id: `${team}:${kind}:${index}`, kind, index, team,
    ...stationPoint(kind, index, team, mobile)});
  for (const [team, slots] of [['ALLY', allySlots], ['ENEMY', enemySlots]]) {
    for (const index of slots) add('cards', index, team);
    const count = team === 'ALLY' ? mercenaryCount(allyMercenaries) : scenario === 'PVP' ? mercenaryCount(enemyMercenaries) : 0;
    for (let i = 0; i < count; i++) add('mercenaries', i, team);
  }
  if (scenario === 'PVE' && support) add('support', 0, 'ALLY');
  return rows;
}
export function depthAt(config, y) {
  return Math.max(0, Math.min(1, (y - config.farY) / (config.nearY - config.farY)));
}
export function scaleAt(config, baseScale, y) {
  return baseScale * (config.minScale + (config.maxScale - config.minScale) * depthAt(config, y));
}
export function bounds(mobile = false, mode = 'wide', options = {}) {
  const c = configuration(mobile, mode);
  const points = mode === 'original'
    ? [project(c, 0, 0), project(c, 6, 0), project(c, 0, 5), project(c, 6, 5)]
    : occupiedStations({...options, mobile});
  if (!points.length) return {left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0};
  const left = Math.min(...points.map(p => p.x)) - c.tileWidth / 2;
  const right = Math.max(...points.map(p => p.x)) + c.tileWidth / 2;
  const top = Math.min(...points.map(p => p.y)) - c.tileHeight / 2;
  const bottom = Math.max(...points.map(p => p.y)) + c.tileHeight / 2;
  return {left, right, top, bottom, width: right - left, height: bottom - top};
}
