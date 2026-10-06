// Export the two user-approved attachments. Never redraw or overwrite source pixels.
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import sharp from 'sharp';
import {ICON_CARD_ROSTER} from '../shared/icon-card-roster-v1.mjs';
const root=new URL('../',import.meta.url),base=new URL('preview/icon-battle-assets-v1/',root);
const card=ICON_CARD_ROSTER.find(c=>c.code==='ICON-OH-JOEUN');
const source='assets/source/oh-joeun-medic-sd-approved-20261006.png';
const runtime='assets/sd/oh-joeun-medic-sd-20261006.webp';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex').toUpperCase();
const bytes=await fs.readFile(new URL(source,base)),art=await fs.readFile(new URL(card.sourceArt,root));
if(hash(bytes)!=='C7F9249BF6C319806EFC42EB0BC962FAD6930525336EE8A769D72D4B68CE7514'||hash(art)!==card.sourceSha256)throw Error('Approved Joeun attachment hash mismatch');
const inspect=async input=>{
 const {data,info}=await sharp(input).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 let edgeMax=0,nonempty=0,partial=0,alphaTotal=0,minX=info.width,minY=info.height,maxX=-1,maxY=-1;
 for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){
  const a=data[(y*info.width+x)*4+3];alphaTotal+=a;if(a>0)nonempty++;if(a>0&&a<255)partial++;
  if(a>16){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}
  if(x===0||y===0||x===info.width-1||y===info.height-1)edgeMax=Math.max(edgeMax,a);
 }
 return {edgeMax,nonempty,partial,alphaTotal,transparentFraction:1-nonempty/(info.width*info.height),bounds:[minX,minY,maxX+1,maxY+1]};
};
// Existing ICON export: uniform fit into 672px, then 48px transparent safety padding.
const rendered=await sharp(bytes).resize(672,672,{fit:'contain',background:{r:0,g:0,b:0,alpha:0}}).extend({left:48,top:48,right:48,bottom:48,background:{r:0,g:0,b:0,alpha:0}}).webp({lossless:true,effort:6}).toBuffer();
await fs.writeFile(new URL(runtime,base),rendered);
const manifest=JSON.parse(await fs.readFile(new URL('manifest.json',base),'utf8'));
const row=manifest.characters.find(c=>c.code===card.code);
Object.assign(row,{source,sourceSha256:hash(bytes),sourceSize:[1024,1536],sourceAlpha:await inspect(bytes),
 generation:'USER_APPROVED_ATTACHMENT',visualApproval:'USER_APPROVED_20261006',
 sourceArt:card.sourceArt,sourceArtSha256:card.sourceSha256,portraitApproval:card.portraitApproval,
 weapon:'의료 슈트 · 녹색 주입기',runtime,runtimeSha256:hash(rendered),runtimeBytes:rendered.length,
 size:[768,768],footAnchor:{x:(160+544*672/1536)/768,y:(48+1516*672/1536)/768},runtimeAlpha:await inspect(rendered)});
await fs.writeFile(new URL('manifest.json',base),JSON.stringify(manifest,null,2)+'\n');
const approval={date:'2026-10-06',cardId:'CN-1C000004',code:card.code,userRequest:card.portraitApproval.userRequest,
 status:'USER_APPROVED_LIVE_ASSET_REPLACEMENT',sourceArt:{path:card.sourceArt,sha256:card.sourceSha256,size:[1080,1456],attachment:'codex-clipboard-27d5768f-10cb-4ad2-bad1-f091d0b859b2.png'},
 battleSd:{path:'preview/icon-battle-assets-v1/'+source,sha256:row.sourceSha256,size:row.sourceSize,attachment:'codex-clipboard-100910d2-b12e-42f7-acb3-290aa3e46a34.png'},
 runtime:{path:'preview/icon-battle-assets-v1/'+runtime,sha256:row.runtimeSha256,footAnchor:row.footAnchor,export:'Uniform contain resize and transparent padding; lossless WebP. Approved PNG bytes preserved.'},
 preservedPrevious:{sourceArt:'assets/cards/ICON/oh-joeun-source-v1.png',battleSd:'preview/icon-battle-assets-v1/assets/source/oh-joeun-sd-v1.png',runtime:'preview/icon-battle-assets-v1/assets/sd/oh-joeun-sd-v1.webp'},
 unchanged:['card ID','ownership','combat stats','skills','fusion policy','release state','other characters']};
await fs.writeFile(new URL('joeun-medic-approval-20261006.json',base),JSON.stringify(approval,null,2)+'\n');
console.log(JSON.stringify({cardId:approval.cardId,sourceArt:approval.sourceArt.path,runtime:approval.runtime}));
