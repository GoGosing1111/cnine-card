export function partition(image,count,rows){
 const {width:w,height:h}=image.info,labels=new Int32Array(w*h),components=[];let label=0;
 const gridWhite=p=>{const [r,g,b,a]=image.data.subarray(p*4,p*4+4);return a>90&&Math.min(r,g,b)>200&&Math.max(r,g,b)-Math.min(r,g,b)<45;};
 const columns=count/rows;
 for(let k=1;k<columns;k++)for(let x=Math.round(k*w/columns)-2;x<=Math.round(k*w/columns)+1;x++){let line=0;for(let y=0;y<h;y++)if(gridWhite(y*w+x))line++;if(line>h*.7)for(let y=0;y<h;y++)image.data.fill(0,(y*w+x)*4,(y*w+x)*4+4);}
 for(let k=1;k<rows;k++)for(let y=Math.round(k*h/rows)-2;y<=Math.round(k*h/rows)+1;y++){let line=0;for(let x=0;x<w;x++)if(gridWhite(y*w+x))line++;if(line>w*.7)image.data.fill(0,y*w*4,(y+1)*w*4);}
 for(let p=0;p<w*h;p++){
  if(labels[p]||image.data[p*4+3]<100)continue;
  const stack=[p];labels[p]=++label;let pixels=0,x0=w,y0=h,x1=-1,y1=-1;
  while(stack.length){const n=stack.pop(),x=n%w,y=Math.floor(n/w);pixels++;x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);
   for(const q of [x>0?n-1:-1,x<w-1?n+1:-1,y>0?n-w:-1,y<h-1?n+w:-1])if(q>=0&&!labels[q]&&image.data[q*4+3]>=100){labels[q]=label;stack.push(q);}
  }
  if(pixels>Math.max(1500,w*h/count*.045))components.push({label,pixels,x0,y0,x1,y1});
 }
 components.sort((a,b)=>Math.floor((a.y0+a.y1)/2/(h/rows))-Math.floor((b.y0+b.y1)/2/(h/rows))||a.x0-b.x0);
 if(components.length!==count)throw Error(`Expected ${count} separate bodies, found ${components.length}. Inspect and repair this source only.`);
 const big=new Map(components.map((c,i)=>[c.label,i+1])),owner=new Uint8Array(w*h),queue=new Int32Array(w*h);let end=0;
 for(let p=0;p<w*h;p++){const id=big.get(labels[p]);if(id){owner[p]=id;queue[end++]=p;}}
 for(let next=0;next<end;next++){const p=queue[next],x=p%w,y=Math.floor(p/w);for(const q of [x>0?p-1:-1,x<w-1?p+1:-1,y>0?p-w:-1,y<h-1?p+w:-1])if(q>=0&&!owner[q]&&image.data[q*4+3]>0){owner[q]=owner[p];queue[end++]=q;}}
 for(let p=0;p<w*h;p++)if(!owner[p]&&image.data[p*4+3]>0){const x=p%w,y=Math.floor(p/w);let best=Infinity,id=0;components.forEach((c,i)=>{const dx=Math.max(c.x0-x,0,x-c.x1),dy=Math.max(c.y0-y,0,y-c.y1),d=dx*dx+dy*dy;if(d<best){best=d;id=i+1;}});if(best<=25)owner[p]=id;}
 return {components,owner};
}
