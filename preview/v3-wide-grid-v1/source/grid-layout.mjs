// Preview stations are independent of the five-card save/API contract.
export const GRID = Object.freeze({original: {columns: 7, rows: 6}, wide: {kind: 'OCCUPIED_STATIONS', mercenariesPerTeam: 1}});
export const FORMATIONS = Object.freeze({
  allies: [[0, 1], [2, 1], [0, 3], [2, 3], [0, 5]],
  enemies: [[6, 0], [6, 2], [4, 2], [4, 0], [4, 4]],
  support: [2, 5]
});
// Authored positions, with no rectangular envelope or empty filler rows.
const DESKTOP = {width: 1600, cards: [[280, 260], [695, 280], [125, 425], [655, 520], [300, 575]],
  mercenaries: [[495, 250]], support: [410, 425]};
const MOBILE = {width: 1050, cards: [[248, 641], [439, 736], [178, 816], [435, 994], [205, 1059]],
  mercenaries: [[330, 550]], support: [311, 869]};
export function configuration(mobile = false, mode = 'wide') {
  const original = mobile
    ? {originX: 525, originY: 414, tileWidth: 132, tileHeight: 68, farY: 470, nearY: 720, minScale: .84, maxScale: 1.1}
    : {originX: 800, originY: 292, tileWidth: 190, tileHeight: 90, farY: 405, nearY: 650, minScale: .82, maxScale: 1.08};
  return mode === 'original' ? original : {...original, tileWidth: mobile ? 120 : 190, tileHeight: mobile ? 68 : 78};
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
  const layout = mobile ? MOBILE : DESKTOP;
  const point = kind === 'support' ? layout.support : layout[kind]?.[index];
  if (!point) throw new Error('INVALID_PREVIEW_STATION');
  return {x: team === 'ENEMY' ? layout.width - point[0] : point[0], y: point[1]};
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
