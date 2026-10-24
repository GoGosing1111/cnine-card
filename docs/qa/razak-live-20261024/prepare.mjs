import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
const source='C:/Users/User/Downloads/upload/cnine-card',battle=source+'/preview/mercenary-hooded-assassin-battle-20261024-v1',art=source+'/preview/mercenary-hooded-dual-sword-assassin-20261024-v1';
const dest='assets/ui/project-v/mercenaries/razak-20261024',codeDir='preview/project-v-v3/source/battle/razak';
const json=async p=>JSON.parse(await fs.readFile(p,'utf8')),save=async(p,v)=>fs.writeFile(p,JSON.stringify(v,null,2)+'\n');
const hash=b=>createHash('sha256').update(b).digest('hex').toUpperCase();
await fs.mkdir(dest+'/atlases',{recursive:true});await fs.mkdir(codeDir,{recursive:true});
const sourceArt=await fs.readFile(art+'/assets/hooded-dual-sword-assassin-source-art-v3.png');
if(hash(sourceArt)!=='2B9331D3A1A753234AF7E0AC7CCAA2764451DE6E843AE7A7912BFD5A298E8A06')throw Error('APPROVED_ART_HASH');
await fs.writeFile(dest+'/source-art.png',sourceArt);
await fs.copyFile(battle+'/assets/battle-sprite.png',dest+'/idle.png');
for(const size of [320,640])await sharp(sourceArt).resize({width:size}).webp({quality:90}).toFile(dest+`/art-${size}.webp`);
const m=await json(battle+'/manifest.json');
for(const kind of ['motion','effects'])for(const spec of Object.values(m[kind])){
 const name=path.basename(spec.atlas);await fs.copyFile(battle+'/'+spec.atlas,dest+'/atlases/'+name);spec.atlas='atlases/'+name;
}
Object.assign(m,{name:'라자크',reviewLabel:'라자크',code:'V-058',rank:'SSS',edition:'STANDARD',basePower:800000,status:'RELEASE_CANDIDATE',runtimeConnected:true,balanceAssigned:true,acquisitionEnabled:false,accountGrants:0,
 sourceArt:'source-art.png',sourceApproval:'live-approval.json',runtimeApproval:'live-approval.json',authoringSource:battle});
await save(dest+'/motion-manifest.json',m);
const approval={dateKST:'2026-10-24',userInstruction:'라자크로 채택하고 전투력 80만정도로 맞춰 도감에는 올리고 SSS등급, 현재 획득불가',
 sourceArtApproval:'승인하고 전투 리소스 만들어 공격기2개 광역기1개',motionInstruction:'빠른 암살,그에 맞는 이동에 맞는 잔상,모션속도는 2배',effectInstruction:'이펙트 크기들 더 키워',
 name:'라자크',code:'V-058',rank:'SSS',edition:'STANDARD',basePower:800000,sourceArtSha256:hash(sourceArt),
 approvedScope:['NAME','SSS_RANK','BASE_POWER_APPROX_800000','CODEX_PUBLICATION','ACQUISITION_LOCK'],
 retainedBattleResources:{attacks:2,area:1,playbackRate:2,effectScale:1.65,idle:'FIXED',afterimages:'ACTUAL_MOVEMENT_HISTORY'},
 acquisitionEnabled:false,accountGrants:0,sourceProject:battle,status:'PREPARED_FOR_RELEASE'};
await save(dest+'/live-approval.json',approval);await save(battle+'/live-approval-20261024.json',approval);
const authoring=await json(battle+'/manifest.json');Object.assign(authoring,{name:'라자크',reviewLabel:'라자크',rank:'SSS',edition:'STANDARD',code:'V-058',basePower:800000,balanceAssigned:true,releaseApproval:'live-approval-20261024.json',status:'CODEX_RELEASE_PREPARATION'});await save(battle+'/manifest.json',authoring);
const artManifest=await json(art+'/manifest.json');Object.assign(artManifest,{name:'라자크',rank:'SSS',code:'V-058',basePower:800000,acquisitionEnabled:false});await save(art+'/manifest.json',artManifest);
let fx=await fs.readFile(battle+'/source/AssassinFX.js','utf8');
fx=fx.replace("from '../skills.mjs'","from './skills.mjs'").replace("export const ROOT='/preview/mercenary-hooded-assassin-battle-20261024-v1/';","export const ROOT='/assets/ui/project-v/mercenaries/razak-20261024/';");
const start=fx.indexOf('  merc.animationController.playFullSpriteMoveAnimation();'),end=fx.indexOf('  this.bodyHeight',start);
if(start<0||end<0)throw Error('TIMELINE_PATCH');fx=fx.slice(0,start)+'  this.timelineFactory=options=>runtime.timeline(options);\n'+fx.slice(end);
fx=fx.replace('this.targets=engine.enemies.slice();','this.targets=(merc.team===\'ENEMY\'?engine.allies:engine.enemies).filter(a=>a.hp>0);');
fx=fx.replace('  const enemy=this.targets[0],floor=',"  const enemy=this.targets[0];if(!enemy){this.destination={...this.start};return;}const floor=");
fx=fx.replace('  const enemy=this.targets[0];','  this.merc.applyFacing?.();\n  const enemy=this.targets[0];');
fx=fx.replace('  this.targets.sort((a,b)=>Math.hypot(a.baseX-this.start.x,a.baseY-this.start.y)-Math.hypot(b.baseX-this.start.x,b.baseY-this.start.y));','  // Preserve server target order; contact time indexes the same ordered rows.');
fx=fx.replace('this.pose=pose;','this.pose=pose;this.merc.applyFacing?.();');
fx=fx.replace('this.effects[n++]','this.effectAt(n++)');
fx=fx.replace(' render(t){',` effectAt(index){while(this.effects.length<=index){const s=new this.runtime.Sprite();s.anchor.set(.5);s.visible=false;this.layer.addChild(s);this.effects.push(s);}return this.effects[index];}\n render(t){`);
fx=fx.replace('this.targets.forEach(a=>a.fullBodySprite.tint=this.targetTints.get(a));','this.targets.forEach(a=>{if(!a.root.destroyed)a.fullBodySprite.tint=this.targetTints.get(a)??0xffffff;});');
await fs.writeFile(codeDir+'/AssassinFX.js',fx);await fs.copyFile(battle+'/skills.mjs',codeDir+'/skills.mjs');
await save(dest+'/manifest.json',{name:'라자크',code:'V-058',rank:'SSS',edition:'STANDARD',basePower:800000,sourceArt:'source-art.png',sourceArtSha256:hash(sourceArt),battleSprite:'idle.png',battleSpriteSha256:hash(await fs.readFile(dest+'/idle.png')),motion:'motion-manifest.json',approval:'live-approval.json',authoringSource:battle,acquisitionEnabled:false,accountGrants:0});
console.log(JSON.stringify({sourceArt:hash(sourceArt),idle:hash(await fs.readFile(dest+'/idle.png')),atlases:await fs.readdir(dest+'/atlases')}));
