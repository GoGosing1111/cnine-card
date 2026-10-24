import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
const source=process.argv[2];if(!source)throw Error('Pass the existing accepted battle preview directory');
const root='assets/ui/project-v/mercenaries/awakened-omega-20261024',sha=b=>createHash('sha256').update(b).digest('hex');
await fs.mkdir(root,{recursive:true});
const manifest=JSON.parse(await fs.readFile(path.join(source,'manifest-cosmic-fx-v4.json'),'utf8')),records=[];
async function copy(from,to){const bytes=await fs.readFile(from),dest=path.join(root,to);await fs.mkdir(path.dirname(dest),{recursive:true});await fs.writeFile(dest,bytes);records.push({file:dest.replaceAll('\\','/'),sha256:sha(bytes),bytes:bytes.length});}
await copy(path.resolve(source,manifest.sourceArt),'source-art.png');
await copy(path.join(source,manifest.motion.idle.frames[0].file),'idle.png');
await copy(path.join(source,'assets/battle-master-complete.png'),'originals/battle-master-complete.png');
for(const kind of ['motion','effects'])for(const[key,spec]of Object.entries(manifest[kind])){
 const target=`${kind}/${key}.png`;await copy(path.join(source,spec.atlas),target);spec.atlas=target;
}
for(const size of [320,640])await sharp(path.join(root,'source-art.png')).resize({width:size,withoutEnlargement:true}).webp({quality:92}).toFile(path.join(root,`art-${size}.webp`));
await copy(path.join(source,'prompts-cosmic-fx-v4.json'),'originals/prompts-cosmic-fx-v4.json');
const approval={dateKST:'2026-10-24',userStatement:'각성 오메가 전투력 175만으로 밸런스 조정하고 제작 전용으로 획득불가, 도감에 올려 SSS리미티드',name:'각성 오메가',code:'V-972',rank:'SSS',edition:'LIMITED',basePower:1750000,acquisition:'CRAFT_ONLY',acquisitionEnabled:false,accountGrants:0,acceptedMotionFrames:25,cosmicEffectFrames:48,defaultPlaybackRate:2,effectLayer:'front',sourcePreview:path.resolve(source).replaceAll('\\','/'),records};
manifest.sourceArt='source-art.png';manifest.status='USER_REGISTERED_CRAFT_ONLY_LOCKED';manifest.motionAccepted=true;manifest.skillVisualApproval=true;manifest.liveDeployed=false;manifest.runtime={...manifest.runtime,renderer:'PRODUCTION_V3',clock:'V3_REGISTERED_GSAP',effectLayer:'front'};
await fs.writeFile(path.join(root,'motion-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
await fs.writeFile(path.join(root,'approval-20261024.json'),JSON.stringify(approval,null,2)+'\n');
await fs.writeFile(path.join(root,'manifest.json'),JSON.stringify({version:1,...approval,runtimeManifest:'motion-manifest.json'},null,2)+'\n');
console.log(JSON.stringify({assets:records.length,bytes:records.reduce((s,r)=>s+r.bytes,0),motion:25,effects:48,sourceArtSha256:records[0].sha256,idleSha256:records[1].sha256}));
