export const WISH_TICKET='PINGDU_WISH_TICKET';
export const WISH_LAMP_IMAGE='/assets/ui/events/wish-lamp-v2077/lamp.png';
export const WISH_CHOICES=Object.freeze([
  {id:'VEHICLE',name:'이동수단',caption:'두 개의 전설, 새로운 여정',keys:['VENENO','IGNIS_X']},
  {id:'EQUIPMENT',name:'미스틱 장비',caption:'미스틱 4종 · 소버린 SKS',keys:['MYSTIC_TOP','MYSTIC_BOTTOM','MYSTIC_SHOES','MYSTIC_DISK','SKS']},
  {id:'BATTLE_SUIT',name:'배틀슈트',caption:'E-BODY · F-BODY',keys:['E_BODY','F_BODY']}
]);
export const WISH_REWARDS=Object.freeze({
 VENENO:{code:'GARAGE_1788384283636',name:'람보르기니 베네노',type:'VEHICLE',image:'/assets/tire/lamborghini-veneno-showroom-v1.png'},
 IGNIS_X:{code:'GARAGE_1787232065012',name:'이그니스 - X',type:'VEHICLE',image:'/assets/tire/1321312.jpg'},
 MYSTIC_TOP:{code:'EQ_1787156691265',name:'미스틱 슈트',type:'EQUIPMENT',slot:'TOP',image:'/assets/items/sovereign-top-v1.webp'},
 MYSTIC_BOTTOM:{code:'EQ_1787156640727',name:'미스틱 레깅스',type:'EQUIPMENT',slot:'BOTTOM',image:'/assets/items/sovereign-bottom-v1.webp'},
 MYSTIC_SHOES:{code:'EQ_1787156667357',name:'미스틱 슈즈',type:'EQUIPMENT',slot:'SHOES',image:'/assets/items/sovereign-shoes-v1.webp'},
 MYSTIC_DISK:{code:'EQ_1787156718021',name:'미스틱 듀얼디스크',type:'EQUIPMENT',slot:'ACCESSORY',image:'/assets/items/sovereign-weapon-v1.webp'},
 SKS:{code:'EQ_1786966923833',name:'소버린 SKS',type:'EQUIPMENT',slot:'WEAPON',image:'/assets/items/41515123.jpeg'},
 E_BODY:{code:'BATTLE_SUIT_01',name:'E-BODY',type:'BATTLE_SUIT',slot:'BATTLE_SUIT',image:'/assets/ui/project-v/account-battle-suits/suits/battle-suit-appearance-01-white-gold-female-v2.png'},
 F_BODY:{code:'BATTLE_SUIT_02',name:'F-BODY',type:'BATTLE_SUIT',slot:'BATTLE_SUIT',image:'/assets/ui/project-v/account-battle-suits/suits/battle-suit-appearance-02-orange-tactical-v1.png'}
});
export function cleanWishSettings(raw={}){
 const fail=message=>{throw new Error(message)};
 const num=(v,min,max,rate=false)=>{if(v===null||v===undefined||v==='')return null;if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max||(!rate&&!Number.isSafeInteger(v))||(rate&&Math.abs(v*1e4-Math.round(v*1e4))>1e-6))fail('비용·수량·확률 범위를 확인하세요.');return v};
 const date=v=>{if(v===null||v===undefined||v==='')return null;const m=typeof v==='string'&&v.match(/^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)(?::(\d\d)(?:\.\d{1,3})?)?(Z|[+-]\d\d:\d\d)$/);if(!m||!Number.isFinite(Date.parse(v))||+m[2]<1||+m[2]>12||+m[3]<1||+m[3]>new Date(Date.UTC(+m[1],+m[2],0)).getUTCDate()||+m[4]>23||+m[5]>59||+(m[6]||0)>59)fail('시간대가 포함된 올바른 일시를 입력하세요.');return new Date(v).toISOString()};
 if(!raw||typeof raw!=='object'||Array.isArray(raw))fail('이벤트 설정 형식이 올바르지 않습니다.');
 for(const key of ['visible','enabled'])if(raw[key]!==undefined&&typeof raw[key]!=='boolean')fail('공개·운영 상태를 확인하세요.');
 const choices=Object.fromEntries(WISH_CHOICES.map(c=>[c.id,{rates:Object.fromEntries([...c.keys,'MISS'].map(k=>[k,num(raw.choices?.[c.id]?.rates?.[k],0,100,true)]))}]));
 const out={visible:raw.visible===true,enabled:raw.enabled===true,startsAt:date(raw.startsAt),endsAt:date(raw.endsAt),coinCost:num(raw.coinCost,1,1e12),ticketCost:num(raw.ticketCost,1,1000000),choices,duplicatePolicy:'EXCLUDE_OWNED'};
 if(out.startsAt&&out.endsAt&&Date.parse(out.endsAt)<=Date.parse(out.startsAt))fail('종료 일시는 시작 일시보다 뒤여야 합니다.');
 for(const c of Object.values(choices))if(Object.values(c.rates).reduce((a,n)=>a+(n??0),0)>100.000001)fail('종류별 등장확률 합계는 100% 이하여야 합니다.');
 if(out.enabled&&(!out.visible||!wishSettingsComplete(out)))fail('기간·비용·모든 종류의 확률 합계 100%를 설정하고 공개해야 운영할 수 있습니다.');
 return out;
}
export function wishSettingsComplete(s){return Boolean(s.startsAt&&s.endsAt&&s.coinCost&&s.ticketCost&&WISH_CHOICES.every(c=>{const v=Object.values(s.choices[c.id].rates);return v.every(n=>n!==null)&&Math.abs(v.reduce((a,n)=>a+n,0)-100)<1e-6&&c.keys.some(k=>s.choices[c.id].rates[k]>0)}))}
export function wishEventPhase(s,now=Date.now()){
 if(!s.visible)return 'HIDDEN';if(!wishSettingsComplete(s))return 'UNCONFIGURED';if(!s.enabled)return 'PAUSED';if(now<Date.parse(s.startsAt))return 'SCHEDULED';if(now>=Date.parse(s.endsAt))return 'ENDED';return 'OPEN';
}
export function wishChoicePool(settings,choiceId,ownedCodes=[]){
 const choice=WISH_CHOICES.find(c=>c.id===choiceId);if(!choice)throw new Error('보상 종류를 선택하세요.');
 const rates=settings.choices[choice.id].rates,owned=new Set(ownedCodes);
 const eligible=choice.keys.filter(k=>!(choice.id==='VEHICLE'&&owned.has(WISH_REWARDS[k].code)));
 const availableWeight=eligible.reduce((n,k)=>n+(rates[k]??0),0),winWeight=choice.keys.reduce((n,k)=>n+(rates[k]??0),0);
 return {id:choice.id,name:choice.name,available:availableWeight>0,missRate:rates.MISS,items:choice.keys.map(key=>({key,...WISH_REWARDS[key],owned:choice.id==='VEHICLE'&&owned.has(WISH_REWARDS[key].code),rate:rates[key]===null?null:eligible.includes(key)&&availableWeight>0?winWeight*rates[key]/availableWeight:0}))};
}
