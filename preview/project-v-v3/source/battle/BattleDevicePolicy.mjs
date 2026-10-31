export function battleDevicePolicy({userAgent='',platform='',maxTouchPoints=0,deviceMemory=0,coarse=false,narrow=false,pixelRatio=1}={}){
  const ios=/iPad|iPhone|iPod/i.test(userAgent)||/Mac/i.test(platform)&&maxTouchPoints>1;
  const lowMemory=ios||deviceMemory>0&&deviceMemory<=4||coarse||narrow;
  return Object.freeze({ios,lowMemory,resolution:Math.min(Math.max(1,Number(pixelRatio)||1),ios?1.25:lowMemory?1.5:2),imageConcurrency:lowMemory?3:8,maxFPS:ios?45:60});
}
const nav=globalThis.navigator||{};
const matches=query=>{try{return !!globalThis.matchMedia?.(query).matches;}catch{return false;}};
export const BATTLE_DEVICE=battleDevicePolicy({userAgent:nav.userAgent,platform:nav.platform,maxTouchPoints:nav.maxTouchPoints,deviceMemory:nav.deviceMemory,coarse:matches('(pointer:coarse)'),narrow:matches('(max-width:860px)'),pixelRatio:globalThis.devicePixelRatio});
