import fs from 'fs';
let s=fs.readFileSync('../../functions/_battle_v2_preview.js','utf8').replace(/\r\n/g,'\n');
const rep=(from,to)=>{if(!s.includes(from)){console.error('MISS: '+from.slice(0,70));process.exit(1)}s=s.split(from).join(to)};
// 1) 회피율
rep(`? clamp(0.10 + Math.max(0, uniquePercent(target.uniqueAbility, 'speedPercent')) / 1000, 0.10, 0.24)
    : 0.02;`,
`? clamp(__T.dodgeSpeedBase + Math.max(0, uniquePercent(target.uniqueAbility, 'speedPercent')) / 1000, __T.dodgeSpeedBase, __T.dodgeSpeedMax)
    : __T.dodgeOther;`);
// 2) 치명타
rep(`clamp(0.10 + (actor.type === 'ATTACK' ? 0.06 : 0) + (actor.type === 'SPEED' && !actor.speedUniqueSuppressed ? 0.03 : 0), 0.10, 0.25)`,
`clamp(__T.critBase + (actor.type === 'ATTACK' ? __T.critAttack : 0) + (actor.type === 'SPEED' && !actor.speedUniqueSuppressed ? __T.critSpeed : 0), __T.critBase, __T.critMax)`);
rep(`(critical ? 1.50 : 1)`,`(critical ? __T.critMult : 1)`);
// 3) 방어 감소 곡선
rep(`const reduction = clamp(effectiveDefense / (effectiveDefense + 600), 0, 0.65);`,
`const reduction = __T.defCurve==='POWER' ? clamp(effectiveDefense/(effectiveDefense+Math.max(1,actor.attack*__T.defK)),0,__T.defCap) : clamp(effectiveDefense / (effectiveDefense + 600), 0, __T.defCap);`);
// 4) 관통
rep(`: (random() < 0.35 ? 0.30 : 0.15))
    : 0.03;`,`: (random() < 0.35 ? 0.30 : 0.15))
    : __T.penOther;`);
// 5) STAT_PROFILES
rep(`const STAT_PROFILES = {`,`const STAT_PROFILES = (globalThis.__T && globalThis.__T.profiles) ? globalThis.__T.profiles : {`);
// 6) healer duplicate penalty (PVP/PVE 공통 테이블)
s=s.replace(/const __T_HDR__/g,'');
s='const __T = Object.assign({dodgeSpeedBase:0.10,dodgeSpeedMax:0.24,dodgeOther:0.02,critBase:0.10,critAttack:0.06,critSpeed:0.03,critMax:0.25,critMult:1.50,defCurve:"LEGACY",defK:0.9,defCap:0.65,penOther:0.03}, globalThis.__T||{});\n'+s;
fs.writeFileSync('tunable.mjs',s);
console.log('built tunable.mjs');
// --- V2 설계 검증용 추가 훅 ---
let t=fs.readFileSync('tunable.mjs','utf8');
const rep2=(from,to)=>{if(!t.includes(from)){console.error('MISS2: '+from.slice(0,60));process.exit(1)}t=t.split(from).join(to)};
// 힐러 중복 페널티 테이블
rep2(`const reductionPercent = healerCount >= 5 ? 90 : healerCount === 4 ? 85 : healerCount === 3 ? 75 : healerCount === 2 ? 60 : 0;`,
`const reductionPercent = (__T.healerPen||[0,0,60,75,85,90])[Math.min(5,healerCount)];`);
// 계열 순환 상성: 피해 배율
rep2(`const raw = actor.attack * 1.72`,
`const raw = actor.attack * (__T.matchup?(__T.matchup[actor.type]?.[target.type]??1):1) * 1.72`);
fs.writeFileSync('tunable.mjs',t);
console.log('hooks added');
// --- 생명형 진단용 훅 ---
let u=fs.readFileSync('tunable.mjs','utf8');
const rep3=(f,to)=>{if(!u.includes(f)){console.error('MISS3: '+f.slice(0,60));process.exit(1)}u=u.split(f).join(to)};
rep3(`maxActions: 83, suddenDeathAfter: 64,`,`maxActions: __T.pvpMaxActions??83, suddenDeathAfter: __T.suddenDeathAfter??64,`);
// 연장전에도 생명형 지속회복 일부 유지
rep3(`if (!suddenDeath && actor.type === 'HP' && actor.hp < actor.maxHp) {
      const amount = Math.min(actor.maxHp - actor.hp, Math.max(1, Math.round(actor.maxHp * 0.04 * healerRules[actor.side].multiplier)));`,
`if ((!suddenDeath || __T.regenInSuddenDeath > 0) && actor.type === 'HP' && actor.hp < actor.maxHp) {
      const sdScale = suddenDeath ? (__T.regenInSuddenDeath||0) : 1;
      const amount = Math.min(actor.maxHp - actor.hp, Math.max(1, Math.round(actor.maxHp * (__T.regenPercent??0.04) * sdScale * healerRules[actor.side].multiplier)));`);
// 생존 부활 조건
rep3(`if (target.type === 'HP' && Number(target.teamHealerCount || 0) < 2 && !target.survivalUsed) {`,
`if (target.type === 'HP' && Number(target.teamHealerCount || 0) < (__T.surviveMaxHealers??2) && !target.survivalUsed) {`);
fs.writeFileSync('tunable.mjs',u);
console.log('hp hooks added');
// --- 피해 상한 훅 ---
let z=fs.readFileSync('tunable.mjs','utf8');
const rep4=(f,to)=>{if(!z.includes(f)){console.error('MISS4: '+f.slice(0,60));process.exit(1)}z=z.split(f).join(to)};
rep4(`const capped = Math.min(raw * (1 - reduction), target.maxHp * (counter ? 0.24 : 0.46));`,
`const capMode=__T.capMode||'MAXHP';
  const capLimit = capMode==='ATTACK'
    ? actor.attack * (counter ? __T.capCounterK : __T.capK)
    : capMode==='HYBRID'
      ? Math.min(target.maxHp*(counter?0.24:__T.capPercent), actor.attack*(counter?__T.capCounterK:__T.capK))
      : target.maxHp * (counter ? 0.24 : (__T.capPercent??0.46));
  const capped = Math.min(raw * (1 - reduction), capLimit);`);
z=z.replace('capK:0.9,defCap','capK:0.9,capCounterK:1.0,capPercent:0.46,defCap');
z=z.replace('defCurve:"LEGACY",defK:0.9','defCurve:"LEGACY",defK:0.9,capK:2.2,capCounterK:1.1,capPercent:0.46');
fs.writeFileSync('tunable.mjs',z);console.log('cap hook added');
// --- 계열 판정 강도 훅 ---
let q=fs.readFileSync('tunable.mjs','utf8');
const r5=(f,to)=>{if(!q.includes(f)){console.error('MISS5: '+f.slice(0,60));process.exit(1)}q=q.split(f).join(to)};
r5(`const defenseCounterChance=target.defenseLineBreached?0.12:0.25;`,
   `const defenseCounterChance=target.defenseLineBreached?__T.counterChanceBreached:__T.counterChance;`);
r5(`(target.defenseLineBreached?0.45:0.55), true)`,`(target.defenseLineBreached?__T.counterMultBreached:__T.counterMult), true)`);
r5(`target.hp = Math.max(1, Math.round(target.maxHp * 0.12));`,`target.hp = Math.max(1, Math.round(target.maxHp * (__T.surviveHp??0.12)));`);
r5(`target.maxHp * 0.18 * clamp(healMultiplier, 0, 1)`,`target.maxHp * (__T.emergencyHp??0.18) * clamp(healMultiplier, 0, 1)`);
q=q.replace('capK:2.2,capCounterK:1.1,capPercent:0.46','capK:2.2,capCounterK:1.1,capPercent:0.46,counterChance:0.25,counterChanceBreached:0.12,counterMult:0.55,counterMultBreached:0.45');
fs.writeFileSync('tunable.mjs',q);console.log('type-knob hooks added');
// --- 전술 전직(awaken) 훅 ---
let w=fs.readFileSync('tunable.mjs','utf8');
const r6=(f,to)=>{if(!w.includes(f)){console.error('MISS6: '+f.slice(0,70));process.exit(1)}w=w.split(f).join(to)};
const AW=`const AWAKEN=(globalThis.__T&&globalThis.__T.awaken)||{};
function aw(f,k){const a=AWAKEN[f&&f.awaken];return a&&a[k]!==undefined?a[k]:0}
`;
w=w.replace('function normalizeType(', AW+'function normalizeType(');
// buildFighter: awaken 필드 보존 + HP/속도 대가
r6(`  const maxHp = Math.max(100, Math.round(power * profile.hp * hpScale * (1 + hpPct / 100)));`,
`  const _aw=card.awaken||null;
  const maxHp = Math.max(100, Math.round(power * profile.hp * hpScale * (1 + hpPct / 100) * (1+(AWAKEN[_aw]?.hp||0))));`);
r6(`  const speed = Math.max(35, Math.round((70 + power * profile.speed * 0.10) * (1 + speedPct / 100)));`,
`  const speed = Math.max(35, Math.round((70 + power * profile.speed * 0.10) * (1 + speedPct / 100) * (1+(AWAKEN[_aw]?.spd||0))));`);
r6(`    uniqueAbility: uniqueAbility ? {`,`    awaken: _aw,\n    uniqueAbility: uniqueAbility ? {`);
// hitResult: 치명/처형/피해 대가
r6(`const criticalChance = clamp(__T.critBase`,`const criticalChance = aw(actor,'crit') + clamp(__T.critBase`);
r6(`, __T.critBase, __T.critMax);`,`, __T.critBase, __T.critMax);`);
r6(`(critical ? __T.critMult : 1)`,`(critical ? (__T.critMult+aw(actor,'critMult')) : 1) * (1+aw(actor,'dmg'))`);
r6(`const execute = weakTarget ? (actor.battleMode === 'PVE' ? 1.25 : 1.10) : 1;`,
   `const execute = weakTarget ? ((actor.battleMode === 'PVE' ? 1.25 : 1.10) + aw(actor,'execute')) : 1;`);
r6(`? clamp(__T.dodgeSpeedBase +`,`? clamp(__T.dodgeSpeedBase + aw(target,'dodge') +`);
// 반격 확률
r6(`const defenseCounterChance=target.defenseLineBreached?__T.counterChanceBreached:__T.counterChance;`,
   `const defenseCounterChance=Math.max(0,(target.defenseLineBreached?__T.counterChanceBreached:__T.counterChance)+aw(target,'counter'));`);
// 불굴 실드 / 생명 부활
r6(`const indomitableShieldRatio=target.battleMode==='PVE'?0.10:(target.defenseLineBreached?0.03:0.06);`,
   `const indomitableShieldRatio=(target.battleMode==='PVE'?0.10:(target.defenseLineBreached?0.03:0.06))+aw(target,'indomShield');`);
r6(`target.hp = Math.max(1, Math.round(target.maxHp * (__T.surviveHp??0.12)));`,
   `target.hp = Math.max(1, Math.round(target.maxHp * Math.max(0,(__T.surviveHp??0.12)+aw(target,'revive'))));`);
r6(`if (target.type === 'HP' && Number(target.teamHealerCount || 0) < (__T.surviveMaxHealers??2) && !target.survivalUsed) {`,
   `if (target.type === 'HP' && aw(target,'revive')>-1 && Number(target.teamHealerCount || 0) < (__T.surviveMaxHealers??2) && !target.survivalUsed) {`);
// 지속회복
r6(`const amount = Math.min(actor.maxHp - actor.hp, Math.max(1, Math.round(actor.maxHp * (__T.regenPercent??0.04) * sdScale`,
   `const amount = Math.min(actor.maxHp - actor.hp, Math.max(1, Math.round(actor.maxHp * ((__T.regenPercent??0.04)+aw(actor,'regen')) * (suddenDeath?Math.max(sdScale,aw(actor,'regenSD')):1)`);
r6(`    : __T.penOther;`,`    : __T.penOther;`);
r6(`const effectiveDefense = Math.max(0, target.defense * (1 - penetration));`,
   `const effectiveDefense = Math.max(0, target.defense * (1 - Math.min(0.9, penetration + aw(actor,'pen'))));`);
fs.writeFileSync('tunable.mjs',w);console.log('awaken hooks added');
// --- 메타 해부용 훅 ---
let v=fs.readFileSync('tunable.mjs','utf8');
const r7=(f,to)=>{if(!v.includes(f)){console.error('MISS7: '+f.slice(0,60));process.exit(1)}v=v.split(f).join(to)};
// 방어형 불굴 on/off + 횟수
r7(`if (target.type === 'DEFENSE' && !target.indomitableUsed) {`,
   `if (target.type === 'DEFENSE' && __T.indomitable !== false && !target.indomitableUsed && !target.reviveSealed) {`);
// 생명형 생존도 봉인 대상
r7(`if (target.type === 'HP' && aw(target,'revive')>-1 &&`,
   `if (target.type === 'HP' && !target.reviveSealed && aw(target,'revive')>-1 &&`);
fs.writeFileSync('tunable.mjs',v);console.log('meta hooks added');
// --- 계열 중첩 체감 + 힐 보너스 연속화 훅 ---
let y=fs.readFileSync('tunable.mjs','utf8');
const r8=(f,to)=>{if(!y.includes(f)){console.error('MISS8: '+f.slice(0,70));process.exit(1)}y=y.split(f).join(to)};
// buildFighter: 중첩 계수로 프로필 편차를 감쇠
r8(`  const type = normalizeType(card, uniqueAbility);
  const profile = STAT_PROFILES[type];`,
`  const type = normalizeType(card, uniqueAbility);
  const _sf = Number(card.__stack ?? 1);
  const _p0 = STAT_PROFILES[type], _pn = STAT_PROFILES.NONE;
  const profile = _sf>=1 ? _p0 : {hp:_pn.hp+(_p0.hp-_pn.hp)*_sf, attack:_pn.attack+(_p0.attack-_pn.attack)*_sf,
    defense:_pn.defense+(_p0.defense-_pn.defense)*_sf, speed:_pn.speed+(_p0.speed-_pn.speed)*_sf, label:_p0.label};`);
// 팀 구성 시 중첩 계수 주입
const STACK=`function applyStack(cards){const tbl=(globalThis.__T&&globalThis.__T.stackCurve);if(!tbl)return cards;
  const seen={};return cards.map(c=>{const t=String(c.uniqueAbility&&c.uniqueAbility.dominantType||c.power_type||c.powerType||'NONE').toUpperCase();
    seen[t]=(seen[t]||0)+1;return {...c,__stack:tbl[Math.min(tbl.length-1,seen[t]-1)]}})}
`;
y=y.replace('export function distributeEquipment', STACK+'export function distributeEquipment');
r8(`  const attackerWithEquipment = distributeEquipment(attackerCards,`,`  const attackerWithEquipment = distributeEquipment(applyStack(attackerCards),`);
r8(`  const defenderWithEquipment = distributeEquipment(defenderCards,`,`  const defenderWithEquipment = distributeEquipment(applyStack(defenderCards),`);
r8(`  const withBonus = distributeEquipment(cards,`,`  const withBonus = distributeEquipment(applyStack(cards),`);
// 힐 보너스를 장수 비례 연속 함수로
r8(`      if (healers.length !== 1) continue;
      const healer = healers[0];
      healer.singleHealerActive = true;
      healer.singleHealerUses = 0;`,
`      const _hc = healers.length;
      const _sc = __T.healerBonusCurve ? (__T.healerBonusCurve[Math.min(__T.healerBonusCurve.length-1,_hc-1)] ?? 0) : (_hc===1?1:0);
      if (_hc < 1 || _sc <= 0) continue;
      for (const h of healers) { h.singleHealerActive = true; h.singleHealerScale = _sc; h.singleHealerUses = 0;
        h.singleHealerMaxUses = h.battleMode === 'PVE' ? singleHealer.pveMaxActivations : singleHealer.pvpMaxActivations; }
      const healer = healers[0];`);
r8(`        const amount = Math.max(0, Math.round(target.maxHp * singleHealer.teamHpPercent / 100));`,
   `        const amount = Math.max(0, Math.round(target.maxHp * singleHealer.teamHpPercent * _sc / 100));`);
fs.writeFileSync('tunable.mjs',y);console.log('stack hooks added');
// --- 계열 고유 능력 팀 총량제 훅 ---
let k=fs.readFileSync('tunable.mjs','utf8');
const r9=(f,to)=>{if(!k.includes(f)){console.error('MISS9: '+f.slice(0,70));process.exit(1)}k=k.split(f).join(to)};
r9(`function resolveKnockout(target, timeline, clock, onBeforeKnockout = null) {
  if (target.hp > 0 || !target.alive) return false;`,
`const __teamBudget = new Map();
function __budget(side,key,max){const k=side+':'+key;const used=__teamBudget.get(k)||0;if(used>=max)return false;__teamBudget.set(k,used+1);return true}
export function __resetBudget(){__teamBudget.clear()}
function resolveKnockout(target, timeline, clock, onBeforeKnockout = null) {
  if (target.hp > 0 || !target.alive) return false;`);
r9(`if (target.type === 'DEFENSE' && __T.indomitable !== false && !target.indomitableUsed && !target.reviveSealed) {`,
   `if (target.type === 'DEFENSE' && __T.indomitable !== false && !target.indomitableUsed && !target.reviveSealed && __budget(target.side,'INDOM',__T.indomTeamMax??99)) {`);
r9(`if (target.type === 'HP' && !target.reviveSealed && aw(target,'revive')>-1 && Number(target.teamHealerCount || 0) < (__T.surviveMaxHealers??2) && !target.survivalUsed) {`,
   `if (target.type === 'HP' && !target.reviveSealed && aw(target,'revive')>-1 && Number(target.teamHealerCount || 0) < (__T.surviveMaxHealers??2) && !target.survivalUsed && __budget(target.side,'SURV',__T.surviveTeamMax??99)) {`);
// 전투 시작마다 예산 초기화
r9(`  const healerRules = healerPenalty ?`,`  __teamBudget.clear();
  const healerRules = healerPenalty ?`);
fs.writeFileSync('tunable.mjs',k);console.log('budget hooks added');
// --- 봉인 플래그 전달 ---
let m2=fs.readFileSync('tunable.mjs','utf8');
if(!m2.includes('reviveSealed: Boolean(card.__seal)')){
  m2=m2.replace(`    awaken: _aw,`,`    awaken: _aw,\n    reviveSealed: Boolean(card.__seal),`);
  fs.writeFileSync('tunable.mjs',m2);console.log('seal flag added');
}
// --- 처형 배율 훅 ---
let x2=fs.readFileSync('tunable.mjs','utf8');
if(!x2.includes('__T.executePvp')){
  const f=`const execute = weakTarget ? ((actor.battleMode === 'PVE' ? 1.25 : 1.10) + aw(actor,'execute')) : 1;`;
  if(!x2.includes(f)){console.error('MISS exec');process.exit(1)}
  x2=x2.replace(f,`const execute = weakTarget ? ((actor.battleMode === 'PVE' ? (__T.executePve??1.25) : (__T.executePvp??1.10)) + aw(actor,'execute')) : 1;`);
  fs.writeFileSync('tunable.mjs',x2);console.log('execute hook added');
}
// --- 행동 빈도 압축 훅 ---
let x3=fs.readFileSync('tunable.mjs','utf8');
if(!x3.includes('__T.speedBaseK')){
  const f=`  const speed = Math.max(35, Math.round((70 + power * profile.speed * 0.10) * (1 + speedPct / 100) * (1+(AWAKEN[_aw]?.spd||0))));`;
  if(!x3.includes(f)){console.error('MISS speed');process.exit(1)}
  x3=x3.replace(f,`  const speed = Math.max(35, Math.round((70 + power*(__T.speedBaseK??0) + power * profile.speed * 0.10) * (1 + speedPct / 100) * (1+(AWAKEN[_aw]?.spd||0))));`);
  fs.writeFileSync('tunable.mjs',x3);console.log('speedBaseK hook added');
}
// --- 방어곡선 분모 = 카드 전투력 ---
let x4=fs.readFileSync('tunable.mjs','utf8');
if(!x4.includes("CARDPOWER")){
  const f=`const reduction = __T.defCurve==='POWER' ? clamp(effectiveDefense/(effectiveDefense+Math.max(1,actor.attack*__T.defK)),0,__T.defCap) : clamp(effectiveDefense / (effectiveDefense + 600), 0, __T.defCap);`;
  if(!x4.includes(f)){console.error('MISS defcurve');process.exit(1)}
  x4=x4.replace(f,`const reduction = __T.defCurve==='CARDPOWER'
    ? clamp(effectiveDefense/(effectiveDefense+Math.max(1,(actor.power||actor.basePower||1)*__T.defK)),0,__T.defCap)
    : __T.defCurve==='POWER' ? clamp(effectiveDefense/(effectiveDefense+Math.max(1,actor.attack*__T.defK)),0,__T.defCap)
    : clamp(effectiveDefense / (effectiveDefense + 600), 0, __T.defCap);`);
  fs.writeFileSync('tunable.mjs',x4);console.log('CARDPOWER hook added');
}
// --- 공격형 계열 능력 훅 ---
let x5=fs.readFileSync('tunable.mjs','utf8');
if(!x5.includes('__T.penAttackPvp')){
  const f=`: (random() < 0.35 ? 0.30 : 0.15))`;
  if(!x5.includes(f)){console.error('MISS pen');process.exit(1)}
  x5=x5.replace(f,`: (random() < 0.35 ? (__T.penAttackPvp??0.30) : (__T.penAttackPvpLo??0.15)))`);
  const g=`actor.pvpTakedownUsed=true;actor.gauge=Math.min(95,actor.gauge+45);`;
  if(!x5.includes(g)){console.error('MISS takedown');process.exit(1)}
  x5=x5.replace(g,`actor.pvpTakedownUsed=true;actor.gauge=Math.min(95,actor.gauge+(__T.takedownGauge??45));`);
  fs.writeFileSync('tunable.mjs',x5);console.log('attack-role hooks added');
}
// --- 계열 능력 재배분 훅: 공격형 부활봉인 / 속도형 처치 재행동 ---
let x6=fs.readFileSync('tunable.mjs','utf8');
if(!x6.includes('__T.attackSealRevive')){
  // 전투 시작 시 공격형 보유 수만큼 상대 팀 부활 예산을 깎는다
  const f=`  __teamBudget.clear();`;
  if(!x6.includes(f)){console.error('MISS budget');process.exit(1)}
  x6=x6.replace(f,`  __teamBudget.clear();
  if(__T.attackSealRevive>0){
    const seal=(src,dst,side)=>{const n=src.filter(c=>c.type==='ATTACK').length;
      if(n>0)__teamBudget.set(side+':SEAL', Math.min(__T.attackSealRevive*n, 9));};
    seal(a,b,'B'); seal(b,a,'A');
  }`);
  // 부활 시 봉인 예산을 먼저 소모
  const g=`function __budget(side,key,max){const k=side+':'+key;const used=__teamBudget.get(k)||0;if(used>=max)return false;__teamBudget.set(k,used+1);return true}`;
  x6=x6.replace(g,`function __budget(side,key,max){
  const sk=side+':SEAL', sealed=__teamBudget.get(sk)||0;
  if(sealed>0){__teamBudget.set(sk,sealed-1);return false}
  const k=side+':'+key;const used=__teamBudget.get(k)||0;if(used>=max)return false;__teamBudget.set(k,used+1);return true}`);
  // 속도형: 처치 시 즉시 게이지 회복(추가 행동)
  const h=`    if(knockedOut&&actor.type==='ATTACK'&&actor.battleMode==='PVP'&&!actor.pvpTakedownUsed){`;
  if(!x6.includes(h)){console.error('MISS ko');process.exit(1)}
  x6=x6.replace(h,`    if(knockedOut&&actor.type==='SPEED'&&(__T.speedChaseGauge??0)>0&&(actor.speedChaseUses||0)<(__T.speedChaseUses??2)){
      actor.speedChaseUses=(actor.speedChaseUses||0)+1;actor.gauge=Math.min(95,actor.gauge+__T.speedChaseGauge);
      pushEvent(timeline,clock+0.0007,'HUNT_ACCELERATION',{actorId:actor.id,gaugeAfter:actor.gauge,label:'속도형 · 추격'});
    }
    if(knockedOut&&actor.type==='ATTACK'&&actor.battleMode==='PVP'&&!actor.pvpTakedownUsed){`);
  fs.writeFileSync('tunable.mjs',x6);console.log('role-ability hooks added');
}
let x7=fs.readFileSync('tunable.mjs','utf8');
if(!x7.includes('__T.guardProtect')){
  const f=`    const guards=team.filter(card=>card.type==='DEFENSE');`;
  if(!x7.includes(f)){console.error('MISS guard');process.exit(1)}
  x7=x7.replace(f,`    const guards=__T.guardProtect===false?[]:team.filter(card=>card.type==='DEFENSE');`);
  fs.writeFileSync('tunable.mjs',x7);console.log('guardProtect hook added');
}
// --- 공격형 연쇄 처치: 처치 시 게이지 회복(즉시 재행동) ---
let x8=fs.readFileSync('tunable.mjs','utf8');
if(!x8.includes('__T.chainGauge')){
  const f=`    if(knockedOut&&actor.type==='ATTACK'&&actor.battleMode==='PVP'&&!actor.pvpTakedownUsed){
      actor.pvpTakedownUsed=true;actor.gauge=Math.min(95,actor.gauge+(__T.takedownGauge??45));`;
  if(!x8.includes(f)){console.error('MISS chain');process.exit(1)}
  x8=x8.replace(f,`    if(knockedOut&&actor.type==='ATTACK'&&(__T.chainGauge??0)>0&&(actor.chainUses||0)<(__T.chainUses??2)){
      actor.chainUses=(actor.chainUses||0)+1;
      actor.gauge=Math.min(__T.chainGaugeCap??100,actor.gauge+__T.chainGauge);
      pushEvent(timeline,clock+0.0008,'HUNT_ACCELERATION',{actorId:actor.id,gaugeAfter:actor.gauge,chain:actor.chainUses,label:'공격형 · 연쇄 처치'});
    }
    if(knockedOut&&actor.type==='ATTACK'&&actor.battleMode==='PVP'&&!actor.pvpTakedownUsed){
      actor.pvpTakedownUsed=true;actor.gauge=Math.min(95,actor.gauge+(__T.takedownGauge??45));`);
  fs.writeFileSync('tunable.mjs',x8);console.log('chain-kill hook added');
}
// --- 공격형 추가타(반격의 대칭) ---
let x9=fs.readFileSync('tunable.mjs','utf8');
if(!x9.includes('__T.followUpChance')){
  const f=`    const barrierBroken=target.type==='DEFENSE'&&damageState.shieldBefore>0&&damageState.shieldAfter<=0;`;
  if(!x9.includes(f)){console.error('MISS followup');process.exit(1)}
  x9=x9.replace(f,`    if(actor.type==='ATTACK'&&(__T.followUpChance??0)>0&&target.alive&&target.hp>0&&random()<__T.followUpChance){
      const fu=hitResult(actor,target,random,__T.followUpMult??0.55,true);
      if(!fu.dodge){
        const fs2=applyDamage(target,fu.damage);
        actor.damageDealt+=fs2.hpDamage+fs2.absorbed;
        pushEvent(timeline,clock+0.0009,'ATTACK_FOLLOWUP',{actorId:actor.id,targetId:target.id,damage:fs2.hpDamage,absorbed:fs2.absorbed,critical:fu.critical,targetHpAfter:target.hp,targetMaxHp:target.maxHp,label:'공격형 · 추가타'});
        resolveKnockout(target,timeline,clock+0.0009,reviveFromMagic);
      }
    }
    const barrierBroken=target.type==='DEFENSE'&&damageState.shieldBefore>0&&damageState.shieldAfter<=0;`);
  fs.writeFileSync('tunable.mjs',x9);console.log('followup hook added');
}
// --- 계열 다양성 보너스 ---
let xa=fs.readFileSync('tunable.mjs','utf8');
if(!xa.includes('__T.varietyBonus')){
  const f=`  __teamBudget.clear();`;
  if(!xa.includes(f)){console.error('MISS variety');process.exit(1)}
  xa=xa.replace(f,`  __teamBudget.clear();
  if(Array.isArray(__T.varietyBonus)){
    for(const team of [a,b]){
      const kinds=new Set(team.filter(c=>['ATTACK','DEFENSE','SPEED','HP'].includes(c.type)).map(c=>c.type)).size;
      const bonus=__T.varietyBonus[Math.min(__T.varietyBonus.length-1,kinds)]||0;
      if(bonus>0)for(const c of team){
        c.attack=Math.round(c.attack*(1+bonus));
        const add=Math.round(c.maxHp*bonus); c.maxHp+=add; c.hp+=add;
      }
    }
  }`);
  fs.writeFileSync('tunable.mjs',xa);console.log('variety hook added');
}
// --- B안: 방어형 성격 개편 (무료부활 -> 유한 방벽) + 속도형 버프 ---
let xb=fs.readFileSync('tunable.mjs','utf8');
if(!xb.includes('__T.guardShieldPct')){
  // 1) 전투 시작 시 방어형이 팀 전체에 실드를 깐다 (장수 체감)
  const f=`  if(Array.isArray(__T.varietyBonus)){`;
  if(!xb.includes(f)){console.error('MISS variety anchor');process.exit(1)}
  xb=xb.replace(f,`  if(__T.guardShieldPct>0){
    for(const team of [a,b]){
      const guards=team.filter(c=>c.type==='DEFENSE');
      if(!guards.length)continue;
      const curve=__T.guardShieldCurve||[1,0.6,0.35,0.2,0.12];
      let pool=0;
      guards.forEach((g,i)=>{pool+=g.maxHp*__T.guardShieldPct*(curve[Math.min(curve.length-1,i)]||0)});
      const share=Math.round(pool/team.length);
      for(const c of team){c.shield+=share;c.maxShield+=share}
      pushEvent(timeline,0,'GUARD_PROTECT',{side:guards[0].side,amount:share,guards:guards.length,label:'수호형 · 방벽 전개'});
    }
  }
  if(Array.isArray(__T.varietyBonus)){`);
  // 2) 반격은 실드가 남아 있을 때만
  xb=xb.replace(`if (target.type === 'DEFENSE' && (barrierBroken || random() < defenseCounterChance)) {`,
    `if (target.type === 'DEFENSE' && (!__T.counterNeedsShield || target.shield > 0) && (barrierBroken || random() < defenseCounterChance)) {`);
  // 3) 속도형: 실드에 추가 피해(다타로 방벽을 깎는 역할)
  xb=xb.replace(`function applyDamage(target, incoming, options = {}) {`,
    `function applyDamage(target, incoming, options = {}) {
  if(options.shieldBonus>0&&target.shield>0)incoming=incoming+Math.min(target.shield,incoming*options.shieldBonus);`);
  xb=xb.replace(`const damageState = applyDamage(target, hit.damage`,
    `const damageState = applyDamage(target, hit.damage, {shieldBonus: actor.type==='SPEED'?(__T.speedShieldBonus??0):0}`);
  fs.writeFileSync('tunable.mjs',xb);console.log('B-redesign hooks added');
}
// --- 생명형: 회복 총량제 ---
let xc=fs.readFileSync('tunable.mjs','utf8');
if(!xc.includes('__T.healPoolPct')){
  const f=`  if(__T.guardShieldPct>0){`;
  if(!xc.includes(f)){console.error('MISS heal anchor');process.exit(1)}
  xc=xc.replace(f,`  const __healPool={A:0,B:0};
  if(__T.healPoolPct>0){
    for(const team of [a,b]){
      const hs=team.filter(c=>c.type==='HP');
      if(!hs.length)continue;
      const curve=__T.healPoolCurve||[1,0.6,0.35,0.2,0.12];
      let pool=0; hs.forEach((h,i)=>{pool+=h.maxHp*__T.healPoolPct*(curve[Math.min(curve.length-1,i)]||0)});
      __healPool[hs[0].side]=Math.round(pool);
    }
  }
  globalThis.__healPoolRef=__healPool;
  if(__T.guardShieldPct>0){`);
  // 회복 지점 3곳에 풀 차감
  xc=xc.replace(`      actor.hp += amount;
      actor.healingDone += amount;
      pushEvent(timeline, clock, 'REGEN'`,
`      const _p=globalThis.__healPoolRef; let _amt=amount;
      if(__T.healPoolPct>0){_amt=Math.min(_amt,_p[actor.side]||0); _p[actor.side]=(_p[actor.side]||0)-_amt}
      if(_amt<=0){} else {
      actor.hp += _amt;
      actor.healingDone += _amt;
      pushEvent(timeline, clock, 'REGEN'`);
  xc=xc.replace(`, label: '생명형 · 지속 회복' });
    }`,`, label: '생명형 · 지속 회복' });
      }
    }`);
  xc=xc.replace(`  target.hp += amount;
  target.healingDone += amount;
  pushEvent(timeline, clock, 'EMERGENCY_HEAL'`,
`  const _p2=globalThis.__healPoolRef; let _a2=amount;
  if(__T.healPoolPct>0){_a2=Math.min(_a2,_p2[target.side]||0); _p2[target.side]=(_p2[target.side]||0)-_a2}
  if(_a2<=0)return;
  target.hp += _a2;
  target.healingDone += _a2;
  pushEvent(timeline, clock, 'EMERGENCY_HEAL'`);
  fs.writeFileSync('tunable.mjs',xc);console.log('healPool hook added');
}
