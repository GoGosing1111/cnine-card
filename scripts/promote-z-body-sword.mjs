import {readFile,writeFile,copyFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';

// Promote reviewed bytes; never regenerate, resize or recolor approved art.
const source=path.resolve(process.argv[2]||'preview/battle-suit-z-sword-v1');
const destination='assets/ui/project-v/account-battle-suits/z-sword-v1';
const read=async name=>JSON.parse(await readFile(path.join(source,name),'utf8'));
const attack=await read('manifest-v2.json'),motion=await read('manifest-motion-v5.json'),area=await read('manifest-v3.json');
await mkdir(destination,{recursive:true});
const assets=[];
async function promote(file,name){
  const data=await readFile(path.join(source,file));
  await copyFile(path.join(source,file),`${destination}/${name}`);
  const row={url:`/${destination}/${name}`,sha256:createHash('sha256').update(data).digest('hex'),bytes:data.length,approvedSource:file};
  assets.push(row);return row.url;
}
const manifest={version:'Z_SWORD_LIVE_20260918',suitCode:'BATTLE_SUIT_Z_BODY',status:'USER_APPROVED_LIVE',
  approval:'2026-09-18: Z바디 리소스 교체, 외형·공격모션·스킬모션·광역기 적용',
  image:await promote(attack.sourceArt.file,'z-body.png'),
  attack:{...attack.atlas,url:await promote(attack.atlas.file,'attack-atlas.png'),frames:attack.frames.map(({id,index,pivot,width,height,bladeTip,eye,bounds})=>({id,index,pivot,width,height,bladeTip,eye,bounds})),sequences:attack.sequences},
  cast:{...motion.cast.atlas,url:await promote(motion.cast.atlas.file,'cast-atlas.png'),frames:motion.cast.frames.map(({id,index,pivot,width,height,eye,bounds})=>({id,index,pivot,width,height,eye,bounds})),sequence:motion.sequence},
  effects:{},impactsMs:area.impactsMs,durationMs:3000,bodyScale:278*1.4*(439/512)/592,
  presentation:{damageAuthority:'EXISTING_SERVER_EVENTS',area:'GROUP_CONFIRMED_SUPPORT_HITS',extraDamage:false,extraTargets:false,skillChipEffects:'PRESERVED'},assets};
for(const [key,effect] of Object.entries(area.effects))manifest.effects[key]={...effect,atlas:{...effect.atlas,url:await promote(effect.atlas.file,`${key}-atlas.png`)}};
await writeFile(`${destination}/manifest.json`,JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({assets:assets.map(({url,bytes,sha256})=>({url,bytes,sha256})),attackFrames:manifest.attack.frames.length,castFrames:manifest.cast.frames.length}));
