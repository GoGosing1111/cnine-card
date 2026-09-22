import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {Container,Sprite,Texture,TextureSource} from 'pixi.js';
import {gsap} from 'gsap';
import {MODES,makePlan,sample} from './skill.mjs';
import {BlackMoonFX} from './source/BlackMoonFX.js';
import {createMercenaryBattleArtAdapter} from '../../js/project-v-mercenary-battle-art-adapter-v1.js';
const root=new URL('./',import.meta.url),project=new URL('../../',import.meta.url);
const manifest=JSON.parse(await fs.readFile(new URL('manifest.json',root),'utf8'));
const hash=b=>createHash('sha256').update(b).digest('hex').toUpperCase();
function inside(x,y,polygon){let yes=false;for(let i=0,j=polygon.length-2;i<polygon.length;j=i,i+=2){const xi=polygon[i],yi=polygon[i+1],xj=polygon[j],yj=polygon[j+1];if(((yi>y)!==(yj>y))&&(x<(xj-xi)*(y-yi)/(yj-yi)+xi))yes=!yes;}return yes;}
test('approved source pixels remain exact and SD is separate transparent artwork',async()=>{
 assert.equal(manifest.rank,'SS');assert.equal(manifest.sourceArtStatus,'APPROVED_SOURCE_ART');assert.equal(manifest.runtimeEnabled,true);assert.equal(manifest.skillsAssigned,true);
 assert.equal(hash(await fs.readFile(new URL(manifest.sourceArt,project))),'42853BDCB6C1843832C7050F5B0FB64D008F60372C90C5397D208D72E82D3230');
 const sd=await fs.readFile(new URL(manifest.battleSprite,project));assert.equal(hash(sd),manifest.battleSpriteInfo.sha256);assert.equal(manifest.battleSpriteInfo.hasAlpha,true);assert.ok(manifest.battleSpriteInfo.clear>.6);assert.ok(manifest.battleSpriteInfo.solid>.3);assert.equal(manifest.battleSpriteInfo.border,0);
 const adapter=createMercenaryBattleArtAdapter({format:'PROJECT_V_MERCENARY_SYSTEM_ROSTER_V1',summary:{battleSpriteReady:1,battleSpritePending:0},cards:[manifest]});assert.ok(adapter.resolveForConsumer('BATTLE_FIELD',manifest.code));assert.equal(adapter.resolveForConsumer('CARD_DOCK',manifest.code),null);
});
test('runtime masks include full characters and exclude neighboring sword frames',async()=>{
 let count=0;
 for(const spec of Object.values(manifest.motion)){
  const bytes=await fs.readFile(new URL(spec.source,root));assert.equal(hash(bytes),spec.sourceInfo.sha256);
  const {data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  for(const f of spec.frames){
   count++;let included=0;
   for(let y=0;y<f.rect.height;y++)for(let x=0;x<f.rect.width;x++)if(data[((y+f.rect.y)*info.width+x+f.rect.x)*4+3]>24&&inside(x,y,f.mask))included++;
   assert.ok(included>=f.alphaPixels,spec.source+' frame '+f.index+' lost character pixels: '+included+'/'+f.alphaPixels);
   assert.ok(included-f.alphaPixels<120,spec.source+' frame '+f.index+' includes neighboring pixels: '+(included-f.alphaPixels));
  }
 }
 assert.equal(count,12);
});
test('16 effect frames are distinct, transparent and have empty crop borders',async()=>{
 const s=manifest.effects.triple,bytes=await fs.readFile(new URL(s.source,root));assert.equal(hash(bytes),s.sourceInfo.sha256);
 const {data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true}),hashes=[];
 for(const f of s.frames){let visible=0,border=0;const rows=[];for(let y=0;y<f.rect.height;y++){const start=((f.rect.y+y)*info.width+f.rect.x)*4;rows.push(data.subarray(start,start+f.rect.width*4));for(let x=0;x<f.rect.width;x++){const a=data[start+x*4+3];if(a>24){visible++;if(x<2||y<2||x>=f.rect.width-2||y>=f.rect.height-2)border++;}}}assert.equal(border,0);assert.ok(visible>30&&visible<f.rect.width*f.rect.height*.65);hashes.push(hash(Buffer.concat(rows)));}
 assert.equal(new Set(hashes).size,16);
});
test('forward/reverse seeking is deterministic; interruption removes all active effects',()=>{
 for(const mode of Object.keys(MODES)){
  const p=makePlan({mode}),times=Array.from({length:70},(_,i)=>p.duration*i/69),states=times.map(t=>sample(p,t));times.slice().reverse().forEach(t=>assert.deepEqual(sample(p,t),states[times.indexOf(t)]));
  for(const key of ['cancelAt','targetLostAt'])for(const at of[0,.4,1.02,1.6,2.2]){
   const interrupted=makePlan({mode,[key]:at});assert.ok(interrupted.contacts.every(t=>t<at));
   if(at>p.duration)continue;
   for(const t of[at,p.duration]){const s=sample(interrupted,t);assert.equal(s.pose,null);assert.equal(s.effect,null);assert.equal(s.travel,0);assert.equal(s.recoil,0);assert.equal(s.flash,0);}
  }
 }
 assert.throws(()=>makePlan({mode:'missing'}));assert.throws(()=>makePlan({cancelAt:-1}));assert.equal(makePlan().damageAuthority,'NONE_VISUAL_PREVIEW');
});
test('all three contacts use the authored pose and corresponding effect peak',()=>{
 for(const [at,key,frame]of [[.72,'descending',4],[1.24,'rising',7],[1.92,'finisher',10]]){const s=sample(makePlan(),at);assert.deepEqual(s.pose,{key,frame:2});assert.equal(s.effect.frame,frame);}
});
test('real Pixi transforms align blades and cleanup retains shared engine/resources',()=>{
 const world=new Container(),combatLayer=new Container(),effectLayer=new Container();world.addChild(combatLayer,effectLayer);
 const source=new TextureSource({width:1254,height:1254}),sd=new Texture({source});
 const actor=(x,y,height)=>{const root=new Container(),view=new Container(),s=new Sprite(sd);root.position.set(x,y);root.scale.set(.6);root.addChild(view);view.addChild(s);s.anchor.set(manifest.battleSpriteFootAnchor.x,manifest.battleSpriteFootAnchor.y);s.height=height;s.width=height;combatLayer.addChild(root);return{root,view,fullBodySprite:s,baseX:x,baseY:y,fullBodyHeight:height,neutralAvatarPose:{mainSprite:{}},animationController:{kill(){}}};};
 const merc=actor(480,300,300),target=actor(1250,590,260),engine={effectLayer,combatLayer,simpleTimelines:new Set(),allies:Array.from({length:5},()=>({})),scene:{width:1600,height:820},sortCombatDepth(){}};
 const assets={motion:{},effects:{triple:Array.from({length:16},()=>new Texture({source}))},flash:Texture.EMPTY};
 for(const[k,s]of Object.entries(manifest.motion))assets.motion[k]=s.frames.map(()=>new Texture({source}));
 const fx=new BlackMoonFX(engine,merc,target,assets,manifest,makePlan(),()=>{});
 try{
  for(const[at,key]of [[.72,'descending'],[1.24,'rising'],[1.92,'finisher']]){
   fx.seek(at);const spec=manifest.motion[key],f=spec.frames[2],point=effectLayer.toLocal(merc.fullBodySprite.toGlobal({x:spec.contact.point.x-f.foot.x,y:spec.contact.point.y-f.foot.y})),targetPoint=fx.point(target,spec.contact.targetHeightFraction);
   assert.ok(Math.hypot(point.x-targetPoint.x,point.y-targetPoint.y)<.01,key+' blade contact');
  }
  for(let i=0;i<20;i++){fx.setPlan(makePlan());fx.play();assert.equal(engine.simpleTimelines.size,1);fx.pause();for(const t of[0,.72,1.24,1.92,3.8])fx.seek(t);fx.cancel();assert.equal(engine.simpleTimelines.size,0);assert.equal(fx.diagnostics().visibleSprites,0);}
  assert.equal(merc.root.x,merc.baseX);assert.equal(merc.root.y,merc.baseY);assert.equal(engine.allies.length,5);assert.equal(engine.allies.includes(merc),false);assert.equal(merc.fullBodySprite.texture,sd);
 }finally{fx.destroy();fx.destroy();assert.equal(effectLayer.children.length,0);assert.equal(merc.view.children.length,1);assert.equal(source.destroyed,false);gsap.ticker.sleep();world.destroy({children:true});sd.destroy(false);source.destroy();}
});
