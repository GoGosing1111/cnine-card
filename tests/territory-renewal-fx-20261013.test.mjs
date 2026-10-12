import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import sharp from 'sharp';
const read=f=>readFileSync(new URL('../'+f,import.meta.url));
const root='assets/ui/territory-war/renewal-skills-v1/',manifest=JSON.parse(read(root+'manifest.json'));
const hash=b=>createHash('sha256').update(b).digest('hex');
test('three independent 16-frame atlases preserve generated alpha, original hashes, individual drawings and safe gutters',async()=>{
 assert.equal(Object.keys(manifest.assets).length,3);
 for(const spec of Object.values(manifest.assets)){
  assert.equal(hash(read(root+spec.source)),spec.sourceSha256);
  assert.equal(hash(read(spec.url.slice(1))),spec.sha256);
  assert.equal(spec.frames.length,16);assert.equal(new Set(spec.frames.map(f=>f.sha256)).size,16);
  assert.ok(spec.frames.every(f=>f.opaqueBorderPixels===0&&f.transparentPixels>10000));
  const meta=await sharp(read(spec.url.slice(1))).metadata();assert.equal(meta.hasAlpha,true);
  assert.ok((await sharp(read(spec.icon.slice(1))).metadata()).hasAlpha);
 }
});
function harness(gate=Promise.resolve()){
 const nodes=[];
 class Container{constructor(){this.children=[];nodes.push(this)}addChild(child){this.children.push(child)}removeFromParent(){}destroy(){this.destroyed=true}}
 class Sprite{constructor(texture){this.texture=texture;this.anchor={set:(...a)=>this.anchorValue=a};this.position={set:(x,y)=>{this.x=x;this.y=y}}}}
 const runtime={Container,Sprite,Graphics:class{},Assets:{load:async()=>({source:{}})},Texture:class{constructor(o){Object.assign(this,o)}},Rectangle:class{constructor(x,y,w,h){Object.assign(this,{x,y,w,h})}}};
 const scene={disposed:false,app:{screen:{width:1000,height:650},render(){}},effectLayer:new Container(),simpleTimelines:new Set(),timeline(callback,done){const timeline={to(clock,options){this.clock=clock;this.options=options;return this},pause(){return this},time(value){this.clock.time=value;this.options.onUpdate()},timeScale(){},kill(){scene.simpleTimelines.delete(this)}};scene.simpleTimelines.add(timeline);callback(timeline);return timeline}};
 const context={console,performance:{now:()=>0},matchMedia:()=>({matches:false}),document:{querySelector:()=>null},fetch:async()=>{await gate;return{ok:true,json:async()=>structuredClone(manifest)}}};
 vm.runInNewContext(read('js/territory-artillery-fx-20261003.js').toString(),context);
 const fx=new context.CNineTerritoryArtilleryFx();Object.assign(fx,{runtime,scene,paused:false,guns:[],assets:{manifest:{assets:{turret:{muzzle:[.953,.159],ground:[.42,.925]}},timing:{shot:{},cannon:{}}},textures:{muzzle:[],projectile:[],impact:[]}}});
 fx.ensure=async()=>scene;
 return {fx,scene,nodes};
}
test('authored effects seek on the shared timeline and target the correct enemy or allied fort',async()=>{
 const {fx,scene}=harness();
 const attack=await fx.play('ARC_LANCE','A');fx.control('pause');fx.control('seek',.5);const first=attack.authored.texture;
 fx.control('seek',1.5);assert.notEqual(attack.authored.texture,first);assert.ok(attack.contact.frame>=7);
 assert.ok(attack.contact.target.x>500);assert.equal(scene.simpleTimelines.size,1);
 assert.ok(attack.contact.target.x+attack.contact.width/2<=1000);
 fx.control('stop');assert.equal(fx.active.size,0);assert.equal(scene.simpleTimelines.size,0);
 const repair=await fx.play('CITADEL_REPAIR','B');fx.control('seek',1.8);assert.ok(repair.contact.target.x>500);fx.clear();
 const enemy=await fx.play('DISRUPTION_WAVE','B');fx.control('seek',1.5);assert.ok(enemy.contact.target.x<500);assert.ok(enemy.contact.target.x-enemy.contact.width/2>=0);fx.clear();
});
test('a node change or effect toggle during lazy asset loading cancels the pending effect',async()=>{
 let release;const gate=new Promise(resolve=>release=resolve),{fx,scene}=harness(gate);
 const pending=fx.play('ARC_LANCE','A');await new Promise(resolve=>setTimeout(resolve,0));fx.clear();release();
 assert.equal(await pending,null);assert.equal(fx.active.size,0);assert.equal(scene.simpleTimelines.size,0);
});
