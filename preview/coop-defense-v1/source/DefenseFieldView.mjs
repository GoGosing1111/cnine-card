import {FORMATION_LATTICES, formationActorScale} from '../../project-v-v3/source/battle/FormationLayout.mjs';
import {fitCompactViewport, usesCompactViewport} from '../../project-v-v3/source/battle/ViewportLayout.mjs';
import {WORLD, laneY} from '../../../shared/monster-defense-field-v1.mjs';

// Place feet on the walkable apron below the skyline of the painted map.
export const fieldY = y => 410 + y * .62;

// The enemy paintings have transparent margins. Size their silhouettes independently of the V3 mercenary camera.
export const defenseMonsterHeight = art => Math.round((art?.height || 180) * (art?.kind === 'BOSS' ? 1.84 : 1.76));

function cameraCenter(value, extent, size, origin = 0) {
  if (size >= extent) return origin + extent / 2;
  return Math.max(origin + size / 2, Math.min(origin + extent - size / 2, value));
}

export function defenseFieldView(width, height, focus, capacity, focusX) {
  width = Math.max(1, width); height = Math.max(1, height);
  const compact = usesCompactViewport(width);
  const board = FORMATION_LATTICES.desktop;
  // The defense HUD already occupies separate rows outside this canvas.
  const v3Scale = compact ? fitCompactViewport({width, height, top: 0, bottom: 0}).scale :
    Math.min(width / board.width, height / board.height);
  const overview = Math.min(width / WORLD.width, height / WORLD.height);
  const scale = focus === null ? overview : Math.max(overview,
    Math.min(width / (compact ? 1080 : 1920), height / 760));
  const viewWidth = width / scale, viewHeight = height / scale;
  const x = cameraCenter(focus === null ? WORLD.width / 2 : focusX, WORLD.width, viewWidth);
  const targetY = focus === null ? WORLD.coreY - 65 : fieldY(laneY(focus, capacity)) - 70;
  const y = cameraCenter(targetY, WORLD.height + 240, viewHeight, -180);
  const left = x - viewWidth / 2, top = y - viewHeight / 2;
  const artWidth = Math.max(WORLD.width, viewWidth), artHeight = Math.max(WORLD.height + 240, viewHeight);
  return {x, y, left, top, scale, viewWidth, viewHeight, compact,
    actorScale: v3Scale * formationActorScale(compact, compact) / scale,
    art: { x: (WORLD.width - artWidth) / 2, y: WORLD.height / 2 - 60 - artHeight / 2, width: artWidth, height: artHeight }};
}
