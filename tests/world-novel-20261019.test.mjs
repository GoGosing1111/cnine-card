import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {SCENES,CHAPTERS,CHARACTERS,BOOKS,COLLECTIONS,STORY_VERSION,STORAGE_KEY,HISTORY_KEY,readBookmark,saveBookmark,readHistory,completeBook,sceneFromHash,artUrl} from '../world/world.js';
const root=new URL('../',import.meta.url);
const file=p=>new URL(p.replace(/^\//,''),root);
const memory=()=>{const values=new Map();return {getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};};

test('every authored scene has a reachable chapter, real art, and identified dialogue speakers',()=>{
 assert.equal(SCENES.length,74);assert.equal(CHAPTERS.length,18);assert.equal(COLLECTIONS.length,3);
 assert.equal(new Set(SCENES.map(s=>s.id)).size,SCENES.length);
 for(const [i,chapter] of CHAPTERS.entries()){
  const first=SCENES.find(s=>s.id===chapter.start);assert.equal(first?.chapter,i,chapter.id);
  assert(SCENES.filter(s=>s.chapter===i).length>=3);
 }
 for(const scene of SCENES){
  assert(CHAPTERS[scene.chapter]);assert(fs.existsSync(file(artUrl(scene.art))),scene.art);
  assert(scene.lines.length>=5,scene.id);
  const speakers=scene.lines.filter(line=>typeof line==='object');assert(speakers.length>=1,scene.id);
  for(const line of speakers){assert(CHARACTERS[line.speaker],line.speaker);assert(line.text.trim());}
  for(const id of scene.cast){assert(CHARACTERS[id],id);if(CHARACTERS[id].image)assert(fs.existsSync(file(CHARACTERS[id].image)),id);}
 }
 const mercenaries=Object.values(CHARACTERS).filter(c=>c.code);assert.equal(mercenaries.length,23);
 const used=new Set(SCENES.flatMap(s=>[...s.cast,...s.lines.filter(l=>typeof l==='object').map(l=>l.speaker)]));
 assert(Object.entries(CHARACTERS).filter(([,c])=>c.code).every(([id])=>used.has(id)));
});

test('legacy scene links and partial reads survive, while old completions discover new chapters',()=>{
 const storage=memory();
 for(const id of ['request','no-record','outpost-brief','frozen-names','returning-call']){
  storage.setItem(STORAGE_KEY,JSON.stringify({version:1,sceneId:id,completed:false}));
  assert.equal(SCENES[readBookmark(storage).index].id,id);
  assert.equal(SCENES[sceneFromHash('#scene='+id)].id,id);
 }
 for(const sceneId of ['no-record','returning-call']){
  storage.setItem(STORAGE_KEY,JSON.stringify({version:1,sceneId,completed:true}));
  assert.equal(SCENES[readBookmark(storage).index].id,'empty-chair');assert.equal(readBookmark(storage).completed,false);
 }
 saveBookmark(storage,BOOKS.volume2.at(-1),true);assert.equal(readBookmark(storage).completed,true);
 assert.equal(JSON.parse(storage.getItem(STORAGE_KEY)).version,STORY_VERSION);
 for(const value of ['null','{',JSON.stringify({version:0,sceneId:'rewrite'}),JSON.stringify({version:STORY_VERSION,sceneId:'missing'})]){storage.setItem(STORAGE_KEY,value);assert.equal(readBookmark(storage),null);}
 const denied={getItem(){throw Error('denied');},setItem(){throw Error('quota');}};
 assert.equal(readBookmark(denied),null);assert.equal(saveBookmark(denied,0),false);assert.equal(saveBookmark(null,0),false);assert.equal(saveBookmark(storage,-1),false);
});

test('finishing one book does not complete other books or leak into unrelated interludes',()=>{
 const storage=memory(),history=readHistory(storage);
 assert.deepEqual(history.completed,[]);assert.equal(completeBook(storage,history,'volume1'),true);
 assert.deepEqual(readHistory(storage).completed,['volume1']);assert.equal(completeBook(storage,history,'missing'),false);
 assert.equal(SCENES[BOOKS.volume1.at(-1)].id,'next-signal');assert.equal(SCENES[BOOKS.volume2[0]].id,'outpost-brief');
 for(const [id,indexes] of Object.entries(BOOKS)){assert(indexes.every(i=>SCENES[i].book===id));assert.equal(new Set(indexes).size,indexes.length);}
 storage.setItem(HISTORY_KEY,JSON.stringify({completed:['volume1',null,'injected']}));assert.deepEqual(readHistory(storage).completed,['volume1']);
});

test('new generated surfaces and scene art match preserved originals and are consumed by runtime',()=>{
 const manifest=JSON.parse(fs.readFileSync(file('assets/ui/reverse-call/world-story-v3/manifest.json')));
 const html=fs.readFileSync(file('world/index.html'),'utf8');
 const sha=p=>createHash('sha256').update(fs.readFileSync(file(p))).digest('hex');
 assert.equal(manifest.assets.length,4);
 for(const a of manifest.assets){assert.equal(sha(a.original),a.sourceSha256);assert.equal(sha(a.runtime),a.sha256);}
 assert(html.includes('world-story-v3/button.webp'));assert(html.includes('world-story-v3/paper.webp'));
 assert(SCENES.some(s=>s.art==='commonRoom'));assert(SCENES.some(s=>s.art==='archive'));
 assert(!html.includes('world-story-v1/button.webp'));assert(!html.includes('world-story-v1/panel.webp'));
});
