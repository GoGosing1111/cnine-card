// The compact board has its own content bounds, not a 1050x1500 empty scene.
// Uniform fitting preserves the relationship between sprite size and spacing.
export const COMPACT_BOARD = Object.freeze({width: 1020, height: 1060, actorScale: 1.3});
const CARD_STATIONS = {
  PVP: [[145, 295], [385, 625], [145, 625], [385, 945], [145, 945]],
  PVE: [[165, 320], [505, 500], [100, 600], [445, 910], [195, 940]]
};
// Match the common V3 mobile boundary; the approved desktop layout is untouched.
export function usesCompactViewport(width) {return width <= 760;}
export function compactStation(kind, index, team, scenario = 'PVE') {
  let point;
  if (kind === 'support') point = [245, 690];
  else if (kind === 'mercenaries') point = scenario === 'PVP' ? [385, 295] : [400, 275];
  else if (scenario === 'PVE' && team === 'ENEMY') point = [[795, 315], [790, 650], [825, 975], [820, 810], [805, 490]][index];
  else point = CARD_STATIONS[scenario]?.[index];
  if (!point || index < 0 || (kind !== 'cards' && index !== 0)) throw new Error('INVALID_COMPACT_STATION');
  return {x: team === 'ENEMY' && scenario === 'PVP' ? COMPACT_BOARD.width - point[0] : point[0], y: point[1]};
}
export function preferredFrameHeight({width, header = 60, dock = 120, notice = 36}) {
  if (!usesCompactViewport(width)) return null;
  const scale = Math.max(1, width - 24) / COMPACT_BOARD.width;
  return Math.ceil(header + notice + COMPACT_BOARD.height * scale + dock + 24);
}
export function fitCompactViewport({width, height, top = 36, bottom = 120}) {
  const available = {left: 12, top: top + 8, width: Math.max(1, width - 24), height: Math.max(1, height - top - bottom - 24)};
  const scale = Math.min(available.width / COMPACT_BOARD.width, available.height / COMPACT_BOARD.height);
  return {scale, available,
    offsetX: (available.left + (available.width - COMPACT_BOARD.width * scale) / 2) / scale,
    offsetY: (available.top + (available.height - COMPACT_BOARD.height * scale) / 2) / scale,
    scene: {width: width / scale, height: height / scale},
    actorScale: COMPACT_BOARD.actorScale};
}
