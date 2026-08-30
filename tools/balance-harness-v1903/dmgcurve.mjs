// hitResult 를 직접 재현해 공격력 -> 실제 피해 곡선을 본다
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function dmg(atk,def,maxHp,{pen=0.244,capPct=0.60,defK=0.9,defCap=0.65,mode='POWER'}={}){
  const eff=def*(1-pen);
  const red = mode==='POWER' ? clamp(eff/(eff+atk*defK),0,defCap) : clamp(eff/(eff+600),0,defCap);
  const raw = atk*1.72;
  return {d:Math.min(raw*(1-red), maxHp*capPct), red};
}
const HP=228800, DEF=46750;
console.log('=== 상대 방어 46,750 / 최대HP 228,800 일 때 ===');
console.log('공격력      현행공식 피해   감소율   상한걸림   공격력배수 대비 피해배수');
const base=dmg(48510,DEF,HP).d;
for(const a of [48510,64000,80850,110000,160000,240000]){
  const r=dmg(a,DEF,HP);
  const capped=r.d>=HP*0.60-1;
  console.log(`${a.toLocaleString().padStart(9)}   ${Math.round(r.d).toLocaleString().padStart(10)}   ${(r.red*100).toFixed(0).padStart(4)}%   ${capped?'  걸림':'     -'}      x${(a/48510).toFixed(2)} → x${(r.d/base).toFixed(2)}`);
}
console.log('\n※ 공격력을 5배(24만) 올려도 피해는 상한(최대HP 60%)에 막혀 2.1배에서 멈춘다.');
console.log('\n=== 상한을 없애면 ===');
console.log('공격력      피해          감소율    공격력배수 대비 피해배수');
const base2=dmg(48510,DEF,HP,{capPct:99}).d;
for(const a of [48510,80850,160000,240000]){
  const r=dmg(a,DEF,HP,{capPct:99});
  console.log(`${a.toLocaleString().padStart(9)}   ${Math.round(r.d).toLocaleString().padStart(10)}   ${(r.red*100).toFixed(0).padStart(4)}%      x${(a/48510).toFixed(2)} → x${(r.d/base2).toFixed(2)}`);
}
console.log('\n=== 감소율 상한(defCap)을 낮추면 ===');
for(const cap of [0.65,0.45,0.30]){
  const b=dmg(48510,DEF,HP,{defCap:cap}).d, h=dmg(80850,DEF,HP,{defCap:cap}).d;
  console.log(`  defCap ${(cap*100).toFixed(0)}%:  공격 4.8만 → ${Math.round(b).toLocaleString()},  8.1만 → ${Math.round(h).toLocaleString()}   (x1.67 → x${(h/b).toFixed(2)})`);
}
