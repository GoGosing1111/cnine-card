import sharp from 'sharp';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdir,stat,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const VERSION='20261015-v1',OUT='assets/optimized/'+VERSION;
const hash=b=>createHash('sha256').update(b).digest('hex');
const files=execFileSync('git',['ls-files','-z'],{maxBuffer:40e6}).toString().split('\0').filter(Boolean);
const previewRoots=new Set();
for(const p of files.filter(p=>/^(js|shared|functions|data|css|raid|mercenary-codex)\//.test(p)&&/\.(js|mjs|json|css|html)$/.test(p))){
 const text=await readFile(p,'utf8');for(const m of text.matchAll(/(?:\/?preview\/[a-zA-Z0-9_-]+)/g))previewRoots.add(m[0].replace(/^\//,''));
}
await mkdir(OUT,{recursive:true});await mkdir('docs/image-delivery-20261015',{recursive:true});
const candidates=[],skipped=[],rows=[],dedup=new Map();
for(const p of files.filter(p=>/\.(png|jpe?g|webp)$/i.test(p)&&!p.startsWith('assets/optimized/'))){
 const s=await stat(p);if(s.size<262144)continue;
 if(!p.startsWith('assets/')&&!(p.startsWith('preview/')&&previewRoots.has(p.split('/').slice(0,2).join('/')))){skipped.push({path:p,bytes:s.size,reason:'not-production-media'});continue;}
 if(/\/(?:qa|sources?|prompts?|screenshots?)\//i.test(p)){skipped.push({path:p,bytes:s.size,reason:'preserved-source-or-qa'});continue;}
 candidates.push({path:p,bytes:s.size});
}
candidates.sort((a,b)=>b.bytes-a.bytes);sharp.concurrency(2);sharp.cache({memory:96,files:8,items:32});
function visibleHash(raw){for(let i=0;i<raw.length;i+=4)if(raw[i+3]===0)raw[i]=raw[i+1]=raw[i+2]=0;return hash(raw);}
async function convert(row){
 const bytes=await readFile(row.path),sourceHash=hash(bytes);
 if(dedup.has(sourceHash)){const previous=await dedup.get(sourceHash);if(previous)rows.push({...previous,path:row.path,sourceBytes:row.bytes});return;}
 const job=(async()=>{
  const metadata=await sharp(bytes,{animated:true,limitInputPixels:false}).metadata();
  if(metadata.depth!=='uchar'){skipped.push({...row,reason:'higher-bit-depth'});return null;}
  const destination=OUT+'/'+sourceHash.slice(0,24)+'.webp';let encoded;
  try{await access(destination);encoded=await readFile(destination);}catch{encoded=await sharp(bytes,{animated:true,limitInputPixels:false}).webp({lossless:true,effort:4,alphaQuality:100}).toBuffer();}
  if(encoded.length>=row.bytes*.92){skipped.push({...row,reason:'less-than-eight-percent-saving'});return null;}
  const original=await sharp(bytes,{animated:true,limitInputPixels:false}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const output=await sharp(encoded,{animated:true,limitInputPixels:false}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const target=await sharp(encoded,{animated:true,limitInputPixels:false}).metadata();
  if(original.info.width!==output.info.width||original.info.height!==output.info.height||original.info.channels!==4||output.info.channels!==4||visibleHash(original.data)!==visibleHash(output.data)||JSON.stringify(metadata.delay)!==JSON.stringify(target.delay)||metadata.loop!==target.loop){skipped.push({...row,reason:'pixel-or-animation-mismatch'});return null;}
  await writeFile(destination,encoded);
  return {path:row.path,destination,sourceHash,optimizedHash:hash(encoded),sourceBytes:row.bytes,optimizedBytes:encoded.length,width:metadata.width,height:metadata.pageHeight||metadata.height,frames:metadata.pages||1,hasAlpha:metadata.hasAlpha,pixelExact:true};
 })();dedup.set(sourceHash,job);const result=await job;if(result)rows.push(result);
}
let cursor=0,done=0;
async function worker(){while(cursor<candidates.length){const row=candidates[cursor++];try{await convert(row);}catch(error){skipped.push({...row,reason:'conversion-error',error:error.message});}done++;if(done%40===0)console.log(JSON.stringify({done,total:candidates.length,optimized:rows.length,savedMiB:Math.round(rows.reduce((s,r)=>s+r.sourceBytes-r.optimizedBytes,0)/1048576)}));}}
console.log(JSON.stringify({candidates:candidates.length,sourceMiB:Math.round(candidates.reduce((s,r)=>s+r.bytes,0)/1048576)}));
await Promise.all([worker(),worker()]);rows.sort((a,b)=>a.path.localeCompare(b.path));
const map=Object.fromEntries(rows.map(r=>['/'+r.path.split('/').map(encodeURIComponent).join('/'),'/'+r.destination]));
const manifest={version:VERSION,method:'lossless-webp-same-dimensions-and-alpha',sourceFilesUnchanged:true,files:rows,skipped,sourceBytes:rows.reduce((s,r)=>s+r.sourceBytes,0),optimizedBytes:rows.reduce((s,r)=>s+r.optimizedBytes,0)};
await writeFile('docs/image-delivery-20261015/manifest.json',JSON.stringify(manifest,null,2)+'\n');
await writeFile('js/image-delivery-map-20261015.js','globalThis.CNineImageDeliveryMap='+JSON.stringify({version:VERSION,map})+';\n');
console.log(JSON.stringify({complete:true,files:rows.length,sourceMiB:Math.round(manifest.sourceBytes/1048576),optimizedMiB:Math.round(manifest.optimizedBytes/1048576),skipped:skipped.length}));
