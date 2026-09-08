import sharp from 'sharp';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const dir=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(dir,'../..');
const input=path.join(dir,'assets/sources/ignis-x-extracted-source-v1.png'),output=path.join(dir,'assets/ignis-x-cutout.png');
// Same approved connected-light-background process. This changes alpha only;
// all red/black vehicle RGB values and proportions remain untouched.
execFileSync(process.execPath,[path.join(root,'scripts/remove-connected-light-background.cjs'),input,output]);
const {data,info}=await sharp(output).ensureAlpha().raw().toBuffer({resolveWithObject:true});
const seen=new Uint8Array(info.width*info.height),queue=new Uint32Array(seen.length);let head=0,tail=0;
const visit=(x,y)=>{if(x<0||y<0||x>=info.width||y>=info.height)return;const i=y*info.width+x,o=i*4;if(seen[i]||!data[o+3])return;const a=data[o],b=data[o+1],c=data[o+2];if(Math.max(a,b,c)-Math.min(a,b,c)>14||(a+b+c)/3<205)return;seen[i]=1;queue[tail++]=i;};
// Interior air openings between the authored turbine support struts and nose.
for(const [x,y]of [[835,335],[1010,288],[1160,322],[790,350],[405,470],[969,267],[1031,280],[1046,281],[733,371]])visit(x,y);
while(head<tail){const p=queue[head++],x=p%info.width,y=Math.floor(p/info.width);data[p*4+3]=0;visit(x-1,y);visit(x+1,y);visit(x,y-1);visit(x,y+1);}
if(tail>info.width*info.height*.1)throw Error('Ignis interior mask exceeded review bound');
await sharp(data,{raw:{width:info.width,height:info.height,channels:4}}).png().toFile(output+'.tmp.png');
// Formatting/build output replacement, not an approved source overwrite.
const {rename}=await import('node:fs/promises');await rename(output+'.tmp.png',output);
console.log(`Ignis true alpha prepared; ${tail} enclosed-background pixels removed, source RGB locked.`);
