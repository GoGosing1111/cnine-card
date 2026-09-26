// Local review policy. Fixed enemy stats never scale up with the selected party.
// No live economy, ownership, account or CMS setting is changed here.
export const CAPACITY = 12;
export const ENGINE_BASE = '0d67ae862a1f9763605ad7323e889acf5d51ad41';
export const DIFFICULTIES = Object.freeze([
  {id:'normal',name:'보통',power:32000,bossPower:350000,attack:100,shield:0,repeat:1,forced:7,limitMs:150000,dropChance:.28,dropLifeMs:9000,description:'완만한 압박 · 방벽 없는 보스'},
  {id:'hard',name:'어려움',power:150000,bossPower:1400000,attack:140,shield:12,repeat:2,forced:5,limitMs:150000,dropChance:.30,dropLifeMs:8000,description:'보스 방벽 · 2연속 공격'},
  {id:'nightmare',name:'악몽',power:420000,bossPower:4000000,attack:190,shield:25,repeat:3,forced:4,limitMs:135000,dropChance:.32,dropLifeMs:7500,description:'강한 방벽 · 3연속 공격 · 짧은 제한'},
  {id:'inferno',name:'지옥',power:900000,bossPower:9000000,attack:270,shield:40,repeat:4,forced:3,limitMs:120000,dropChance:.35,dropLifeMs:7000,description:'최상위 압박 · 4연속 공격 · 전멸 위험'}
].map(Object.freeze));
export const PARTIES=Object.freeze([
  {id:'rookie',name:'초급 원정대',cardPower:100000,suitPower:150000},
  {id:'standard',name:'표준 원정대',cardPower:200000,suitPower:300000},
  {id:'veteran',name:'강화 원정대',cardPower:400000,suitPower:600000}
].map(Object.freeze));
const generated='/preview/sustained-hunt-v2/assets/monsters/';
const scrap='/preview/scrapyard-v3-v1/assets/';
export const MONSTERS=Object.freeze([
  {id:'mantis',name:'잿불 사마귀',sprite:generated+'ember-mantis-sd-v2.png',power:1.05,height:235},
  {id:'mossback',name:'이끼등 석수',sprite:generated+'mossback-tortoise-sd-v2.png',power:1.15,height:240},
  {id:'bat',name:'청람 날개수',sprite:generated+'cobalt-bat-sd-v2.png',power:.86,height:235},
  {id:'gearjaw',name:'기어죠',sprite:scrap+'gearjaw-sd-v1.png',power:.9,height:245},
  {id:'breaker',name:'브레이커',sprite:scrap+'breaker-sd-v1.png',power:1.1,height:255},
  {id:'ravager',name:'래비저',sprite:scrap+'ravager-sd-v1.png',power:1,height:255},
  {id:'polarity',name:'극성 회수자',sprite:scrap+'polarity-sd-v1.png',power:1.12,height:255}
].map(Object.freeze));
export const BOSSES=Object.freeze([
  {id:'atlas',name:'철갑 거신 아틀라스',sprite:scrap+'atlas-sd-v1.png',power:.8,height:375},
  {id:'moloch',name:'용광 군주 몰록',sprite:scrap+'moloch-sd-v1.png',power:1,height:385},
  {id:'warden',name:'태고의 주조장 수호자',sprite:generated+'ancient-forge-warden-boss-sd-v2.png',power:1.35,height:420}
].map(Object.freeze));
export const LOOT_ITEMS=Object.freeze([
  {code:'REVIEW_SCRAP',name:'고철 부품',image:'/assets/ui/scrapyard/vehicle-part-frame-v1667.svg',rarity:'normal',weight:70},
  {code:'REVIEW_ENGINE',name:'정밀 엔진 부품',image:'/assets/ui/scrapyard/vehicle-part-engine-v1667.svg',rarity:'rare',weight:24},
  {code:'REVIEW_STAR',name:'별빛 결정',image:'/assets/ui/core-raid-rewards-v2/master-star.svg',rarity:'epic',weight:6}
].map(Object.freeze));
export function selectDifficulty(id='normal'){const row=DIFFICULTIES.find(d=>d.id===id);if(!row)throw Error('INVALID_HUNT_DIFFICULTY');return row;}
export function selectParty(id='standard'){const row=PARTIES.find(p=>p.id===id);if(!row)throw Error('INVALID_HUNT_PARTY');return row;}
export function crowdPosition(slot){if(!Number.isInteger(slot)||slot<0||slot>=CAPACITY)throw Error('INVALID_CROWD_SLOT');return {x:slot%3+(Math.floor(slot/3)%2)*.18,y:Math.floor(slot/3)};}
export function chooseDropPosition(random,previous=[],active=[]){
  // Continuous coordinates, independent from kill position; no fixed click spot.
  // Separate from combat RNG and never pre-published before the confirmed KO.
  for(let i=0;i<160;i++){
    const p={x:.09+random()*.82,y:.12+random()*.74};
    if(previous.slice(-2).every(q=>Math.hypot((p.x-q.x)*1.4,p.y-q.y)>.28)&&active.every(q=>Math.abs(p.x-q.x)>.24||Math.abs(p.y-q.y)>.18))return p;
  }
  return null; // Crowded field: wait for a vacancy, never stack hit targets.
}
