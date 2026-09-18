import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import {build} from 'esbuild';
import {APOCALYPSE_LEGION_BOSSES as BOSSES} from '../shared/apocalypse-legion-v1.mjs';
import {REFERENCE,makeRegistrationDraft} from '../preview/apocalypse-bosses-v1/bosses.mjs';
import {castDraftSkill} from '../preview/apocalypse-bosses-v1/skill-contract.mjs';
import {createPveBattleV2} from '../functions/_battle_v2_preview.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),dir=path.join(root,'preview/apocalypse-bosses-v1');
const read=async p=>JSON.parse(await fs.readFile(path.join(root,p),'utf8'));
const json=(p,v)=>fs.writeFile(path.join(dir,p),JSON.stringify(v,null,2)+'\n');
const hash=b=>createHash('sha256').update(b).digest('hex');
const qa=[];
for(const boss of BOSSES){
 for(const file of [boss.battleSprite.split('/').pop(),...boss.skills.map(s=>s.asset+'-sheet.png')]){
  const buffer=await fs.readFile(path.join(dir,'assets',file)),m=await sharp(buffer).metadata(),raw=await sharp(buffer).raw().toBuffer({resolveWithObject:true});
  if(!m.hasAlpha||raw.info.channels!==4)throw Error('OPAQUE_ASSET:'+file);
  let clear=0,opaque=0;for(let i=3;i<raw.data.length;i+=4){clear+=raw.data[i]===0?1:0;opaque+=raw.data[i]>245?1:0;}
  const total=m.width*m.height;if(clear/total<.1||opaque/total<.005)throw Error('INVALID_ALPHA:'+file);
  qa.push({file:'assets/'+file,width:m.width,height:m.height,sha256:hash(buffer),alpha:true,transparentRatio:clear/total,opaqueRatio:opaque/total});
 }
 for(const skill of boss.skills){
  const file=skill.asset+'-sheet.png',meta=qa.find(a=>a.file==='assets/'+file),w=Math.floor(meta.width/4),h=Math.floor(meta.height/3);
  // Point to the original authored PNG. No recoloring, background removal, resizing or re-encoding.
  const frames=Object.fromEntries(Array.from({length:12},(_,i)=>[skill.asset+'_'+String(i).padStart(2,'0'),{frame:{x:(i%4)*w,y:Math.floor(i/4)*h,w,h},rotated:false,trimmed:false,spriteSourceSize:{x:0,y:0,w,h},sourceSize:{w,h}}]));
  await json('assets/'+skill.asset+'-atlas.json',{frames,meta:{image:file,format:'RGBA8888',size:{w:meta.width,h:meta.height},scale:'1',collisionFrame:6,impactAt:skill.impactAt,sha256:meta.sha256}});
 }
}
const manifests=await Promise.all(['fur/manifest-v2.json','zenith/manifest-v1.json','superstar/manifest-v1.json'].map(p=>read('assets/ui/project-v/characters/'+p)));
const roster=manifests.flatMap(m=>m.characters.map(c=>({...c,grade:m.rarity})));
const ids=['CN-346F8DB0DEB84D41','CN-0505936A0CBB4E59','CN-25F931CE393D474E','CN-23EB4B19986D4818','CN-519C181C18DF4B8E'];
const cards=ids.map((id,i)=>{const c=roster.find(c=>c.cardId===id);if(!c)throw Error('MISSING_CANONICAL_CARD');return {...c,id,cardId:id,name:c.member,rarity:c.grade,image:c.sourceArt,image_url:c.sourceArt,originalCardArt:c.sourceArt,power_type:['ATTACK','DEFENSE','SPEED','HP','DEFENSE'][i],power:4000000};});
const fixtures={},drafts=makeRegistrationDraft();
for(const [i,boss] of BOSSES.entries()){
 const profile=drafts[i].battleProfile;
 const monster={id:boss.monsterId,name:boss.name,image_url:boss.sourceArt,sourceArt:boss.sourceArt,battleSprite:boss.battleSprite,is_boss:1,pve_difficulty:'APOCALYPSE',battle_power:profile.battlePower,pve_hp_percent:profile.hpPercent,pve_attack_percent:profile.attackPercent,pve_defense_percent:profile.defensePercent,pve_speed_percent:profile.speedPercent,pve_shield_percent:profile.shieldPercent,pve_attack_count:profile.attackCount,pve_forced_action_every:profile.forcedActionEvery};
 const battleV2=createPveBattleV2({cards,monster,seed:20260918,bossUltimatePercent:0});
 const enemy=battleV2.teams.B.cards[0];
 Object.assign(enemy,{sourceArt:boss.sourceArt,battleSprite:boss.battleSprite,projectVMonsterArt:{scope:'BATTLE_ENGINE_ONLY',kind:'MONSTER_SD',name:boss.name,primaryUrl:boss.battleSprite,pngFallbackUrl:boss.battleSprite,sourceArt:boss.sourceArt,isBoss:true}});
 monster.projectVMonsterArt=enemy.projectVMonsterArt;monster.isBoss=true;
 const sampleTargets=structuredClone(battleV2.teams.A.cards),sampleActor=structuredClone(battleV2.teams.B.cards[0]);
 const events={};for(const skill of boss.skills)events[skill.kind]=castDraftSkill(skill,sampleActor,sampleTargets);
 fixtures[boss.key]={previewOnly:true,networkPolicy:'STATIC_GET_ONLY',mode:'APOCALYPSE',battlefieldMode:'APOCALYPSE',monster,bossUltimate:{enabled:false},battleV2,draftSkillEvents:events};
}
await json('payloads.json',fixtures);await json('registration-draft.json',{release:{enabled:false,registered:false,visualApproval:true,status:'APPROVED_REFERENCE_DRAFT'},reference:REFERENCE,bosses:drafts});
const lock=await read('package-lock.json');await json('asset-manifest.json',{generator:'built-in image_gen',pixelEdits:false,scope:'APPROVED_SOURCE_ARCHIVE',visualApproval:true,pixi:lock.packages['node_modules/pixi.js'].version,gsap:lock.packages['node_modules/gsap'].version,files:qa});
await build({entryPoints:[path.join(dir,'lab.js')],bundle:true,minify:true,format:'iife',target:'es2022',outfile:path.join(dir,'lab.bundle.js'),define:{__CNINE_NATIVE_CONTINUOUS__:'false'}});
// Pixi's embedded shader templates retain trailing spaces; normalize those for clean generated diffs.
const bundleFile=path.join(dir,'lab.bundle.js');await fs.writeFile(bundleFile,(await fs.readFile(bundleFile,'utf8')).replace(/[\t ]+$/gm,''));
console.log(JSON.stringify({bosses:2,skills:6,assets:qa.length,registered:false,enabled:false,powers:drafts.map(d=>({name:d.name,power:d.battleProfile.battlePower}))}));
