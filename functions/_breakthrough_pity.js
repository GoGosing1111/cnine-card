export const ZENITH_BREAKTHROUGH_PITY_THRESHOLD=7;

export function breakthroughPityRule(grade,level,pity={}){
  const normalized=String(grade||'').trim().toUpperCase();
  if(normalized==='ZENITH')return {enabled:true,grade:'ZENITH',threshold:ZENITH_BREAKTHROUGH_PITY_THRESHOLD};
  if(normalized==='SSR'&&pity.enabled)return {enabled:true,grade:'SSR',threshold:Math.max(1,Number(pity.thresholds?.[level]||5))};
  return {enabled:false,grade:normalized,threshold:null};
}
