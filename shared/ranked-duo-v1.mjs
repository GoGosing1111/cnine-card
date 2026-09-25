import {DUO_RECRUIT_HOURS,duoTiers} from './ranked-duo-season-v2.mjs';
import {validateDuoPolicy} from './ranked-duo-weekly-v3.mjs';
export const DUO_VERSION='duo-20260925-v1';
export const DUO_LIMITS=Object.freeze({participants:10000,refreshBatch:12,candidates:24,history:30,logBytes:1500000,grade:{PRESTIGE:2,FUR:2,ZENITH:2,SUPERSTAR:1}});
export const DUO_DEFAULTS=Object.freeze({revision:0,name:'랭크 듀오 시즌 1',visible:false,recruitHours:DUO_RECRUIT_HOURS,startsAt:null,endsAt:null,energy:{maximum:null,dailyGrant:null,cost:null},score:{initial:1000,win:24,loss:16},mercenaryWeights:{}});
export const duoError=(code,message,status=409)=>Object.assign(new Error(message),{code:`DUO_${code}`,status});
const integer=(n,min,max,label)=>{if(!Number.isSafeInteger(n)||n<min||n>max)throw duoError('CONFIG',`${label} 설정을 확인하세요.`,400);return n;};
export function validateDuoConfig(raw){
 if(!raw||typeof raw.name!=='string'||!raw.name.trim()||raw.name.length>80)throw duoError('CONFIG','시즌 이름을 확인하세요.',400);
 const date=value=>value===null?null:Number.isFinite(Date.parse(value))?new Date(value).toISOString():(()=>{throw duoError('CONFIG','날짜를 확인하세요.',400);})();
 const energy={};for(const [k,label]of [['maximum','행동력 최대치'],['dailyGrant','일일 행동력'],['cost','공격 비용']])energy[k]=raw.energy?.[k]===null?null:integer(raw.energy?.[k],1,1000,label);
 if(energy.maximum!==null&&(energy.dailyGrant>energy.maximum||energy.cost>energy.maximum))throw duoError('CONFIG','지급량과 비용은 행동력 최대치를 넘을 수 없습니다.',400);
 if(raw.energy?.mode==='RANKED'){energy.mode='RANKED';energy.rechargeMinutes=integer(raw.energy.rechargeMinutes,1,1440,'행동력 충전 간격');}
 const weights={};for(const [code,value]of Object.entries(raw.mercenaryWeights||{})){if(!/^V-\d{3}$/.test(code)||!Number.isFinite(value)||value<.1||value>10)throw duoError('CONFIG','용병 평가 배율을 확인하세요.',400);weights[code]=value;}
 const result={revision:integer(raw.revision??0,0,2147483646,'설정 버전'),name:raw.name.trim(),visible:raw.visible===true,recruitHours:integer(raw.recruitHours??DUO_RECRUIT_HOURS,1,720,'모집 시간'),startsAt:date(raw.startsAt),endsAt:date(raw.endsAt),energy,score:{initial:integer(raw.score?.initial??1000,0,raw.automatic?1000000:100000,'시작 점수'),win:integer(raw.score?.win??24,raw.automatic?0:1,raw.automatic?100000:1000,'승리 점수'),loss:integer(raw.score?.loss??16,0,raw.automatic?100000:1000,'패배 점수')},mercenaryWeights:weights};
 if(result.startsAt&&result.endsAt&&result.endsAt<=result.startsAt)throw duoError('CONFIG','종료일은 시작일 이후여야 합니다.',400);
 if(raw.automatic===true||raw.weekly){
  if(!raw.rankedSeason?.key||!raw.rankedSeason.name)throw duoError('CONFIG','연동한 랭크전 시즌을 확인하세요.',400);
  result.automatic=true;result.rankedSeason={key:String(raw.rankedSeason.key).slice(0,220),name:String(raw.rankedSeason.name).slice(0,40),startsAt:date(raw.rankedSeason.startsAt),endsAt:date(raw.rankedSeason.endsAt),recruitStartsAt:date(raw.rankedSeason.recruitStartsAt)};
  result.competitionStartedAt=date(raw.competitionStartedAt??null);result.tiers=duoTiers(raw).tiers;
  if(raw.weekly){
   const policy=validateDuoPolicy({...raw,anchor:raw.weekly.recruitStartsAt});
   result.weekly={sequence:integer(raw.weekly.sequence,1,2147483646,'시즌 회차'),policyRevision:integer(raw.weekly.policyRevision,0,2147483646,'운영 버전'),recruitStartsAt:date(raw.weekly.recruitStartsAt)};
   result.rewards=policy.rewards;result.tiers=policy.tiers;result.challenger=policy.challenger;
   // The first recruitment was opened before the weekly worker was deployed.
   result.automatic=raw.automatic===true;
  }
 }
 return result;
}
export function validateDuoDeck(cards){
 if(!Array.isArray(cards)||cards.length!==5||new Set(cards.map(c=>String(c.id))).size!==5)throw duoError('DECK','보유 카드 5장으로 랭크전 덱을 저장하세요.');
 const counts={};for(const c of cards){const grade=String(c.rarity||c.grade||'').toUpperCase();counts[grade]=(counts[grade]||0)+1;if(counts[grade]>(DUO_LIMITS.grade[grade]??5))throw duoError('DECK',`${grade} 편성 제한을 확인하세요.`);}
 return cards;
}
export function strongestDuoCards(cards){
 const counts={},selected=[];
 for(const card of [...cards].sort((a,b)=>b.power-a.power||String(a.id).localeCompare(String(b.id)))){
  const g=String(card.rarity||card.grade).toUpperCase();if((counts[g]||0)>=(DUO_LIMITS.grade[g]??5)||selected.some(c=>c.id===card.id))continue;
  selected.push(card);counts[g]=(counts[g]||0)+1;if(selected.length===5)break;
 }
 return selected;
}
export function pairDuoParticipants(entries){
 if(entries.length>DUO_LIMITS.participants||new Set(entries.map(e=>e.userId)).size!==entries.length||entries.some(e=>!Number.isSafeInteger(e.userId)||e.userId<1||!Number.isFinite(e.power)||e.power<=0))throw duoError('PAIR_INPUT','편성 대상 전력을 확인하세요.');
 const byArrival=[...entries].sort((a,b)=>String(a.joinedAt||'').localeCompare(String(b.joinedAt||''))||a.userId-b.userId),waiting=byArrival.length%2?[byArrival.pop()]:[],sorted=byArrival.sort((a,b)=>b.power-a.power||a.userId-b.userId),n=sorted.length/2,teams=[];
 // Opposite sorting minimises squared team sums for an additive score with
 // one member from each half. No all-pairs search or database work is needed.
 for(let i=0;i<n;i++){const strong=sorted[i],weak=sorted[n*2-1-i];teams.push({members:[strong,weak],power:strong.power+weak.power});}
 const powers=teams.map(t=>t.power),average=powers.length?powers.reduce((a,b)=>a+b,0)/powers.length:0;
 return {teams,waiting,spreadPercent:average?(Math.max(...powers)-Math.min(...powers))/average*100:0};
}
export const duoDay=now=>new Date(Number(now)+9*3600000).toISOString().slice(0,10);
export function duoEnergy(participant,config,now=Date.now()){
 if(config.energy.mode==='RANKED'){
  const maximum=config.energy.maximum||0,cost=config.energy.cost||0,interval=config.energy.rechargeMinutes*60000;
  const saved=Date.parse(participant?.energy_day),initial=!Number.isFinite(saved);
  const stored=initial?maximum:Math.min(maximum,Math.max(0,Number(participant.energy)||0));
  const ticks=initial?0:Math.max(0,Math.floor((now-saved)/interval)),current=Math.min(maximum,stored+ticks);
  const anchor=initial||current>=maximum?now:Math.min(now,saved+ticks*interval);
  return {current,maximum,cost,day:new Date(anchor).toISOString(),mode:'RANKED',rechargeMinutes:config.energy.rechargeMinutes,nextResetAt:current<maximum?new Date(anchor+interval).toISOString():null};
 }
 const maximum=config.energy.maximum||0,day=duoDay(now),stored=Math.max(0,Number(participant?.energy||0));
 const current=participant?.energy_day===day?Math.min(maximum,stored):Math.min(maximum,stored+(config.energy.dailyGrant||0));
 return {current,maximum,cost:config.energy.cost||0,day,nextResetAt:new Date(Date.parse(`${day}T00:00:00+09:00`)+86400000).toISOString()};
}
