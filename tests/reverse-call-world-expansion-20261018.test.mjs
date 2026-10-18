import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {CHAPTERS,SCENES,SCENE_CHARACTERS,CHARACTERS,STORAGE_KEY,readBookmark,saveBookmark,artUrl,portraitUrl} from '../world/world.js';
import {STORY_REFERENCES} from '../world/expansion.js';
import {ORIGINAL_IP_MONSTERS} from '../shared/monster-original-ip-data-v1.mjs';
import {ALL_LIMITED_MERCENARIES} from '../shared/mercenary-limited-catalog-v1.mjs';
import {JINMU_ART} from '../shared/mercenary-jinmu-v1.mjs';
import {JOKRO_ART} from '../shared/mercenary-jokro-v1.mjs';

const read=async file=>readFile(new URL('../'+file.replace(/^\//,''),import.meta.url));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');

test('expanded story keeps ordered chapter links, existing scene IDs and actual game identities',async()=>{
  assert.equal(CHAPTERS.length,8);assert.equal(SCENES.length,33);
  assert.equal(new Set(SCENES.map(s=>s.id)).size,SCENES.length);
  assert.equal(SCENES[9].id,'no-record');assert.equal(SCENES[10].id,'outpost-brief');
  let previous=-1;
  for(const [index,chapter] of CHAPTERS.entries()){
    const start=SCENES.findIndex(scene=>scene.id===chapter.start);
    assert(start>previous);assert.equal(SCENES[start].chapter,index);previous=start;
    assert(SCENES.filter(s=>s.chapter===index).length>=3);
  }
  for(const scene of SCENES){
    assert(CHAPTERS[scene.chapter]);assert(scene.paragraphs.length>=2);
    await access(new URL('../'+artUrl(scene.art).slice(1),import.meta.url));
    const appearance=SCENE_CHARACTERS[scene.id];
    if(appearance){assert(CHARACTERS[appearance.character]);await access(new URL('../'+portraitUrl(CHARACTERS[appearance.character]).slice(1),import.meta.url));}
  }
  const text=SCENES.flatMap(s=>[s.title,...s.paragraphs]).join(' ');
  const roster=JSON.parse(await read('assets/ui/project-v/mercenaries/mercenary-system-roster-v1.json')).cards;
  const known=new Map([...roster,...ALL_LIMITED_MERCENARIES,JINMU_ART,JOKRO_ART].map(c=>[c.code,c.name]));
  for(const code of STORY_REFERENCES.mercenaries){assert(known.has(code),code);assert(text.includes(known.get(code)),known.get(code));}
  for(const key of STORY_REFERENCES.bosses){const boss=ORIGINAL_IP_MONSTERS.find(b=>b.key===key);assert(boss,key);assert(text.includes(boss.name),boss.name);}
  assert.doesNotMatch(text,/나가토|요리이치|이치고|서리한/);
});

test('a completed prologue resumes at the expansion without losing partial or completed progress',()=>{
  let value=null;const storage={getItem:()=>value,setItem:(_,v)=>{value=v;}};
  storage.setItem(STORAGE_KEY,JSON.stringify({version:1,sceneId:'no-record',completed:true}));
  assert.deepEqual(readBookmark(storage),{index:10,completed:false});
  saveBookmark(storage,5);assert.deepEqual(readBookmark(storage),{index:5,completed:false});
  saveBookmark(storage,22);assert.deepEqual(readBookmark(storage),{index:22,completed:false});
  saveBookmark(storage,32,true);assert.deepEqual(readBookmark(storage),{index:32,completed:true});
  assert.equal(readBookmark({getItem(){throw Error('denied');}}),null);
  assert.equal(saveBookmark({setItem(){throw Error('denied');}},20),false);
});

test('story images match archived sources and the new dialogue busts contain real transparency',async()=>{
  const manifest=JSON.parse(await read('assets/ui/reverse-call/world-story-v2/manifest.json'));
  assert.equal(manifest.files.length,16);
  for(const row of manifest.files){
    const bytes=await read(row.file);assert.equal(hash(bytes),row.sha256,row.id);
    assert.equal(hash(await read(row.source)),row.sourceSha256,row.source);
    if(row.key)assert.equal(row.sourceSha256.toUpperCase(),ORIGINAL_IP_MONSTERS.find(b=>b.key===row.key).sourceSha256);
    if(row.type!=='generated-dialogue-cutout')continue;
    const {data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    let clear=0;for(let i=3;i<data.length;i+=info.channels)if(data[i]<10)clear++;
    assert(clear/(info.width*info.height)>.2,row.id+' transparent silhouette');
  }
});
