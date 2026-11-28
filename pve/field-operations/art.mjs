function imageFor(url){return new Promise((ok,no)=>{const i=new Image();i.onload=()=>ok(i);i.onerror=no;i.src=url})}
function cutArm(image,runtime){
 const edge=[[0,0],[.273,0],[.282,.164],[.296,.20],[.319,.207],[.335,.222],[.363,.239],[.389,.276],[.408,.312],[.404,.346],[.386,.365],[.353,.369],[.327,.357],[.322,.395],[.310,.476],[.311,.53],[.316,.585],[.30,.632],[.27,.679],[.21,.712],[.14,.726],[0,.744]];
 const w=image.naturalWidth,h=image.naturalHeight;
 const cleaned=document.createElement('canvas');cleaned.width=w;cleaned.height=h;const clean=cleaned.getContext('2d');clean.drawImage(image,0,0);
 const box={x:Math.floor(.595*w),y:Math.floor(.393*h),w:Math.ceil(.154*w),h:Math.ceil(.25*h)};
 const patch=clean.getImageData(box.x,box.y,box.w,box.h),px=patch.data;
 const seedX=Math.floor(.65*w)-box.x,seedY=Math.floor(.48*h)-box.y,q=[seedY*box.w+seedX];
 for(let j=0;j<q.length;j++){const k=q[j],i=k*4;if(!px[i+3])continue;const lo=Math.min(px[i],px[i+1],px[i+2]),hi=Math.max(px[i],px[i+1],px[i+2]);if(lo<145||hi-lo>21)continue;
   px[i+3]=0;const x=k%box.w,y=Math.floor(k/box.w);if(x)q.push(k-1);if(x+1<box.w)q.push(k+1);if(y)q.push(k-box.w);if(y+1<box.h)q.push(k+box.w)}
 clean.putImageData(patch,box.x,box.y);
 const make=part=>{const c=document.createElement('canvas');c.width=w;c.height=h;const cx=c.getContext('2d');cx.drawImage(cleaned,0,0);cx.globalCompositeOperation=part?'destination-in':'destination-out';cx.beginPath();edge.forEach(([x,y],i)=>cx[i?'lineTo':'moveTo'](x*w,y*h));cx.closePath();cx.fill();return smoothTexture(runtime.Texture.from(c))};
 return {body:make(false),arm:make(true),w,h};
}
function smoothTexture(t){const src=t?.source;if(src){src.autoGenerateMipmaps=true;src.scaleMode='linear';src.style.mipmapFilter='linear';src.updateMipmaps?.()}return t}
function roadTexture(image,rt){
 const c=document.createElement('canvas');c.width=550;c.height=248;
 const ctx=c.getContext('2d');const source=document.createElement('canvas');source.width=400;source.height=268;
 const sc=source.getContext('2d');sc.drawImage(image,0,0,400,268);sc.globalCompositeOperation='destination-in';
 const hull=[[5,71],[8,25],[17,16],[37,14],[40,9],[49,11],[56,7],[77,5],[89,9],[127,16],[133,21],[145,29],[146,70],[136,86],[121,93],[114,99],[91,95],[47,85],[24,79]];
 sc.beginPath();hull.forEach(([x,y],i)=>sc[i?'lineTo':'moveTo'](x,y));sc.closePath();sc.fill();
 const plate=(x,y,angle,scale)=>{ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.scale(scale,scale);ctx.drawImage(source,3,4,146,97,-73,-49,146,97);ctx.restore()};
 plate(353,131,.50,1.14);plate(180,134,-.24,1.92);plate(426,189,-.33,.55);
 return smoothTexture(rt.Texture.from(c));
}

export {imageFor,cutArm,roadTexture,smoothTexture};
