import fs from 'node:fs/promises';
import sharp from 'sharp';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const dir=new URL('../assets/ui/sss-miracle-cube-20261021/',import.meta.url),assets=[];
for(const [source,outputs] of [['cube-source.png',[['cube-768.webp',768],['cube-320.webp',320]]],['cube-open-source.png',[['cube-open-768.webp',768]]],['panel-source.png',[['panel.webp',1536]]]]){
 const bytes=await fs.readFile(new URL(source,dir)),meta=await sharp(bytes).metadata(),derivatives=[];
 if(!source.startsWith('panel')&&!meta.hasAlpha)throw Error('Cube alpha required');
 for(const [target,width] of outputs){
  await sharp(bytes).resize({width,withoutEnlargement:true}).webp({quality:92,alphaQuality:100,effort:6}).toFile(fileURLToPath(new URL(target,dir)));
  derivatives.push({path:target,sha256:createHash('sha256').update(await fs.readFile(new URL(target,dir))).digest('hex')});
 }
 assets.push({source,sha256:createHash('sha256').update(bytes).digest('hex'),width:meta.width,height:meta.height,hasAlpha:meta.hasAlpha,derivatives});
}
await fs.writeFile(new URL('manifest.json',dir),JSON.stringify({version:'20261021-v1',generator:'built-in image_gen',prompts:'prompts.json',assets,consumers:['sss-miracle-cube/index.html','sss-miracle-cube/app.mjs','sss-miracle-cube/style.css','admin/sss-miracle-cube.html','admin/sss-miracle-cube-entry.mjs','shared/sss-miracle-cube-v1.mjs'],sourcePolicy:'Originals retained byte-for-byte. Derivatives resize/encode only; alpha preserved.',visualApproval:'User review pending; functional checks are not visual approval.'},null,2)+'\n');
console.log(JSON.stringify(assets.map(({source,width,height,hasAlpha})=>({source,width,height,hasAlpha}))));
