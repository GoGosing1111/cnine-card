export const clamp=(v,a=0,b=1)=>Math.min(b,Math.max(a,v));
export const mix=(a,b,u)=>a+(b-a)*u;
export const smooth=u=>{u=clamp(u);return u*u*(3-2*u);};
export const radians=Math.PI/180;
export const fade=(u,inPart=.05,outPart=.16)=>smooth(u/inPart)*smooth((1-u)/outPart);
export function anchor(pos,placement){
 const base=placement[pos.anchor],s=placement.scale;
 return [base[0]+pos.x*s*placement.facing,base[1]+pos.y*s];
}
function area(ctx,r,img,frame,x,y,w,h){
 const [l,t,sw,sh]=r.rects[frame],sx=img.naturalWidth/r.size[0],sy=img.naturalHeight/r.size[1];
 ctx.drawImage(img,l*sx,t*sy,sw*sx,sh*sy,x,y,w,h);
}
export function stamp(ctx,art,name,u,x,y,w,h,{angle=0,flip=1,pivot=[.5,.5],alpha=1,bloom=.40}={}){
 const r=art[name];if(!r||u<0||u>=1||alpha<=.004||w<.1||h<.1)return;
 const t=u*r.duration;let i=0;while(i+1<r.time.length&&r.time[i+1]<=t)i++;
 const j=Math.min(i+1,r.rects.length-1),relative=(t-r.time[i])/((r.time[i+1]??r.duration)-r.time[i]||1);
 const span=name==='fork'?.16:name==='gust'||name==='rift'?.65:.42,blend=j!==i?smooth((relative-1+span)/span):0;
 const opacity=ctx.globalAlpha*alpha*fade(u,.019,.105),left=-pivot[0]*w,top=-pivot[1]*h;
 ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.scale(flip,1);
 const layers=(img,a)=>{ctx.globalAlpha=clamp(a*(1-blend));area(ctx,r,img,i,left,top,w,h);if(blend>.002){ctx.globalAlpha=clamp(a*blend);area(ctx,r,img,j,left,top,w,h);}};
 if(r.light&&bloom>.001){ctx.globalCompositeOperation='lighter';layers(r.light,opacity*bloom);ctx.globalCompositeOperation='source-over';}
 layers(r.im,opacity);
 ctx.restore();
}
export function paintEvent(ctx,art,e,u,placement){
 const s=placement.scale,f=placement.facing,p=anchor(e.pos,placement),peak=art[e.art].time[art[e.art].peak]/art[e.art].duration;
 const drag=smooth(u/Math.max(.1,peak)),release=1-(1-clamp((u-peak)/(1-peak)))**2;
 const a=e.approach||[0,0],d=e.drift||[0,0];p[0]+=f*s*(a[0]*(1-drag)+d[0]*release);p[1]+=s*(a[1]*(1-drag)+d[1]*release);
 stamp(ctx,art,e.art,u,...p,e.w*s,e.h*s,{alpha:e.alpha??1,bloom:e.bloom??.49,pivot:e.pivot,flip:f*(e.flip||1),angle:f*((e.angle||0)+(e.turn||0)*smooth(u))*radians});
}
export function link(ctx,art,A,B,u,width,alpha=1,bloom=.69){
 const dx=B[0]-A[0],dy=B[1]-A[1],dist=Math.hypot(dx,dy);
 // The outer 6% of the texture is transparent. Register the bright channel ends at A and B.
 stamp(ctx,art,'fork',u,(A[0]+B[0])/2,(A[1]+B[1])/2,dist*1.135,Math.max(width*1.51,dist*.39),{angle:Math.atan2(dy,dx),alpha,bloom});
}
