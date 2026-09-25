// The compact board has its own content bounds, not a 1050x1500 empty scene.
// Uniform fitting preserves the relationship between sprite size and spacing.
import {FORMATION_LATTICES, latticeStation} from './FormationLayout.mjs';
export const COMPACT_BOARD = FORMATION_LATTICES.compact;
// Match the common V3 mobile boundary across every consumer.
export function usesCompactViewport(width) {return width <= 760;}
export function compactStation(kind, index, team, scenario = 'PVE') {
  if (!['PVE', 'PVP'].includes(scenario)) throw new Error('INVALID_GRID_SCENARIO');
  return latticeStation(kind, index, team, 'compact');
}
export function preferredFrameHeight({width, header = 60, dock = 120, notice = 36}) {
  if (!usesCompactViewport(width)) return null;
  const scale = Math.max(1, width - 24) / COMPACT_BOARD.width;
  return Math.ceil(header + notice + COMPACT_BOARD.height * scale + dock + 24);
}
export function fitCompactViewport({width, height, top = 36, bottom = 120,board=COMPACT_BOARD}) {
  const available = {left: 12, top: top + 8, width: Math.max(1, width - 24), height: Math.max(1, height - top - bottom - 24)};
  const scale = Math.min(available.width / board.width, available.height / board.height);
  return {scale, available,
    offsetX: (available.left + (available.width - board.width * scale) / 2) / scale,
    offsetY: (available.top + (available.height - board.height * scale) / 2) / scale,
    scene: {width: width / scale, height: height / scale},
    actorScale: board.actorScale};
}
