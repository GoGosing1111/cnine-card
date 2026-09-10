import {Assets, Container, Graphics, Sprite, Text} from 'pixi.js';
import {stationPoint} from './grid-layout.mjs';

// Placement specimens share the existing V3 combat layer and depth sort.
// They never join characters/allies/enemies, target selection or the card dock.
export async function createMercenaryStations(engine, roster) {
  const stations = [];
  await Promise.all(Object.values(roster || {}).flat().map(art => Assets.load(art.spriteUrl)));
  for (const team of ['ALLY', 'ENEMY']) for (const [index, art] of (roster?.[team] || []).entries()) {
    const texture = Assets.get(art.spriteUrl);
    engine.rememberPendingLiveAsset(art.spriteUrl, texture);
    const root = new Container({label: `PreviewMercenary:${team}:${art.code}`});
    const sprite = new Sprite(texture);
    sprite.anchor.set(art.footAnchor.x, art.footAnchor.y);
    sprite.scale.set(350 / texture.height);
    if (team === 'ENEMY') sprite.scale.x *= -1;
    const label = new Text({text: `${art.name} · 용병`,
      style: {fontFamily: 'Pretendard, Malgun Gothic, sans-serif', fontSize: 22, fontWeight: '700', fill: 0xf0e0ff}});
    label.anchor.set(.5);
    label.y = -340;
    const plate = new Graphics().roundRect(-142, -361, 284, 42, 6)
      .fill({color: 0x120d22, alpha: .94}).stroke({color: 0xc4a0f5, alpha: .55, width: 1});
    root.addChild(sprite, plate, label);
    engine.combatLayer.addChild(root);
    stations.push({team, index, art, root, sprite});
  }
  return stations;
}
export function layoutMercenaryStations(engine) {
  for (const item of engine.previewMercenaries || []) {
    const point = stationPoint('mercenaries', item.index, item.team, engine.mobile);
    item.root.position.set(point.x, point.y);
    item.root.depthSortY = point.y;
    item.root.scale.set(engine.mobile ? .43 : .51);
    item.root.visible = engine.gridMode === 'wide' && item.index < engine.mercenaryCounts[item.team];
  }
}
