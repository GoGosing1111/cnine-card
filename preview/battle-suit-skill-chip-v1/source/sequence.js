// Pure, deterministic visual timings. No server damage, cooldown or inventory state.
export const SEQUENCES=Object.freeze({
  airstrike:Object.freeze({key:'airstrike',duration:3.6,release:.12,flightEnd:1.35,impacts:Object.freeze([.61,.83,1.05,1.27]),life:2.22,label:'헬기 폭격'}),
  missile:Object.freeze({key:'missile',duration:2.25,release:.12,flightEnd:.36,impacts:Object.freeze([.36]),life:1.84,label:'고폭탄'})
});
export const clamp=(value,min=0,max=1)=>Math.max(min,Math.min(max,Number(value)||0));
export const mix=(a,b,t)=>a+(b-a)*t;
export const smooth=t=>{t=clamp(t);return t*t*(3-2*t)};
export function explosionFrame(age,life){
  if(age<0||age>=life)return null;
  // Fast ignition, rolling fire, then a longer smoke/tail. Adjacent frames crossfade.
  const keys=[[0,0],[.045,2],[.14,5],[.34,9],[.65,15],[1,23]];
  const p=clamp(age/life);let index=0;
  for(let i=1;i<keys.length;i++)if(p<=keys[i][0]){const [a,av]=keys[i-1],[b,bv]=keys[i];index=mix(av,bv,(p-a)/(b-a));break;}
  return {index:Math.floor(index),next:Math.min(23,Math.floor(index)+1),blend:index%1,alpha:1-smooth((p-.72)/.28)};
}
export function cueAt(key,time){
  const seq=SEQUENCES[key];const hits=seq.impacts.filter(at=>time>=at).length;
  if(time<=0)return '준비 · 재생하면 연출이 시작됩니다';
  if(time>=seq.duration)return '재생 완료 · 다시 보거나 타임라인을 움직여 검수하세요';
  if(hits)return `${hits}/${seq.impacts.length} 충돌 · ${time<seq.impacts.at(-1)+.6?'화염·파편':'잔불·연기 소멸'}`;
  return key==='airstrike'?'접근 · 헬기 그림자 통과':time<seq.release?'예고 · 발사 준비':'발사 · 탄체 비행';
}
