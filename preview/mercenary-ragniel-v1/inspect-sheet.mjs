import sharp from 'sharp';
const {data,info}=await sharp(process.argv[2]).ensureAlpha().raw().toBuffer({resolveWithObject:true});
const w=info.width,h=info.height,seen=new Uint8Array(w*h),groups=[];
for(let n=0;n<w*h;n++){
 if(seen[n]||data[n*4+3]<48)continue;
 const stack=[n];seen[n]=1;let pixels=0,x0=w,y0=h,x1=-1,y1=-1;
 while(stack.length){const p=stack.pop(),x=p%w,y=Math.floor(p/w);pixels++;x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);
  for(const q of [x>0?p-1:-1,x<w-1?p+1:-1,y>0?p-w:-1,y<h-1?p+w:-1])if(q>=0&&!seen[q]&&data[q*4+3]>=48){seen[q]=1;stack.push(q);}
 }
 if(pixels>2000)groups.push({pixels,bounds:[x0,y0,x1,y1]});
}
console.log(JSON.stringify({width:w,height:h,groups}));
