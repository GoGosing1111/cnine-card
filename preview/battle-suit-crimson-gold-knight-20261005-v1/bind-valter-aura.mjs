import fs from 'node:fs/promises';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';
const root=new URL('./',import.meta.url),repo=new URL('../../',root),file=p=>new URL(p,root),hash=b=>createHash('sha256').update(b).digest('hex');
const valter=JSON.parse(await fs.readFile(new URL('preview/mercenary-crimson-silver-knight-battle-v1/manifest.json',repo)));
const limited=JSON.parse(await fs.readFile(new URL('preview/mercenary-limited-sd-skills-20261003-v1/manifest.json',repo)));
const m=JSON.parse(await fs.readFile(file('manifest.json'))),v=valter.effects.aura,r=limited.aura;
const refs=[
 {key:'aura-valter',source:'preview/mercenary-crimson-silver-knight-battle-v1/'+v.atlas,url:'assets/atlases/aura-valter-v17.webp',expected:v.atlasSha256,columns:v.columns,rows:v.rows,width:v.columns*v.cellSize,height:v.rows*v.cellSize,frames:v.frames.map(f=>({index:f.index,anchor:f.anchor,rect:{x:f.index%v.columns*v.cellSize,y:Math.floor(f.index/v.columns)*v.cellSize,width:v.cellSize,height:v.cellSize}}))},
 {key:'aura-valter-rear',source:'preview/mercenary-limited-sd-skills-20261003-v1/'+r.url,url:'assets/atlases/aura-valter-rear-approved.png',expected:r.sha256,columns:r.columns,rows:r.rows,width:r.width,height:r.height,frames:r.frames.map((f,index)=>({index,...f}))}
];
if(m.effects['aura-wrap'])m.retiredAuraV2={status:'REJECTED_LIGHT_SHAPE_PRESERVE_HISTORY',reason:'User accepted the palette but requested the approved Valter light structure; thick fog bands no longer load or render.',effects:Object.fromEntries(Object.entries(m.effects).filter(([k])=>k==='aura-wrap'||k==='aura-rear'))};
delete m.effects['aura-wrap'];delete m.effects['aura-rear'];
const copies=[];
for(const s of refs){const bytes=await fs.readFile(new URL(s.source,repo)),sha256=hash(bytes);assert.equal(sha256,s.expected.toLowerCase());await fs.writeFile(file(s.url),bytes);m.effects[s.key]={url:s.url,sha256,columns:s.columns,rows:s.rows,width:s.width,height:s.height,frames:s.frames};copies.push({source:s.source,destination:s.url,sha256,byteIdentical:true,frameCount:s.frames.length});}
m.version='BATTLE_SUIT_CRIMSON_GOLD_20261005_VALTER_AURA_V3';
m.aura={version:3,defaultPalette:'crimson',body:'18 pose-matched silhouette copies; Valter V17 structure with a thinner 3.2px edge and 1.2px gold rim for the broad cape, scaled by visible body height',baseFlameFrames:12,rearFrames:8,frontFogSheets:0,risingParticles:12,footAnchored:true,clock:'SHARED_V3_GSAP',source:'source/RoyalAura.js',reference:'Approved Valter V17 flame atlas + approved limited rear aura, copied byte-for-byte',reusedAssets:copies};
m.summary={...m.summary,effectFrames:Object.values(m.effects).reduce((n,s)=>n+s.frames.length,0),skillEffectFrames:132,auraFrames:20};
await fs.writeFile(file('manifest.json'),JSON.stringify(m,null,2)+'\n');
await fs.writeFile(file('qa/valter-aura-source-v3.json'),JSON.stringify({passed:true,mode:'REUSE_APPROVED_ASSETS_NO_NEW_IMAGE_GENERATION',copies,referenceRenderers:['preview/mercenary-crimson-silver-knight-battle-v1/source/KnightFX.js','preview/mercenary-limited-sd-skills-20261003-v1/source/preview.js'],referenceBodyHeight:valter.displaySizing.bodyHeight,rearCenterY:(510-1507)/1452,rearWidthToBody:.8*1.65},null,2)+'\n');
console.log(JSON.stringify(m.summary));
