// Shared by the permanent web edition and its Pages document router.
export const PREFIX='/onestore';
export const DOCUMENTS=Object.freeze([
  '/', '/world/', '/organization/', '/organization/faction/', '/master-star-mine/',
  '/equipment-forge/', '/equipment-polish/', '/loot-shop/', '/miracle-cube/',
  '/sss-miracle-cube/', '/mercenary-hangar/', '/mercenary-codex/',
  '/mercenary-codex/equipment/', '/mercenary-codex/leveling/',
  '/mercenary-codex/leveling/transfer.html', '/mercenary-codex/sss-reroll/',
  '/pet-codex/', '/pets/', '/pets/opening/', '/defense/', '/pve/legion-hunt/',
  '/pve-v3/', '/pve-v3/battle.html', '/raid/lich-king/', '/raid/madara/fragment.html',
  '/events/wish-lamp/', '/events/golden-axe/', '/events/chicken/', '/ui/growth-guide/'
]);
export function canonicalDocument(path){
  if(path===PREFIX||path.startsWith(PREFIX+'/'))path=path.slice(PREFIX.length)||'/';
  if(path.endsWith('/index.html'))path=path.slice(0,-10);
  if(!path.endsWith('/')&&!/\.[a-z0-9]+$/i.test(path))path+='/';
  return DOCUMENTS.includes(path)?path:null;
}
export function storeDocumentUrl(value,base='https://cnine-card.pages.dev/onestore/'){
  try{
    const url=new URL(value,base),origin=new URL(base).origin;
    if(url.origin!==origin)return null;
    const path=canonicalDocument(url.pathname);
    if(!path)return null;
    url.pathname=PREFIX+path;
    // A route name cannot recover one of the deliberately excluded screens.
    if(/^(prediction|prisoncamp|seasonPass|serverSupport|support|supportPackage)$/i.test(url.searchParams.get('screen')||''))url.searchParams.set('screen','home');
    return url.href;
  }catch{return null;}
}
