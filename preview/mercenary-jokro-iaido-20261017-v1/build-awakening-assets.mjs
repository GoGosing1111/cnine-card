import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {components} from '../mercenary-golden-dragon-battle-v1/inspect-sources.mjs';
const root=new URL('./',import.meta.url),hash=b=>createHash('sha256').update(b).digest('hex').toUpperCase(),read=f=>fs.readFile(new URL(f,root)),write=(f,v)=>fs.writeFile(new URL(f,root),JSON.stringify(v,null,2)+'\n');
const m=JSON.parse(await read('manifest.json'));
for(const key of ['cleave','shatter']){
 const source='assets/sources/'+key+'-awakening-v1.png',bytes=await read(source),c=await components(fileURLToPath(new URL(source,root))),wide=key==='cleave',columns=wide?2:4,rows=wide?6:3;
 const sw=c.info.width/columns,sh=c.info.height/rows,width=wide?1024:512,height=wide?384:512;
 if(!Number.isInteger(sw)||!Number.isInteger(sh))throw Error('Source grid must divide evenly');
 const owners=new Map();for(const p of c.parts)if(p.right-p.left<sw*1.4&&p.bottom-p.top<sh*1.8)owners.set(p.id,Math.min(rows-1,Math.floor(p.cy/sh))*columns+Math.min(columns-1,Math.floor(p.cx/sw)));
 const frames=[],tiles=[],bounds={left:width,top:height,right:0,bottom:0};
 for(let i=0;i<12;i++){
  const pixels=Buffer.alloc(width*height*4),cx=(i%columns+.5)*sw,cy=(Math.floor(i/columns)+.5)*sh;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
   const sx=Math.floor(cx-width/2+x),sy=Math.floor(cy-height/2+y);if(sx<0||sy<0||sx>=c.info.width||sy>=c.info.height)continue;
   const p=sy*c.info.width+sx,id=c.labels[p],owner=owners.get(id)??Math.floor(sy/sh)*columns+Math.floor(sx/sw);if(owner!==i)continue;
   c.data.copy(pixels,(y*width+x)*4,p*4,p*4+4);
  }
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(pixels[(y*width+x)*4+3]>=16){bounds.left=Math.min(bounds.left,x);bounds.top=Math.min(bounds.top,y);bounds.right=Math.max(bounds.right,x+1);bounds.bottom=Math.max(bounds.bottom,y+1);}
  const png=await sharp(pixels,{raw:{width,height,channels:4}}).png().toBuffer(),file='assets/frames/'+key+'-'+String(i).padStart(2,'0')+'.png';await fs.writeFile(new URL(file,root),png);frames.push({index:i,file,sha256:hash(png),anchor:{x:.5,y:.5}});tiles.push({input:png,left:i%columns*width,top:Math.floor(i/columns)*height});
 }
 const atlas='assets/atlases/'+key+'.png',packed=await sharp({create:{width:width*columns,height:height*rows,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite(tiles).png().toBuffer();await fs.writeFile(new URL(atlas,root),packed);
 m.effects[key]={atlas,sha256:hash(packed),columns,rows,cellSize:width,cellWidth:width,cellHeight:height,frameCount:12,visibleBounds:bounds,frames,source:{file:source,sha256:hash(bytes),hasNativeAlpha:true},sourceCell:{width:sw,height:sh}};
}
const pinnedBaseline=JSON.parse(await read('references/jinmu-operating-baseline-20261018.json')),commit=pinnedBaseline.sourceCommit;
const baselineSource=execFileSync('git',['show',commit+':shared/mercenary-jinmu-v1.mjs']);
await fs.writeFile(new URL('references/jinmu-operating-policy-20261018.mjs',root),baselineSource);
await write('references/jinmu-operating-baseline-20261018.json',{source:'origin/main:shared/mercenary-jinmu-v1.mjs',sourceCommit:commit,sourceSha256:hash(baselineSource),code:'V-989',name:'천룡검황 진무',basePower:1347840,statsReferencePower:1123200,statScale:1.2,speedReferencePower:1080000,speedScale:3.12,actionCredit:3.12,motionPlaybackRate:2.6,link:{attackPercent:2196.48,hpPercent:1397.76,shieldPercent:763.68},basicCapScale:2.4,damageTakenScale:.25,hardCounter:'V-055',counterImmune:true,controlImmune:true,poisonImmune:true,area:{damageRatio:5.6,cooldownTurns:5,cost:35,pveOnly:true,target:'ALL_ENEMIES',distribution:'TOTAL_SPLIT_ONCE_PER_LIVING_TARGET'}});
m.counts={motion:24,effects:Object.values(m.effects).reduce((n,s)=>n+s.frameCount,0)};
m.animation={motionRate:2,effectRate:1,contactSynchronization:'Motion clock compressed around first contact; effect seconds and authored frame timing remain unchanged.',illustrationCutIn:false};
m.dialogue={display:'PERSISTENT_RESERVED_RAIL',placement:'BELOW_BATTLE_HEADER_ABOVE_CANVAS',portrait:true,portraitSource:'assets/source-art-preview.webp',portraitCrop:{position:'50% 14%',size:'500% auto'},rankLabel:'SSS 리미티드',lines:5,cycle:'Advance on skill cast only; retain last line between casts.',heightPolicy:'Premeasure all five quotes in the same CSS grid; reserve host top below rail.',standardReference:'references/limited-dialogue-standard-20261018.json'};
m.neonRim={implementation:'source/JokroNeonRim.js',scope:'CHARACTER_ALPHA_SILHOUETTE_ONLY',color:'MINT_CORE_EMERALD_HALO',coreRadiusScreenPixels:1.25,haloRadiusScreenPixels:7,sourcePixelsChanged:false,reducedMotion:'FIXED_STRENGTH',motionOnly:'DISABLED'};
m.awakening={mode:'awakening',name:'청룡단천',status:'USER_REVIEW_PENDING',effectSources:['cleave','shatter'],screenSplit:'Actual V3 battlefield snapshot, two rigid masked halves, no portrait, HUD preserved.',duration:5.6,visualContacts:[2.12,2.72],serverApplicationsPerCastPerTarget:1};
m.balance={module:'balance.mjs',baseline:'references/jinmu-operating-baseline-20261018.json',status:'IMPLEMENTED_FOR_REVIEW_NOT_LIVE',productionEnabled:false};
m.rankStatus='SSS_LIMITED_USER_REQUESTED_PREVIEW_ONLY';
m.packaging=m.packaging.replace('FX are seven authored twelve-frame sequences','FX are nine authored twelve-frame sequences');
m.prompts=(await fs.readdir(new URL('prompts/',root))).map(f=>'prompts/'+f);
m.currentPromptMap??={sourceArt:'prompts/approved-source-blade-lift.json',master:'prompts/master-v3-grip-face-gaze-reset.json',masterMirror:'master-mirror-20261017.json',motion:{dash:'prompts/motion-dash-locked-weapon-v2.json',slash:'prompts/motion-slash-locked-v2.json',cast:'prompts/motion-cast-locked-v2.json',ultimate:'prompts/motion-ultimate-locked-v2.json',hit:'prompts/motion-hit-locked-v2.json',defeat:'prompts/motion-defeat-locked-v2.json'},effects:{aura:'prompts/fx-aura-v1.json',dashfx:'prompts/fx-dashfx-v1.json',blade:'prompts/fx-blade-v1.json',dragon:'prompts/fx-dragon-original.json',charge:'prompts/fx-charge-v1.json',eruption:'prompts/fx-eruption-v2.json',impact:'prompts/fx-impact-v1.json'},ui:['prompts/ui-frame-original.json','prompts/ui-button-v1.json']};
for(const key of ['cleave','shatter'])m.currentPromptMap.effects[key]='prompts/fx-'+key+'-awakening-v1.json';
m.qa={...m.qa,awakeningTests:'qa/awakening.test.mjs',awakeningRuntimeReport:'qa/awakening-runtime-report.json',awakeningRecording:'qa/awakening-preview.webp',dialogueNeonReport:'qa/dialogue-neon-report.json',priorAssetAndRuntimeReports:'Initial 108-frame / seven-mode version; retained as history.',userVisualApproval:false};
await write('manifest.json',m);console.log(JSON.stringify(m.counts));
