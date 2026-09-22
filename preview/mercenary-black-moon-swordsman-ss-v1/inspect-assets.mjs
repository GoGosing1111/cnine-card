import sharp from 'sharp';
import fs from 'node:fs/promises';
const base=new URL('./assets/',import.meta.url);
export async function inspect(file){
 const bytes=await fs.readFile(new URL(file,base));
 const {data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const {width:w,height:h}=info,n=w*h,seen=new Uint8Array(n),queue=new Int32Array(n),components=[];
 let clear=0,solid=0,border=0;
 for(let p=0;p<n;p++){const a=data[p*4+3];if(a===0)clear++;if(a>240)solid++;if(a>24&&(p<w||p>=n-w||p%w===0||p%w===w-1))border++;}
 for(let p=0;p<n;p++){
  if(seen[p]||data[p*4+3]<=24)continue;
  let head=0,tail=1,count=0,x0=w,y0=h,x1=0,y1=0;queue[0]=p;seen[p]=1;
  while(head<tail){const at=queue[head++],x=at%w,y=Math.floor(at/w);count++;x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);
   for(const q of [x>0?at-1:-1,x<w-1?at+1:-1,y>0?at-w:-1,y<h-1?at+w:-1])if(q>=0&&!seen[q]&&data[q*4+3]>24){seen[q]=1;queue[tail++]=q;}
  }
  if(count>=1000)components.push({pixels:count,box:[x0,y0,x1+1,y1+1]});
 }
 return {width:w,height:h,clear:clear/n,solid:solid/n,border,components:components.sort((a,b)=>b.pixels-a.pixels)};
}
if(process.argv[1]?.endsWith('inspect-assets.mjs'))for(const file of ['battle-sprite-v2.png','descending-motion-v2.png','rising-motion-v2.png','finisher-motion-v2.png','triple-sever-fx-v2.png'])console.log(JSON.stringify({file,...await inspect(file)}));
