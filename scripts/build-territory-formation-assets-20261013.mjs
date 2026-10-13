import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
const source='preview/territory-formation-20261013-v1/assets/',root='assets/ui/territory-war/formation-v1/';
await mkdir(root,{recursive:true});
const hash=b=>createHash('sha256').update(b).digest('hex'),assets={};
for(const key of ['button-primary-v2','button-secondary-v2','button-danger-v2','button-square-v2','command-sanctum']){
 const original=await readFile(source+key+'-source.png'),metadata=await sharp(original).metadata();
 const button=key.startsWith('button-'),width=key==='button-square-v2'?192:button?720:1672;
 const output=await (button?sharp(original).trim({threshold:1}):sharp(original)).resize({width,withoutEnlargement:true}).webp({quality:92,alphaQuality:100}).toBuffer();
 await writeFile(root+key+'.webp',output);const info=await sharp(output).metadata();
 assets[key]={source,sourceFile:key+'-source.png',sourceSha256:hash(original),sourceWidth:metadata.width,sourceHeight:metadata.height,url:'/'+root+key+'.webp',width:info.width,height:info.height,hasAlpha:info.hasAlpha,bytes:output.length,sha256:hash(output)};
}
await writeFile(root+'manifest.json',JSON.stringify({version:'20261013-v2',generatedWith:'built-in image_gen',promptSet:'/preview/territory-formation-20261013-v1/prompts-v2.json',backgroundPromptSet:'/preview/territory-formation-20261013-v1/prompts.json',logo:{url:'/assets/ui/territory-war/formation-v1/soopketmon-logo-approved.png',source:'User attachment codex-clipboard-74522d6c-7837-4539-94c9-a497cee72047.png',sha256:hash(await readFile(root+'soopketmon-logo-approved.png')),processing:'Exact unmodified user attachment'},processing:'Preserve original PNG; trim transparent exterior padding only; uniform resize and WebP encode, no recoloring or creative pixel edits.',visualApproval:'USER_REVIEW_PENDING',assets},null,2)+'\n');
console.log(JSON.stringify(assets));
