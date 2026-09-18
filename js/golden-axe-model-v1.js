export const AXE_KEY='pingdu_golden_axe_v1';
export const OLD_AXE='PINGDU_OLD_AXE';
export const SUPERSTAR_13='SUPERSTAR_UPGRADE_13_TICKET';
export const PARTS_CHOICE='VEHICLE_PARTS_150_CHOICE';
export const AXE_ASSETS='/assets/ui/events/golden-axe-v1/';
export const AXE_PARTS=Object.freeze([
 {code:'VEHICLE_PART_TIRE',name:'타이어 부품',image:'/assets/ui/workshop/vehicle-part-tire-v1668.png'},
 {code:'VEHICLE_PART_FRAME',name:'프레임 부품',image:'/assets/ui/workshop/vehicle-part-frame-v1668.png'},
 {code:'VEHICLE_PART_ENGINE',name:'엔진 부품',image:'/assets/ui/workshop/vehicle-part-engine-v1668.png'}
]);
export const AXE_REWARDS=Object.freeze([
 {key:'F_BODY',name:'F-BODY',kind:'EQUIPMENT',code:'BATTLE_SUIT_02',image:'/assets/ui/project-v/account-battle-suits/suits/battle-suit-appearance-02-orange-tactical-v1.png',tag:'배틀슈트',detail:'F-BODY 외형 1개를 장비함에 지급합니다. 자동 장착하지 않습니다.'},
 {key:'G_BODY',name:'G-BODY',kind:'EQUIPMENT',code:'BATTLE_SUIT_03',image:'/assets/ui/project-v/account-battle-suits/suits/battle-suit-appearance-03-amethyst-exosuit-v1.png',tag:'배틀슈트',detail:'G-BODY 외형 1개를 장비함에 지급합니다. 자동 장착하지 않습니다.'},
 {key:'H_BODY',name:'H-BODY',kind:'EQUIPMENT',code:'BATTLE_SUIT_H_BODY',image:'/assets/items/h-body-v2066.png',tag:'배틀슈트',detail:'H-BODY 외형 1개를 장비함에 지급합니다. 자동 장착하지 않습니다.'},
 {key:'COIN_500',name:'500억 코인',kind:'COIN',amount:50000000000,image:AXE_ASSETS+'coin.svg',tag:'코인',detail:'50,000,000,000 코인을 즉시 지급합니다.'},
 {key:'COIN_1500',name:'1500억 코인',kind:'COIN',amount:150000000000,image:AXE_ASSETS+'coin.svg',tag:'코인',detail:'150,000,000,000 코인을 즉시 지급합니다.'},
 {key:'COIN_3000',name:'3000억 코인',kind:'COIN',amount:300000000000,image:AXE_ASSETS+'coin.svg',tag:'코인',detail:'300,000,000,000 코인을 즉시 지급합니다.'},
 {key:'MERCENARY_S',name:'S용병 랜덤카드',kind:'MERCENARY',image:AXE_ASSETS+'mercenary-s.svg',tag:'S 등급',detail:'현재 운영 S등급 용병 중 1장을 같은 확률로 즉시 지급합니다. 중복 용병도 1장으로 지급됩니다.'},
 {key:'SUPERSTAR_13',name:'슈퍼스타 +13 강화권',kind:'ITEM',code:SUPERSTAR_13,image:AXE_ASSETS+'upgrade-13.svg',tag:'확정 강화',detail:'보유한 슈퍼스타 카드 1종을 선택해 +13으로 확정 강화합니다. 인벤토리에서 사용하며 중복 카드·별·코인을 소모하지 않습니다.'},
 {key:'PARTS_150',name:'차량부품 150개 택 1',kind:'ITEM',code:PARTS_CHOICE,image:'/assets/ui/workshop/vehicle-part-engine-v1668.png',tag:'선택권',detail:'선택권 1개를 즉시 지급합니다. 인벤토리에서 타이어·프레임·엔진 부품 중 하나를 골라 150개를 받으세요.'},
 {key:'ADVANCEMENT',name:'전직패스권',kind:'ITEM',code:'UNIQUE_ADVANCEMENT_PASS',image:'/assets/items/unique-advancement-pass-v2043.svg',tag:'전직',detail:'전직패스권 1개를 즉시 지급합니다. 카드 상세의 고유효과 전직에서 사용할 수 있습니다.'},
 {key:'MISS',name:'꽝',kind:'MISS',image:AXE_ASSETS+'old-axe.svg',tag:'보상 없음',detail:'이번에는 획득한 상품이 없습니다. 참가에 사용한 낡은도끼는 소모됩니다.'}
]);
export function cleanAxeSettings(raw={}){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('이벤트 설정 형식을 확인하세요.');
 const number=(value,min,max,rate=false)=>{if(value===undefined||value===null||value==='')return null;if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max||(!rate&&!Number.isSafeInteger(value))||(rate&&Math.abs(value*10000-Math.round(value*10000))>1e-6))throw Error('수량·확률의 범위를 확인하세요. 확률은 소수점 4자리까지 입력할 수 있습니다.');return value;};
 const date=value=>{if(value===undefined||value===null||value==='')return null;const m=typeof value==='string'&&value.match(/^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)(?::(\d\d)(?:\.\d{1,3})?)?(Z|[+-]\d\d:\d\d)$/);if(!m||!Number.isFinite(Date.parse(value))||+m[2]<1||+m[2]>12||+m[3]<1||+m[3]>new Date(Date.UTC(+m[1],+m[2],0)).getUTCDate()||+m[4]>23||+m[5]>59||+(m[6]||0)>59)throw Error('시간대가 포함된 올바른 일시를 입력하세요.');return new Date(value).toISOString();};
 for(const flag of ['visible','enabled'])if(raw[flag]!==undefined&&typeof raw[flag]!=='boolean')throw Error('공개·운영 상태를 확인하세요.');
 const rates=Object.fromEntries(AXE_REWARDS.map(r=>[r.key,number(raw.rates?.[r.key],0,100,true)]));
 const settings={visible:raw.visible===true,enabled:raw.enabled===true,startsAt:date(raw.startsAt),endsAt:date(raw.endsAt),axeCost:number(raw.axeCost,1,1000000),dailyLimit:number(raw.dailyLimit,0,100000),rates};
 if(settings.startsAt&&settings.endsAt&&Date.parse(settings.endsAt)<=Date.parse(settings.startsAt))throw Error('종료 일시는 시작 일시보다 뒤여야 합니다.');
 if(Object.values(rates).reduce((sum,n)=>sum+Math.round((n??0)*10000),0)>1000000)throw Error('상품과 꽝의 확률 합계는 100% 이하여야 합니다.');
 if(settings.enabled&&(!settings.visible||!axeSettingsComplete(settings)))throw Error('기간·낡은도끼 수량·일일 횟수·모든 확률을 설정하고 공개해야 ON으로 저장할 수 있습니다.');
 return settings;
}
export function axeSettingsComplete(s){const rates=Object.values(s.rates);return Boolean(s.startsAt&&s.endsAt&&s.axeCost&&s.dailyLimit!==null&&rates.length===AXE_REWARDS.length&&rates.every(n=>n!==null)&&rates.reduce((sum,n)=>sum+Math.round(n*10000),0)===1000000&&AXE_REWARDS.some(r=>r.key!=='MISS'&&s.rates[r.key]>0));}
export function axePhase(s,now=Date.now()){if(!s.visible)return 'HIDDEN';if(!axeSettingsComplete(s))return 'UNCONFIGURED';if(!s.enabled)return 'PAUSED';if(now<Date.parse(s.startsAt))return 'SCHEDULED';if(now>=Date.parse(s.endsAt))return 'ENDED';return 'OPEN';}
export function pickAxeReward(settings,sample){if(!Number.isInteger(sample)||sample<0||sample>=1000000)throw Error('잘못된 추첨 값입니다.');let remaining=sample;for(const reward of AXE_REWARDS){remaining-=Math.round(settings.rates[reward.key]*10000);if(remaining<0)return reward;}throw Error('확률 합계가 맞지 않습니다.');}
