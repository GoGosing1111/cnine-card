// 2026-09-13: explicit user ON instruction for cow room, scrapyard and the existing tower.
// Tower re-ascent and its draft economy remain deferred.
export const COW_ROOM_PUBLIC_RELEASE_ENABLED = false;
export const SCRAPYARD_PUBLIC_RELEASE_ENABLED = true;
export const TOWER_LIVE_POLICY = 'LEGACY';
export const TOWER_LIVE_URL = '/?screen=battle&pve=tower';
export function isPvePublicPath(path){return path==='escort/v3/operation'||COW_ROOM_PUBLIC_RELEASE_ENABLED&&String(path).startsWith('cow-room/v3/')||SCRAPYARD_PUBLIC_RELEASE_ENABLED&&String(path).startsWith('scrapyard/v3/');}
export function pvePublicContentState(){return {
  TOWER:{enabled:true,policy:TOWER_LIVE_POLICY,reAscentEnabled:false,url:TOWER_LIVE_URL,combat:'V3_CONTINUOUS_2094'},
  COW_ROOM:{enabled:false,policy:'RETIRED',url:'/?screen=battle'},
  SCRAPYARD:{enabled:SCRAPYARD_PUBLIC_RELEASE_ENABLED,policy:'CMS',url:'/?screen=scrapyard',combat:'V3_CONTINUOUS_2094'}
};}
