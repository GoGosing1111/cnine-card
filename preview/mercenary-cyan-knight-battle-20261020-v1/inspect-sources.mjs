import fs from 'node:fs/promises';
import sharp from 'sharp';
import {fileURLToPath} from 'node:url';
const root=new URL('./',import.meta.url),file=p=>fileURLToPath(new URL(p,root));
export function components(data,w,h){
 const seen=new Uint8Array(w*h),q=new Int32Array(w*h),out=[];
 for(let p=0;p<w*h;p++){
  if(seen[p]||data[p*4+3]<=24)continue;
  let a=0,b=1,x0=w,y0=h,x1=0,y1=0;q[0]=p;seen[p]=1;const ids=[];
  while(a<b){const i=q[a++],x=i%w,y=(i/w)|0;ids.push(i);x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);
   for(const n of[x?i-1:-1,x<w-1?i+1:-1,y?i-w:-1,y<h-1?i+w:-1])if(n>=0&&!seen[n]&&data[n*4+3]>24){seen[n]=1;q[b++]=n;}}
  if(ids.length>12000)out.push({ids,box:{left:x0,top:y0,width:x1-x0+1,height:y1-y0+1}});
 }
 return out.sort((a,b)=>Math.floor((a.box.top+a.box.height/2)/(h/2))-Math.floor((b.box.top+b.box.height/2)/(h/2))||a.box.left-b.box.left);
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 await fs.mkdir(file('qa/sources'),{recursive:true});
 const specs=JSON.parse(await fs.readFile(file('body-prompts-revision-v2.json'))),names=(specs.specs||specs.sheets||specs.poses||[]).map(s=>s.id);
 const list=names.length?names:Object.keys(JSON.parse(await fs.readFile(file('generation-provenance.json'))).body);
 const report={bodies:{},effects:{}};
 for(const name of list){
  const src=file('assets/sources/body-'+name+'.png'),{data,info}=await sharp(src).ensureAlpha().raw().toBuffer({resolveWithObject:true}),cc=components(data,info.width,info.height);
  const edges=[0,0,0,0];for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++)if(data[(y*info.width+x)*4+3]>24){if(!x)edges[0]++;if(x===info.width-1)edges[1]++;if(!y)edges[2]++;if(y===info.height-1)edges[3]++;}
  report.bodies[name]={width:info.width,height:info.height,edges,components:cc.map(c=>({...c.box,pixels:c.ids.length}))};
  let marks='';for(let x=0;x<info.width;x+=100)marks+='<path d="M'+x+' 0V'+info.height+'" stroke="#22ccff" opacity=".18"/><text x="'+(x+3)+'" y="16">'+x+'</text>';
  for(let y=100;y<info.height;y+=100)marks+='<path d="M0 '+y+'H'+info.width+'" stroke="#22ccff" opacity=".18"/><text x="3" y="'+(y-3)+'">'+y+'</text>';
  const svg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="'+info.width+'" height="'+info.height+'"><g fill="#e0f8ff" font-family="Arial" font-size="15">'+marks+'</g></svg>');
  await sharp(src).flatten({background:'#243141'}).composite([{input:svg}]).png().toFile(file('qa/sources/'+name+'.png'));
 }
 for(const name of['dash','horizon','flurry','meteor','array','rift','ground']){
  const src=file('assets/sources/fx-'+name+'.png'),{data,info}=await sharp(src).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  let min=255,max=0,transparent=0;for(let i=3;i<data.length;i+=4){min=Math.min(min,data[i]);max=Math.max(max,data[i]);if(data[i]<8)transparent++;}
  report.effects[name]={width:info.width,height:info.height,minAlpha:min,maxAlpha:max,transparent};
 }
 await fs.writeFile(file('qa/source-report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}
