// Preview-only projection. Never changes the server's five-card formation.
export const GRID = Object.freeze({original: {columns: 7, rows: 6}, wide: {columns: 9, rows: 7}});
export const FORMATIONS = Object.freeze({
  allies: [[0, 1], [2, 1], [0, 3], [2, 3], [0, 5]],
  enemies: [[6, 0], [6, 2], [4, 2], [4, 0], [4, 4]],
  support: [2, 5]
});
export function configuration(mobile = false, mode = 'wide') {
  const original = mobile
    ? {originX: 525, originY: 414, tileWidth: 132, tileHeight: 68, farY: 470, nearY: 720, minScale: .84, maxScale: 1.1}
    : {originX: 800, originY: 292, tileWidth: 190, tileHeight: 90, farY: 405, nearY: 650, minScale: .82, maxScale: 1.08};
  if (mode === 'original') return original;
  return {...original, ...(mobile
    ? {originX: 462, originY: 510, tileWidth: 126, tileHeight: 76}
    : {originX: 705, originY: 90, tileWidth: 190, tileHeight: 80})};
}
export function project(config, x, y) {
  return {x: config.originX + (x - y) * config.tileWidth / 2,
    y: config.originY + (x + y) * config.tileHeight / 2};
}
export function formationPoint(x, y, team, mode = 'wide') {
  return mode === 'original' ? {x, y} : {x: x + (team === 'ENEMY' ? 2 : 0), y: y + 1};
}
export function depthAt(config, y) {
  return Math.max(0, Math.min(1, (y - config.farY) / (config.nearY - config.farY)));
}
export function scaleAt(config, baseScale, y) {
  return baseScale * (config.minScale + (config.maxScale - config.minScale) * depthAt(config, y));
}
export function bounds(mobile = false, mode = 'wide') {
  const c = configuration(mobile, mode), {columns, rows} = GRID[mode];
  const left = project(c, 0, rows - 1).x - c.tileWidth / 2;
  const right = project(c, columns - 1, 0).x + c.tileWidth / 2;
  const top = c.originY - c.tileHeight / 2;
  const bottom = project(c, columns - 1, rows - 1).y + c.tileHeight / 2;
  return {left, right, top, bottom, width: right - left, height: bottom - top};
}
