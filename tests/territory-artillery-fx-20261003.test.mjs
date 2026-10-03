import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import sharp from 'sharp';
import {BaseBattleEngine} from '../preview/project-v-v3/source/battle/BattleEngine.js';
const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
const asset='assets/ui/territory-war/artillery-fx-v1/';
const hash=b=>createHash('sha256').update(b).digest('hex');

test('shipped atlases retain generated alpha, unique authored frames and preserved source hashes',async()=>{
 const manifest=JSON.parse(read(asset+'manifest.json'));
 for(const [key,spec] of Object.entries(manifest.assets)){
  const source=readFileSync(new URL('../'+asset+spec.source,import.meta.url)),output=readFileSync(new URL('..'+spec.url,import.meta.url));
  assert.equal(hash(source),spec.sourceSha256,key+' original');assert.equal(hash(output),spec.sha256,key+' deployed texture');
  const {data,info}=await sharp(output).ensureAlpha().raw().toBuffer({resolveWithObject:true});let empty=0,visible=0,soft=0;
  for(let i=3;i<data.length;i+=info.channels){if(!data[i])empty++;else visible++;if(data[i]>0&&data[i]<255)soft++;}
  assert.ok(empty>info.width*info.height*.2,key+' genuinely transparent backdrop');assert.ok(visible>1000&&soft>100,key+' visible art with alpha edges');
  if(spec.frames){
   assert.equal(spec.frames.length,key==='projectile'?8:16);assert.equal(new Set(spec.frames.map(f=>f.sha256)).size,spec.frames.length);
   assert.equal(info.width,spec.cell*spec.columns);assert.equal(info.height,spec.cell*spec.rows);
  }
 }
});

function battlefieldHarness(){
 const calls=[],enter={},map={dataset:{},classList:{add(){}}},target={},body={classList:{toggle(){},remove(){}}};
 class Renderer{attach(){}setEnabled(){}setPaused(){}clear(){}destroy(){}play(type,side){calls.push({type,side});}}
 const context={console,CNineTerritoryArtilleryFx:Renderer,document:{hidden:false,body,querySelector:()=>null},localStorage:{getItem:()=>null},setTimeout:()=>1,clearTimeout(){}};
 const root={querySelector:s=>s==='.tw4-map-shell'?map:s==='.tw6-canvas-mount'?target:null,querySelectorAll:s=>s==='[data-tw6-enter]'?[enter]:[]};
 vm.runInNewContext(read('js/territory-battlefield-v5.js'),context);
 const api=context.CNineTerritoryBattlefield,state={round:{id:7,status:'ACTIVE'},front:{id:2},truce:{active:false},battlefield:{events:[]}};
 return {api,root,state,calls,enter};
}
test('server cannon events fire once, charge does not become a fake shot, and entry history is not replayed',()=>{
 const {api,root,state,calls,enter}=battlefieldHarness();
 state.battlefield.events=[{id:1,type:'CANNON_FIRED',side:'B',created_at_ms:Date.now()}];api.attach(root,state);enter.onclick();assert.equal(calls.length,0);
 state.battlefield.events.unshift({id:2,type:'SIEGE_CANNON',side:'A',created_at_ms:Date.now()});api.attach(root,state);assert.equal(calls.length,1);assert.equal(calls[0].type,'SIEGE_CANNON');
 state.battlefield.events.unshift({id:3,type:'CANNON_FIRED',side:'A',created_at_ms:Date.now()});api.attach(root,state);api.attach(root,state);
 assert.deepEqual(calls,[{type:'SIEGE_CANNON',side:'A'},{type:'CANNON_FIRED',side:'A'}]);
 state.front.id=3;api.attach(root,state);enter.onclick();assert.equal(calls.length,2,'new front seeds history');api.dispose();
});

function singletonHarness(gate=Promise.resolve()){
 const made=[];
 class Engine{
  constructor(options={}){Object.assign(this,options);made.push(this);this.visible=false;this.playing=false;this.disposed=false;}
  async mount(){if(this.effectScene)await gate;this.mounted=true;return this;}
  attachTo(target){this.host=target;return this;}
  destroy(){this.disposed=true;this.mounted=false;}
  setAccountBattleUnitPreviewFireHook(){}
  resetSession(payload,target){this.battleData=payload;this.host=target;return this;}
 }
 const context={window:{},document:{getElementById:()=>({})},BattleEngine:Engine,ExpeditionBattleEngine:Engine,createEffectScene:host=>new Engine({host,effectScene:true}),Assets:{},Container:class{},Graphics:class{},Sprite:class{},Texture:class{},Rectangle:class{}};
 const source=read('preview/project-v-v3/source/project-v-pixi-battle.src.js').replace(/^import .*;\r?\n/gm,'').replace(/^export \{.*\};\s*$/m,'');
 vm.runInNewContext(source,context);return {api:context.window.ProjectVPixiBattle,made};
}
test('shared renderer hands off effect scene to combat and never lets ambient effects replace visible combat',async()=>{
 const {api,made}=singletonHarness(),field={id:'field'},battle={id:'battle'};
 const effect=await api.mountEffectScene(field);assert.equal(await api.mountEffectScene(field),effect);assert.equal(made.length,1);
 const combat=await api.mountForBattle({title:'territory'},battle);assert.equal(effect.disposed,true);assert.equal(combat.effectScene,undefined);combat.visible=true;
 assert.equal(await api.mountEffectScene(field),null);api.releaseEffectScene(effect);assert.equal(combat.disposed,false,'stale owner cannot release current combat');
 combat.visible=false;const resumed=await api.mountEffectScene(field);assert.equal(combat.disposed,true);assert.equal(resumed.effectScene,true);api.destroy();
});
test('personal battle waits for pending effect mount and owns the only surviving renderer',async()=>{
 let finish;const gate=new Promise(resolve=>finish=resolve),{api,made}=singletonHarness(gate);
 const pending=api.mountEffectScene({id:'field'}),combat=api.mountForBattle({title:'territory'},{id:'battle'});finish();
 const [effect,battle]=await Promise.all([pending,combat]);assert.equal(effect.disposed,true);assert.equal(battle.disposed,false);assert.equal(made.filter(e=>!e.disposed).length,1);api.destroy();
});
test('visibility pause resumes playing effects without unpausing an explicitly paused review timeline',async()=>{
 const oldDocument=globalThis.document;globalThis.document={hidden:false};
 const clock=paused=>({value:paused,paused(){return this.value;},pause(){this.value=true;},resume(){this.value=false;}}),playing=clock(false),paused=clock(true);
 const scene={effectScene:true,mounted:true,visible:true,simpleTimelines:new Set([{instance:playing},{instance:paused}]),app:{start(){},stop(){}}};
 try{await BaseBattleEngine.prototype.setVisible.call(scene,false);assert.ok(playing.value&&paused.value);await BaseBattleEngine.prototype.setVisible.call(scene,true);assert.equal(playing.value,false);assert.equal(paused.value,true);}finally{globalThis.document=oldDocument;}
});
