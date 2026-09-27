import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import vm from 'node:vm';
import manifest from '../preview/avatar-clan-hanbok-v1/manifest.json' with {type:'json'};
import prior from '../preview/avatar-clan-hanbok-v1/before-images.json' with {type:'json'};
const root=new URL('../',import.meta.url),sha=b=>createHash('sha256').update(b).digest('hex');
test('all eight registered clan avatars retain their prepared masters and have complete lobby/equipment runtime assets',async()=>{
 assert.deepEqual(manifest.entries.map(e=>e.code).sort(),['T1_JOEUN','KANGGUYEOL_DK','FM_ORIKKUNG','FM_DIMWOOS','DC_HI_HEEYA','DK_NAMU_BONGSOON','LG_JUSEONG','LOTTE_AYOON'].sort());
 for(const e of manifest.entries){
  assert.equal(sha(await readFile(new URL(e.equipmentSource,root))),e.equipmentSha256);assert.equal(sha(await readFile(new URL(e.lobbySource,root))),e.lobbySha256);
  for(const [path,expected] of Object.entries(e.files)){const b=await readFile(new URL(path,root)),m=await sharp(b).metadata();assert.equal(sha(b),expected.sha256,path);assert.equal(b.length,expected.bytes);assert.equal(m.width,expected.width);assert.equal(m.height,expected.height);assert.equal(m.hasAlpha,expected.hasAlpha);}
  const old=await sharp(await readFile(new URL(prior.find(p=>p.code===e.code).equipment_image,root))).metadata();assert.equal(e.runtime.width,old.width);assert.equal(e.runtime.height,old.height);
  const {data,info}=await sharp(await readFile(new URL(e.equipmentImage,root))).ensureAlpha().raw().toBuffer({resolveWithObject:true});let clear=0,solid=0,border=0;
  for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){const a=data[(y*info.width+x)*4+3];if(a===0)clear++;if(a>=240)solid++;if(a>16&&(x===0||y===0||x===info.width-1||y===info.height-1))border++;}
  assert.ok(clear>info.width*info.height*.15,e.code+' real transparency');assert.ok(solid>info.width*info.height*.1,e.code+' visible body');assert.equal(border,0,e.code+' no edge clipping');
 }
});
test('the existing CMS avatar grant selector displays every hanbok portrait',async()=>{
 const source=await readFile(new URL('admin/avatar-grant.js',root),'utf8');
 const begin=source.indexOf("    $('avatar').onchange="),end=source.indexOf("    $('confirm').onchange=",begin);assert.ok(begin>=0&&end>begin);
 const elements=Object.fromEntries(['avatar','art','avatarName','portrait'].map(id=>[id,{removeAttribute(name){delete this[name];}}]));
 vm.runInNewContext(source.slice(begin,end),{avatars:manifest.entries,$:id=>elements[id]});
 for(const entry of manifest.entries){elements.avatar.value=entry.code;elements.avatar.onchange();assert.equal(elements.art.hidden,false);assert.equal(elements.portrait.src,'/'+entry.lobbyMobileImage,entry.code);assert.equal(elements.portrait.alt,entry.name);}
});
