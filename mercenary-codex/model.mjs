import {REVAN_CODE,REVAN_COMBAT,REVAN_ART} from '../shared/mercenary-revan-v1.mjs';
import {BLOODMOON_COMBAT} from '../shared/mercenary-bloodmoon-combat-v1.mjs';
import {BLACKCROWN_CODEX_DETAILS} from '../shared/mercenary-blackcrown-codex-v2.mjs';
import {BLACKCROWN_SERVER_LIMIT} from '../shared/mercenary-blackcrown-catalog-v1.mjs?codex=20261027-live-v1';
import {AWAKENED_OMEGA_CODE,AWAKENED_OMEGA_SKILLS} from '../shared/mercenary-awakened-omega-v1.mjs';
import {RAZAK_CODE,RAZAK_COMBAT,RAZAK_SKILLS} from '../shared/mercenary-razak-v1.mjs?v=20261025-bloodmoon-expansion-v1';
import {NAMSUDAENG_CODE,NAMSUDAENG_SKILLS} from '../shared/mercenary-bloodmoon-namsudaeng-v1.mjs';
import {EUNSEOL_CODE,EUNSEOL_COMBAT,EUNSEOL_AREA_SKILL} from '../shared/mercenary-eunseol-v1.mjs';
import {CRYVERN_CODE} from '../shared/mercenary-cryvern-v1.mjs';
import {BLOODMOON_CODES,BLOODMOON_SERVER_LIMIT,BLOODMOON_BASE_POWER} from '../shared/mercenary-bloodmoon-catalog-v1.mjs';
import {AZANT_CODE} from '../shared/mercenary-azant-v1.mjs';
import {JOKRO_PACK_SERVER_LIMIT} from '../shared/mercenary-jokro-v1.mjs?jokroPower=20261025-v3&codexStock=20261023-halloween-stock-v1';
export const RANKS=['C','B','A','S','SS','SSS'];
export const POSITIONS={FRONT:'전열',MIDDLE:'중열',REAR:'후열'};
export const FRAME='/assets/ui/card-frames/mercenary-contract-frame-premium-v2.png';
export const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function asset(path){if(typeof path!=='string'||!/^assets\/ui\/(?:project-v\/[A-Za-z0-9_./-]+\.(?:png|webp|jpg|jpeg)|packs\/black-crown-20261027-v1\/v-95[0-5]-(?:320|640)\.webp)$/.test(path)||path.split('/').includes('..'))throw Error('용병 리소스 경로를 확인하세요.');return '/'+path;}
export const thumb=code=>`/assets/ui/project-v/mercenaries/codex-v1/${code.toLowerCase()}-art-320.webp`;
export function validateCatalog(data){
  if(data?.version!=='mercenary-codex-2098'||!Number.isSafeInteger(data.revision)||!Array.isArray(data.cards)||!data.cards.length||new Set(data.cards.map(c=>c.code)).size!==data.cards.length)throw Error('용병 정보 형식을 확인하세요.');
  for(const c of data.cards){const titleDeferred=c.edition==='LIMITED'&&c.titleStatus==='DEFERRED_BY_USER';if(!/^V-\d{3}$/.test(c.code)||!c.name||((c.code===CRYVERN_CODE||titleDeferred)?c.title!=='':c.code===AZANT_CODE?typeof c.title!=='string':!c.title)||(!POSITIONS[c.position]&&!(c.artOnly===true&&c.position===null))||!data.roles?.[c.role]||(c.rank!==null&&!RANKS.includes(c.rank))||!Array.isArray(c.skills))throw Error('용병 설정을 확인하세요.');asset(c.sourceArt);if(c.thumbnailArt)asset(c.thumbnailArt);if(c.displayArt)asset(c.displayArt);if(c.battleSprite)asset(c.battleSprite);
    if(c.code===RAZAK_CODE&&(c.name!=='라자크'||c.rank!=='SSS'||c.edition!=='STANDARD'||c.basePower!==RAZAK_COMBAT.basePower||c.acquisition!=='BLOODMOON_PACK'||c.acquisitionEnabled!==false||c.packAcquisitionEnabled!==true||c.skills.length!==3||c.skills.some((s,i)=>s.id!==RAZAK_SKILLS[i].id)))throw Error('라자크의 승인 등급·전투력·블러드문팩 전용 획득을 확인하세요.');
    if(c.edition==='LIMITED'){
      const blackcrown=BLACKCROWN_CODEX_DETAILS[c.code];
      const blackcrownReady=Boolean(blackcrown)&&c.season==='BLACKCROWN'&&c.rank==='SS'&&c.artOnly===false&&c.releaseStatus==='BATTLE_RELEASED'&&c.acquisition==='BLACKCROWN_PACK'&&c.acquisitionEnabled===true&&c.packAcquisitionEnabled===true&&c.deploymentEnabled===true&&c.serverLimit===BLACKCROWN_SERVER_LIMIT&&c.basePower===356400&&c.battleSprite===blackcrown.battleSprite&&c.skills.length===2&&c.skills.every((s,i)=>s.id===blackcrown.skills[i].id&&s.ready===true&&s.codexOnly===false&&JSON.stringify(s.balance)===JSON.stringify(blackcrown.skills[i].balance))&&c.battlePresentation?.facing==='RIGHT_TOWARD_ENEMY'&&c.battlePresentation?.motionSpeed===2;
      if((blackcrown||c.season==='BLACKCROWN')&&!blackcrownReady)throw Error('블랙크라운 도감의 스킬·전투 준비 상태를 확인하세요.');
      const awakenedOmegaReady=c.code===AWAKENED_OMEGA_CODE&&c.name==='각성 오메가'&&c.rank==='SSS'&&c.basePower===1750000&&c.releaseStatus==='CRAFT_ONLY_LOCKED'&&c.acquisition==='CRAFT_ONLY'&&c.artOnly===false&&c.deploymentEnabled===true&&c.acquisitionEnabled===false&&c.craftAcquisitionEnabled===false&&c.packAcquisitionEnabled===false&&c.skills.length===4&&c.skills.every((s,i)=>s.id===AWAKENED_OMEGA_SKILLS[i].id&&s.ready===true);
      if(c.code===AWAKENED_OMEGA_CODE&&!awakenedOmegaReady)throw Error('각성 오메가의 등급·전투력·제작 잠금을 확인하세요.');
      const namsudaengReady=c.code===NAMSUDAENG_CODE&&c.season==='BLOODMOON'&&c.rank==='SS'&&c.artOnly===false&&c.releaseStatus==='BATTLE_RELEASED_PACK_PENDING'&&c.acquisition==='BLOODMOON_PACK'&&c.acquisitionEnabled===false&&c.packAcquisitionEnabled===true&&c.deploymentEnabled===true&&c.packOpeningEnabled===false&&c.serverLimit===BLOODMOON_SERVER_LIMIT&&c.basePower===356400&&c.skills.length===3&&c.skills.every((s,i)=>s.id===NAMSUDAENG_SKILLS[i].id&&s.ready===true);
      const bloodmoonReady=Object.hasOwn(BLOODMOON_COMBAT,c.code)&&c.season==='BLOODMOON'&&c.rank==='SS'&&c.artOnly===false&&c.releaseStatus==='BATTLE_RELEASED_PACK_PENDING'&&c.acquisition==='BLOODMOON_PACK'&&c.acquisitionEnabled===false&&c.packAcquisitionEnabled===true&&c.deploymentEnabled===true&&c.packOpeningEnabled===false&&c.serverLimit===BLOODMOON_SERVER_LIMIT&&c.basePower===BLOODMOON_BASE_POWER&&c.skills.length===1&&c.skills[0].ready===true&&c.skills[0].id===BLOODMOON_COMBAT[c.code].skill.id;
      if(bloodmoonReady&&(!c.battleSpriteViewport||['x','y','width','height','imageWidth','imageHeight'].some(k=>!Number.isFinite(c.battleSpriteViewport[k])||c.battleSpriteViewport[k]<0)||['width','height','imageWidth','imageHeight'].some(k=>c.battleSpriteViewport[k]===0)))throw Error('블러드문 전신 표시 영역을 확인하세요.');
      const battleReady=c.releaseStatus==='OWNER_PACK_CONTROLLED'&&(c.season==='HALLOWEEN'||c.code==='V-989'||c.code==='V-979')&&c.deploymentEnabled===true&&Number.isSafeInteger(c.basePower)&&c.basePower>0&&c.skills.length>0;
      const jokroReady=c.code==='V-979'&&battleReady&&c.artOnly===false&&c.packAcquisitionEnabled===true&&c.exclusiveGrant===false&&c.excludedFromLimitedCount===false&&c.serverLimit===JOKRO_PACK_SERVER_LIMIT&&c.skills.length===1;
      const leonelReady=c.code==='V-978'&&c.releaseStatus==='BATTLE_RELEASED_ACQUISITION_LOCKED'&&c.artOnly===false&&c.acquisition==='LOCKED'&&c.deploymentEnabled===true&&Number.isSafeInteger(c.basePower)&&c.basePower>=2300000&&c.skills.length===1;
      const shiranuiReady=c.code==='V-987'&&c.releaseStatus==='RANK_REWARD_RELEASED'&&c.acquisition==='ACCOUNT_RANK_REWARD'&&c.minimumAccountLevel===235&&c.artOnly===false&&c.acquisitionEnabled===true&&c.packAcquisitionEnabled===false&&c.deploymentEnabled===true&&Number.isSafeInteger(c.basePower)&&c.basePower>0&&c.skills.length===1;
      const revanReady=c.code===REVAN_CODE&&c.name==='레반'&&c.rank==='SSS'&&c.releaseStatus==='BATTLE_RELEASED_ACQUISITION_LOCKED'&&c.artOnly===false&&c.acquisition==='LOCKED'&&c.deploymentEnabled===true&&c.basePower===REVAN_COMBAT.basePower&&c.acquisitionEnabled===false&&c.packAcquisitionEnabled===false&&c.craftAcquisitionEnabled===false&&c.skills.length===4&&c.skills.every((skill,i)=>skill.id===REVAN_ART.skills[i].id&&skill.ready===true&&JSON.stringify(skill.balance)===JSON.stringify(REVAN_ART.skills[i].balance));
      if(c.code===REVAN_CODE&&!revanReady)throw Error('레반의 승인 전투력·스킬·획득 잠금을 확인하세요.');
      const eunseolReady=c.code===EUNSEOL_CODE&&c.releaseStatus==='BATTLE_RELEASED_ACQUISITION_LOCKED'&&c.artOnly===false&&c.acquisition==='LOCKED'&&c.deploymentEnabled===true&&c.basePower===EUNSEOL_COMBAT.basePower&&c.acquisitionEnabled===false&&c.packAcquisitionEnabled===false&&c.skills.length===1&&c.skills[0].id===EUNSEOL_AREA_SKILL.id;
      const generalJokReady=c.code==='V-974'&&c.releaseStatus==='BATTLE_RELEASED_ACQUISITION_LOCKED'&&c.artOnly===false&&c.acquisition==='LOCKED'&&c.deploymentEnabled===true&&c.basePower===2700000&&c.packAcquisitionEnabled===false&&c.skills.length===8;
      const primeReady=c.code==='V-975'&&c.releaseStatus==='BATTLE_RELEASED_ACQUISITION_LOCKED'&&c.artOnly===false&&c.acquisition==='LOCKED'&&c.deploymentEnabled===true&&c.basePower===3000000&&c.packAcquisitionEnabled===false&&c.skills.length===7;
      const zeroReady=c.code==='V-976'&&c.releaseStatus==='BATTLE_RELEASED_ACQUISITION_LOCKED'&&c.artOnly===false&&c.acquisition==='LOCKED'&&c.deploymentEnabled===true&&c.basePower===3000000&&c.packAcquisitionEnabled===false&&c.skills.length===5;
      if(!blackcrownReady&&!awakenedOmegaReady&&!namsudaengReady&&!revanReady&&!eunseolReady&&!generalJokReady&&!bloodmoonReady&&!jokroReady&&!primeReady&&!zeroReady&&!leonelReady&&!shiranuiReady&&(c.artOnly!==true||(!battleReady&&(c.basePower!==null||c.skills.length||c.releaseStatus!=='LIMITED_PREVIEW'))||c.acquisitionEnabled!==false||typeof c.deploymentEnabled!=='boolean'))throw Error('리미티드 획득 정보는 조회만 가능합니다.');
      if(c.acquisitionEnabled!==false&&!blackcrownReady&&!shiranuiReady)throw Error('리미티드 획득은 잠금 상태입니다.');
      asset(c.frame);if(!c.artWindow||['left','top','width','height'].some(k=>!Number.isFinite(c.artWindow[k])||c.artWindow[k]<0||c.artWindow[k]>100))throw Error('리미티드 프레임 배치를 확인하세요.');
    }else if(c.artOnly===true&&(c.basePower!==null||c.battleSprite!==null||c.skills.length||c.releaseStatus!=='ART_RELEASED'))throw Error('원화 공개 용병의 전투 정보는 아직 제공되지 않습니다.');
    for(const s of c.skills)if(!/^MS-\d{3}$/.test(s.id)||!s.name||!s.balance||typeof s.ready!=='boolean')throw Error('스킬 설정을 확인하세요.');
  }return data;
}
const normalize=value=>String(value||'').normalize('NFC').toLocaleLowerCase('ko').replace(/[\s_-]/g,'');
const initials=value=>[...value].map(c=>{const n=c.charCodeAt(0)-0xac00;return n>=0&&n<11172?'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'[Math.floor(n/588)]:c;}).join('');
export function filterCatalog(cards,filters,favorites){const query=normalize(filters.q);return cards.filter(c=>{
  const haystack=normalize([c.name,c.title,c.code,...c.skills.map(s=>s.name)].join(' '));
  return (!query||haystack.includes(query)||initials(haystack).includes(query))&&(!filters.position||filters.position===c.position)&&(!filters.rank||filters.rank===c.rank)&&(!filters.saved||favorites.has(c.code));
}).sort((a,b)=>filters.sort==='newest'?b.code.localeCompare(a.code):filters.sort==='name'?a.name.localeCompare(b.name,'ko'):filters.sort==='power'?(b.basePower||0)-(a.basePower||0)||a.code.localeCompare(b.code):a.code.localeCompare(b.code));}
