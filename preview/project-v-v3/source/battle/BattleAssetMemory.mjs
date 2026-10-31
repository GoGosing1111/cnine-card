import {Assets} from 'pixi.js';

// These are per-battle bodies, cut-ins and authored motion banks. Shared role,
// HUD and ballistic atlases keep their own persistent frame caches; do not
// invalidate them, or another consumer's territory/raid effects, here.
export function isBattleOwnedImage(value){
  let path;try{path=new URL(String(value), 'https://battle.invalid').pathname;}catch{return false;}
  return /\.(?:png|webp|avif|jpe?g)$/i.test(path)&&(
    /^\/assets\/(?:responsive\/|cards\/|ui\/project-v\/(?:characters|mercenaries|monsters)\/)/.test(path)||
    /^\/preview\/(?:mercenary-(?!role-attacks)[^/]+|prime-requiem-[^/]+|battle-suit-(?:x-v1|x-dragon-v1|sx-v1|overlord[^/]*|skill-chip-v1|octaseeker-v1)|sustained-hunt-v2|scrapyard-v3-v1)\//.test(path)
  );
}

// Assets.load is the single public loader used by the authored FX modules.
// Observe only owned image URLs, not Pixi's private caches or JSON/atlas aliases.
// Waiting for warm-up work and all loads before unload prevents a late download
// from repopulating the retired scene, or an old release destroying battle two.
export function createBattleAssetMemory(assets){
  const paths=new Set(),pending=new Set(),load=assets.load.bind(assets),unload=assets.unload.bind(assets);
  let releasing=null;
  assets.load=function(input,...args){
    for(const item of Array.isArray(input)?input:[input]){
      const url=typeof item==='string'?item:item?.src;
      if(isBattleOwnedImage(url))paths.add(url);
    }
    const result=load(input,...args);
    pending.add(result);
    void Promise.resolve(result).then(()=>pending.delete(result),()=>pending.delete(result));
    return result;
  };
  assets.unload=function(input,...args){
    for(const item of Array.isArray(input)?input:[input])paths.delete(typeof item==='string'?item:item?.src);
    return unload(input,...args);
  };
  return {
    remember(url){if(url)paths.add(url);},
    ready(){return releasing||Promise.resolve();},
    release(work=[]){
      if(releasing)return releasing;
      releasing=(async()=>{
        await Promise.allSettled(work);
        while(pending.size)await Promise.allSettled([...pending]);
        const retired=[...paths];paths.clear();
        await Promise.allSettled(retired.filter(url=>!assets.cache||assets.cache.has(url)).map(url=>assets.unload(url)));
        return retired.length;
      })().finally(()=>{releasing=null;});
      return releasing;
    },
    diagnostics(){return {ownedImages:paths.size,pendingLoads:pending.size,releasing:!!releasing};}
  };
}
export const battleAssetMemory=createBattleAssetMemory(Assets);

export function battleWarmupWork(engine){
  const work=[];
  for(const [key,value] of Object.entries(engine||{})){
    if(/Loads$/.test(key)&&value instanceof Map)work.push(...value.values());
    else if(/ReadyPromise$/.test(key)&&value?.then)work.push(value);
  }
  return work;
}

// Standalone Legion frames load the responsive maps without app.js. Resolve
// them here too, after the adapters choose the authoritative SD/original art.
export function battleImageUrl(value,{cutIn=false}={}){
  const raw=String(value||'');if(!raw||/^(?:data:|blob:|https?:)/i.test(raw))return raw;
  const key=raw.replaceAll('\\','/').replace(/^\/+/, '').split('?',1)[0];
  const sprite=globalThis.CNineResponsiveBattleSprites?.[key];
  if(sprite)return sprite;
  const card=globalThis.CNineResponsiveCardImages?.[key];
  if(card)return `${card}-384.webp`;
  try{return globalThis.cnineBattleSpriteUrl?.(raw,cutIn?384:undefined)||raw;}catch{return raw;}
}
