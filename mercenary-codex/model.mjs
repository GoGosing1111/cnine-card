export const RANKS=['C','B','A','S','SS','SSS'];
export const POSITIONS={FRONT:'전열',MIDDLE:'중열',REAR:'후열'};
export const FRAME='/assets/ui/card-frames/mercenary-contract-frame-premium-v2.png';
export const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function asset(path){if(typeof path!=='string'||!/^assets\/ui\/project-v\/[A-Za-z0-9_./-]+\.(png|webp|jpg|jpeg)$/.test(path)||path.split('/').includes('..'))throw Error('용병 리소스 경로를 확인하세요.');return '/'+path;}
export const thumb=code=>`/assets/ui/project-v/mercenaries/codex-v1/${code.toLowerCase()}-art-320.webp`;
export function validateCatalog(data){
  if(data?.version!=='mercenary-codex-2098'||!Number.isSafeInteger(data.revision)||!Array.isArray(data.cards)||!data.cards.length||new Set(data.cards.map(c=>c.code)).size!==data.cards.length)throw Error('용병 정보 형식을 확인하세요.');
  for(const c of data.cards){if(!/^V-\d{3}$/.test(c.code)||!c.name||!c.title||(!POSITIONS[c.position]&&!(c.artOnly===true&&c.position===null))||!data.roles?.[c.role]||(c.rank!==null&&!RANKS.includes(c.rank))||!Array.isArray(c.skills))throw Error('용병 설정을 확인하세요.');asset(c.sourceArt);if(c.battleSprite)asset(c.battleSprite);
    if(c.artOnly===true&&(c.basePower!==null||c.battleSprite!==null||c.skills.length||c.releaseStatus!=='ART_RELEASED'))throw Error('원화 공개 용병의 전투 정보는 아직 제공되지 않습니다.');
    for(const s of c.skills)if(!/^MS-\d{3}$/.test(s.id)||!s.name||!s.balance||typeof s.ready!=='boolean')throw Error('스킬 설정을 확인하세요.');
  }return data;
}
const normalize=value=>String(value||'').normalize('NFC').toLocaleLowerCase('ko').replace(/[\s_-]/g,'');
const initials=value=>[...value].map(c=>{const n=c.charCodeAt(0)-0xac00;return n>=0&&n<11172?'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'[Math.floor(n/588)]:c;}).join('');
export function filterCatalog(cards,filters,favorites){const query=normalize(filters.q);return cards.filter(c=>{
  const haystack=normalize([c.name,c.title,c.code,...c.skills.map(s=>s.name)].join(' '));
  return (!query||haystack.includes(query)||initials(haystack).includes(query))&&(!filters.position||filters.position===c.position)&&(!filters.rank||filters.rank===c.rank)&&(!filters.saved||favorites.has(c.code));
}).sort((a,b)=>filters.sort==='newest'?b.code.localeCompare(a.code):filters.sort==='name'?a.name.localeCompare(b.name,'ko'):filters.sort==='power'?(b.basePower||0)-(a.basePower||0)||a.code.localeCompare(b.code):a.code.localeCompare(b.code));}
