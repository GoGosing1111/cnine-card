import sharp from 'sharp';import fs from 'node:fs/promises';import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('./',import.meta.url));
for(const f of(await fs.readdir(root+'assets/sources')).filter(p=>/^body-.*(?<!-v1)\.png$/.test(p))){
 const {data,info}=await sharp(root+'assets/sources/'+f).ensureAlpha().raw().toBuffer({resolveWithObject:true}),seen=new Uint8Array(info.width*info.height),q=new Int32Array(seen.length),cc=[];
 for(let p=0;p<seen.length;p++){if(seen[p]||data[p*4+3]<30)continue;let a=0,b=1,l=info.width,t=info.height,r=0,d=0;q[0]=p;seen[p]=1;while(a<b){const v=q[a++],x=v%info.width,y=Math.floor(v/info.width);l=Math.min(l,x);r=Math.max(r,x);t=Math.min(t,y);d=Math.max(d,y);for(const n of[x?v-1:-1,x<info.width-1?v+1:-1,y?v-info.width:-1,y<info.height-1?v+info.width:-1])if(n>=0&&!seen[n]&&data[n*4+3]>=30){seen[n]=1;q[b++]=n;}}if(b>9000)cc.push({l,t,r,d,pixels:b});}
 cc.sort((a,b)=>Math.floor((a.t+a.d)/info.height)-Math.floor((b.t+b.d)/info.height)||a.l-b.l);
 console.log(JSON.stringify({f,w:info.width,h:info.height,cc}));
}
await sharp(root+'assets/locked/source-blade.png').extract({left:0,top:0,width:429,height:700}).resize({width:858}).png().toFile(root+'qa/blade-upper-inspection.png');
