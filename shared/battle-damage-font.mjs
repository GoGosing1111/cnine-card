// Self-host the approved face: battle entry must not depend on a font CDN.
export const DAMAGE_FONT_NAME='Russo One';
export const DAMAGE_FONT_FAMILY='Russo One, Arial, sans-serif';
export const DAMAGE_FONT_URL='/assets/fonts/battle/RussoOne-Regular.ttf';
const FALLBACK='Arial Black, Arial';
const fontStates=new WeakMap();

export function damageFontFamily(){
  const fonts=globalThis.document?.fonts;
  return !fonts||fontStates.get(fonts)?.ready?DAMAGE_FONT_FAMILY:FALLBACK;
}

export function ensureDamageFont({timeoutMs=1500}={}){
  const fonts=globalThis.document?.fonts;
  if(!fonts||typeof globalThis.FontFace!=='function')return Promise.resolve(false);
  const cached=fontStates.get(fonts);
  if(cached)return cached.ready?Promise.resolve(true):cached.wait;
  const state={ready:false,wait:null};
  fontStates.set(fonts,state);
  try{
    const face=Array.from(fonts).find(font=>font.family.replace(/["']/g,'')===DAMAGE_FONT_NAME&&String(font.weight)==='400')
      ||new FontFace(DAMAGE_FONT_NAME,`url("${DAMAGE_FONT_URL}")`,{style:'normal',weight:'400',display:'swap'});
    const loading=face.load().then(loaded=>{fonts.add(loaded);state.ready=true;return true;}).catch(()=>{fontStates.delete(fonts);return false;});
    state.wait=new Promise(resolve=>{
      const timer=setTimeout(()=>resolve(false),timeoutMs);
      loading.then(ready=>{clearTimeout(timer);resolve(ready);});
    });
    // A late font is adopted on the next hit. Until then use a distinct fallback
    // family so Pixi cannot cache Arial glyphs under Russo One's bitmap key.
    return state.wait;
  }catch{fontStates.delete(fonts);return Promise.resolve(false);}
}
