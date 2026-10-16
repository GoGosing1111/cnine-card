import {Assets, Container, Sprite, Texture} from 'pixi.js';
import {BATTLE_GROUND_ASSETS, battleGroundStyle, battleGroundSignature} from './BattleGroundStyle.mjs';

const textures = new Map();
let pending;
export function preloadBattleGroundSigils() {
  // Layout tests create real Pixi containers without a browser or network.
  if (typeof window === 'undefined') return Promise.resolve();
  return pending ||= Promise.all(Object.entries(BATTLE_GROUND_ASSETS).map(async ([key, url]) => {
    try {textures.set(key, await Assets.load(url));}
    catch (error) {console.warn('[battle] ground rune load failed', key, error);}
  }));
}

export function createBattleGroundSigil({actor, kind = 'cards', team = actor?.team, width = 190, height = 64} = {}) {
  const style = battleGroundStyle(actor, kind, team), faction = team === 'ENEMY' || team === 'B' ? 'enemy' : 'ally';
  const special = style !== 'ally' && style !== 'enemy';
  const root = new Container({label: `BattleGround:${style}`});
  root.groundStyle = style; root.groundAsset = BATTLE_GROUND_ASSETS[style];
  const layers = [];
  const add = (key, factor, alpha) => {
    const sprite = new Sprite(textures.get(key) || Texture.EMPTY);
    sprite.anchor.set(.5); sprite.alpha = alpha;
    sprite.label = `RuneImage:${key}`;
    root.addChild(sprite); layers.push({sprite, key, factor});
  };
  // A faint authored faction ring remains visible around every golden seal.
  if (special) add(faction, 1.12, .56);
  add(style, 1, special ? .84 : .72);
  const apply = () => {
    if (root.destroyed) return;
    for (const {sprite, key, factor} of layers) {
      sprite.texture = textures.get(key) || Texture.EMPTY;
      sprite.width = width * factor; sprite.height = height * factor;
    }
  };
  apply(); void preloadBattleGroundSigils().then(apply);
  root.eventMode = 'none';
  return root;
}

export function drawBattleGroundStations(engine, stations) {
  if (!engine.isoFloorLayer || !engine.isoConfig) return;
  // Texture ownership belongs to Pixi's shared Assets cache, never a station.
  engine.isoFloorLayer.removeChildren().forEach(child => child.destroy({children: true}));
  engine.isoTiles = []; engine.accountBattleUnitTile = null;
  const {tileWidth, tileHeight} = engine.isoConfig;
  for (const station of stations) {
    const tile = createBattleGroundSigil({...station, width: tileWidth, height: tileHeight});
    tile.label = `OccupiedTile:${station.id}`;
    tile.station = station; tile.position.set(station.x, station.y); tile.depthSortY = -100000;
    if (station.actor?.stateHalo) station.actor.stateHalo.visible = false;
    if (station.kind === 'support') {tile.isAccountBattleUnitTile = true; engine.accountBattleUnitTile = tile;}
    engine.isoFloorLayer.addChild(tile); engine.isoTiles.push(tile);
  }
  engine.occupiedTileSignature = battleGroundSignature(stations);
  engine.syncAccountBattleUnitTile();
}
