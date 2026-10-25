import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
const root=process.cwd(),qa='docs/qa/bloodmoon-prime-material-20261025',asset='assets/items/prime-depleted-20261025/card.webp';
const generated='C:/Users/User/.codex/generated_images/01a16fc7-5348-73d3-b26d-af829059d93e/exec-fcdebae5-ff4d-4bce-9e87-1f212b615fa8.png';
fs.mkdirSync(path.join(root,qa,'originals'),{recursive:true});fs.mkdirSync(path.dirname(path.join(root,asset)),{recursive:true});
const original=qa+'/originals/prime-depleted-source.png';
fs.copyFileSync(generated,path.join(root,original));
// Delivery resize/encoding only; preserve the generated original without edits.
await sharp(generated).resize({width:640,withoutEnlargement:true}).webp({quality:90,alphaQuality:100}).toFile(path.join(root,asset));
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex');
fs.writeFileSync(path.join(root,qa,'manifest.json'),JSON.stringify({tool:'image_gen.imagegen (built-in)',usage:'Separate inventory crafting material, not replacement Prime character art',visualApproval:'Not requested or recorded; implementation preview',original:{path:original,sha256:hash(original)},runtime:{path:asset,sha256:hash(asset)},generatedSource:generated,promptFile:qa+'/prompt.json',references:[{path:'assets/ui/project-v/mercenaries/prime-requiem-20261021/source-art.png',sha256:'b2d1c5df8553370ec9ff90d72e27562c404c24dcecf33935bb74f0edc13d2fdc'},{path:'assets/items/mercenary-sss-card-shard-v1.png',sha256:'352dbcabea111c3c761d23fd9489d83af167be9a8bb5170545ee57c3075cdb97'}]},null,2)+'\n');
console.log(JSON.stringify({asset,bytes:fs.statSync(path.join(root,asset)).size,sha256:hash(asset)}));
