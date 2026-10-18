import { MAIN_CHAPTERS, MAIN_SCENES } from './story-main.js';
import { RAID_CHAPTERS, RAID_SCENES, RAID_ART } from './story-raids.js';
import { INTERLUDE_CHAPTERS, INTERLUDE_SCENES } from './story-interludes.js';
export { CHARACTERS } from './story-characters.js';
export const STORY_VERSION = 3;
export const ASSET_ROOT = '/assets/ui/reverse-call/world-story-v1/';
export const STORAGE_KEY = 'reverse-call:world-story:v1';
export const HISTORY_KEY = 'reverse-call:world-story:history:v3';
export const COLLECTIONS = Object.freeze([
  {id:'volume1',label:'1부 · 최초의 호출',title:'돌아올 사람의 자리',description:'누군가를 데려온 밤, 다른 한 사람의 이름이 사라졌다. 같은 의뢰서에 서명한 용병들은 서로 다른 이유로 다시 문 앞에 선다.'},
  {id:'volume2',label:'2부 · 돌아온 자들',title:'같은 의뢰서의 다음 장',description:'회랑에서 끊긴 목소리를 따라 세 전선과 얼음 왕좌, 검은 전장, 코어로. 함께 싸운다는 것이 같은 판단을 한다는 뜻은 아니었다.'},
  {id:'interludes',label:'용병 이야기',title:'임무가 끝난 뒤에도',description:'꿰매다 만 검집, 기다리는 저녁, 돌려받지 못한 편지. 전장에서 다 하지 못한 말들이 생활 속에서 조금씩 이어진다. 1부 이후의 이야기입니다.'}
]);
export const CHAPTERS = Object.freeze([
  ...MAIN_CHAPTERS.map(c=>({...c,collection:'volume1',book:'volume1'})),
  ...RAID_CHAPTERS.map(c=>({...c,collection:'volume2',book:'volume2'})),
  ...INTERLUDE_CHAPTERS.map(c=>({...c,collection:'interludes',book:c.id}))
]);
const positions={orze:'50% 0%',renzo:'50% 40%',zeno:'50% 55%',isgen:'50% 0%',varsen:'50% 45%',cedric:'50% 22%',valter:'50% 0%',helios:'50% 0%'};
export const SCENES = Object.freeze([
  ...MAIN_SCENES,
  ...RAID_SCENES.map(s=>({...s,chapter:s.chapter+MAIN_CHAPTERS.length})),
  ...INTERLUDE_SCENES.map(s=>({...s,chapter:s.chapter+MAIN_CHAPTERS.length+RAID_CHAPTERS.length}))
].map(s=>({...s,position:positions[s.art]||'50% 42%',book:CHAPTERS[s.chapter].book,paragraphs:s.lines.map(line=>typeof line==='string'?line:line.text)})));
export const BOOKS = Object.freeze(Object.fromEntries([...new Set(SCENES.map(s=>s.book))].map(id=>[id,SCENES.map((s,i)=>s.book===id?i:-1).filter(i=>i>=0)])));
export const SCENE_CHARACTERS = Object.freeze(Object.fromEntries(SCENES.filter(s=>s.cast.length).map(s=>[s.id,{character:s.cast[0]}])));
export function artUrl(id) {
  if (['commonRoom','archive'].includes(id)) return `/assets/ui/reverse-call/world-story-v3/${id}.webp`;
  return RAID_ART[id] || `${ASSET_ROOT}${id}.webp`;
}
export function portraitUrl(character) { return character?.image || ''; }
export function collectionOf(index) { return CHAPTERS[SCENES[index]?.chapter]?.collection || 'volume1'; }
export function readingMinutes(scenes) {
  return Math.max(1,Math.ceil(scenes.reduce((sum,scene)=>sum+scene.paragraphs.join('').replace(/\s/g,'').length,0)/350));
}
export function readBookmark(storage) {
  try {
    const value=JSON.parse(storage.getItem(STORAGE_KEY));
    if(![1,2,STORY_VERSION].includes(value?.version)||typeof value.sceneId!=='string')return null;
    const index=SCENES.findIndex(s=>s.id===value.sceneId);
    if(index<0)return null;
    if(value.version!==STORY_VERSION&&value.completed===true) return {index:SCENES.findIndex(s=>s.id==='empty-chair'),completed:false};
    return {index,completed:value.completed===true};
  } catch {return null;}
}
export function saveBookmark(storage,index,completed=false) {
  if(!Number.isInteger(index)||!SCENES[index])return false;
  try {storage.setItem(STORAGE_KEY,JSON.stringify({version:STORY_VERSION,sceneId:SCENES[index].id,completed}));return true;}catch{return false;}
}
export function readHistory(storage) {
  try {
    const value=JSON.parse(storage.getItem(HISTORY_KEY));
    return {completed:Array.isArray(value?.completed)?value.completed.filter(id=>typeof id==='string'&&Object.hasOwn(BOOKS,id)):[]};
  } catch {return {completed:[]};}
}
export function completeBook(storage,history,book) {
  if(!Object.hasOwn(BOOKS,book))return false;
  history.completed=[...new Set([...history.completed,book])];
  try {storage.setItem(HISTORY_KEY,JSON.stringify(history));return true;}catch{return false;}
}
export function sceneFromHash(hash) {
  const id=new URLSearchParams(String(hash||'').replace(/^#/, '')).get('scene');
  return SCENES.findIndex(scene=>scene.id===id);
}
