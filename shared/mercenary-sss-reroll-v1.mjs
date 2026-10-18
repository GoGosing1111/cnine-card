import {KANGYUN_CODE} from './mercenary-kangyun-v1.mjs';
export const SSS_REROLL=Object.freeze({
 code:'MERCENARY_SSS_REROLL_TICKET',name:'SSS 재뽑기권',rank:'SSS',
 image:'/assets/ui/sss-reroll-v1/ticket-256.webp',
 sourceArt:'/assets/ui/sss-reroll-v1/ticket-source-v1.png',
 url:'/mercenary-codex/sss-reroll/',materialCount:1,itemCount:1
});
export const SSS_REROLL_TOTAL=100_000_000;
export const emptySssRerollPolicy=()=>({format:'MERCENARY_SSS_REROLL_V1',mode:'OFF',cards:{},notes:''});
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===[...keys].sort().join(',');
export function validateSssRerollPolicy(value,catalog){
 if(!exact(value,['format','mode','cards','notes'])||value.format!=='MERCENARY_SSS_REROLL_V1'||!['OFF','ON'].includes(value.mode))throw Error('재뽑기 ON/OFF 설정을 확인하세요.');
 if(!value.cards||typeof value.cards!=='object'||Array.isArray(value.cards)||Object.keys(value.cards).length>1000)throw Error('용병별 기준 확률을 확인하세요.');
 const cards={};
 for(const [code,units] of Object.entries(value.cards)){
  if(!/^V-\d{3}$/.test(code)||catalog&&!catalog.some(c=>c.code===code&&!c.limited)||units!==null&&(!Number.isSafeInteger(units)||units<0||units>SSS_REROLL_TOTAL))throw Error('일반 용병의 기준 확률을 0~100%, 소수점 6자리까지 입력하세요.');
  cards[code]=units;
 }
 if(typeof value.notes!=='string'||value.notes.length>1000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value.notes))throw Error('운영 메모는 1,000자 이내로 입력하세요.');
 return{format:value.format,mode:value.mode,cards,notes:value.notes};
}
// Integer largest-remainder allocation: UI odds and server draws share exact units.
function apportionSss(rows,total){
 const sum=rows.reduce((n,r)=>n+r.units,0);if(!sum)return rows.map(r=>({...r,units:0}));
 const ranked=rows.map((r,index)=>{const exact=BigInt(r.units)*BigInt(total);return {...r,index,units:Number(exact/BigInt(sum)),remainder:exact%BigInt(sum)};});
 let remaining=total-ranked.reduce((n,r)=>n+r.units,0);
 for(const r of [...ranked].sort((a,b)=>a.remainder===b.remainder?a.index-b.index:a.remainder>b.remainder?-1:1)){if(!remaining--)break;r.units++;}
 return ranked.map(({index,remainder,...r})=>r);
}
// Read-time registration only. Preserve saved modes/notes and explicit later edits.
export function withKangyunRerollDefault(policy,catalog){
 if(Object.hasOwn(policy.cards,KANGYUN_CODE)||!catalog.some(c=>c.code===KANGYUN_CODE&&sssRerollEligible(c)))return policy;
 const rows=Object.entries(policy.cards).map(([code,units])=>({code,units:units||0}));
 if(rows.reduce((n,r)=>n+r.units,0)!==SSS_REROLL_TOTAL||rows.filter(r=>r.units>0).length<2)return policy;
 const cards={...policy.cards};for(const r of apportionSss(rows,SSS_REROLL_TOTAL*99/100))if(cards[r.code]!==null)cards[r.code]=r.units;
 return {...policy,cards:{...cards,[KANGYUN_CODE]:SSS_REROLL_TOTAL/100}};
}
export const sssRerollEligible=card=>card?.rank==='SSS'&&!card.limited&&card.available===true;
export function sssRerollReadiness(policy,catalog){
 const entries=Object.entries(policy.cards),total=entries.reduce((sum,[,units])=>sum+(units??0),0),positive=entries.filter(([,units])=>units>0),blockers=[];
 if(total!==SSS_REROLL_TOTAL)blockers.push('기준 확률 합계를 100%로 설정하세요.');
 if(positive.length<2)blockers.push('서로 다른 일반 SSS 용병 최소 2종에 확률을 설정하세요.');
 if(policy.cards[KANGYUN_CODE]>0&&policy.cards[KANGYUN_CODE]<SSS_REROLL_TOTAL&&positive.filter(([code])=>code!==KANGYUN_CODE).length<2)blockers.push('투입 카드 제외 후 강윤 확률을 유지하려면 다른 일반 SSS 최소 2종에 확률을 설정하세요.');
 for(const [code]of positive)if(!sssRerollEligible(catalog.find(c=>c.code===code)))blockers.push((catalog.find(c=>c.code===code)?.name||code)+': 현재 일반 SSS 획득 대상이 아닙니다.');
 return{ready:blockers.length===0,total,blockers};
}
export function sssRerollOdds(policy,catalog,sourceCode=null){
 const pool=catalog.filter(c=>sssRerollEligible(c)&&c.code!==sourceCode&&(policy.cards[c.code]??0)>0);
 const kangyun=pool.find(c=>c.code===KANGYUN_CODE),others=pool.filter(c=>c!==kangyun);
 if(kangyun&&sourceCode&&sourceCode!==KANGYUN_CODE){
  if(!others.length)throw Error('강윤의 확률을 유지할 다른 일반 SSS 대상이 없습니다.');
  const fixed=policy.cards[KANGYUN_CODE],allocated=apportionSss(others.map(c=>({...c,units:policy.cards[c.code]})),SSS_REROLL_TOTAL-fixed);
  const units=new Map([...allocated.map(c=>[c.code,c.units]),[KANGYUN_CODE,fixed]]);
  return pool.map(card=>({...card,units:units.get(card.code),basePercent:policy.cards[card.code]/1_000_000,percent:units.get(card.code)/1_000_000}));
 }
 const denominator=pool.reduce((sum,c)=>sum+policy.cards[c.code],0);
 return pool.map(card=>({...card,units:policy.cards[card.code],basePercent:policy.cards[card.code]/1_000_000,percent:denominator?policy.cards[card.code]/denominator*100:0}));
}
export function pickSssReroll(policy,catalog,sourceCode,randomInt){
 const choices=sssRerollOdds(policy,catalog,sourceCode),total=choices.reduce((sum,c)=>sum+c.units,0);
 if(!total)throw Error('투입 용병을 제외한 재뽑기 대상이 없습니다.');
 let roll=randomInt(total);if(!Number.isSafeInteger(roll)||roll<0||roll>=total)throw Error('Invalid SSS reroll sample');
 const selected=choices.find(c=>{roll-=c.units;return roll<0;});
 return{mercenaryCode:selected.code,name:selected.name,title:selected.title||'',rank:'SSS',sourceArt:selected.sourceArt,quantity:1,percent:selected.percent};
}
export function parseSssRerollPercent(value){
 if(value==='')return null;
 if(typeof value!=='string'||!/^(0|[1-9]\d*)(\.\d{1,6})?$/.test(value.trim()))throw Error('확률은 소수점 6자리까지 입력하세요.');
 const [whole,fraction='']=value.trim().split('.'),units=Number(whole)*1_000_000+Number(fraction.padEnd(6,'0'));
 if(!Number.isSafeInteger(units)||units>SSS_REROLL_TOTAL)throw Error('확률은 0~100%로 입력하세요.');
 return units;
}
export const sssRerollPercent=units=>units===null||units===undefined?'':String(units/1_000_000);
