export function components(data,w,h,minPixels=12000){
 const seen=new Uint8Array(w*h),q=new Int32Array(w*h),out=[];
 for(let p=0;p<w*h;p++){
  if(seen[p]||data[p*4+3]<=24)continue;
  let a=0,b=1,x0=w,y0=h,x1=0,y1=0;q[0]=p;seen[p]=1;const ids=[];
  while(a<b){const i=q[a++],x=i%w,y=(i/w)|0;ids.push(i);x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);
   for(const n of[x?i-1:-1,x<w-1?i+1:-1,y?i-w:-1,y<h-1?i+w:-1])if(n>=0&&!seen[n]&&data[n*4+3]>24){seen[n]=1;q[b++]=n;}
  }
  if(ids.length>minPixels)out.push({ids,box:{left:x0,top:y0,width:x1-x0+1,height:y1-y0+1}});
 }
 return out.sort((a,b)=>Math.floor((a.box.top+a.box.height/2)/(h/2))-Math.floor((b.box.top+b.box.height/2)/(h/2))||a.box.left-b.box.left);
}
