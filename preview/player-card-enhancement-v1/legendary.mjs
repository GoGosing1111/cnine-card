import {hash,burstEnvelope,BURST_DURATION} from './model.mjs';

// A 5 x 5 layout preserves crest, corner sculptures and side gems. Only plain
// connecting rails stretch; the generated PNG itself is never altered.
export function createLegendaryFrame(pixi,texture,glow){
 const {Container,Sprite,Rectangle,Graphics}=pixi;
 const container=new Container(),art=new Container(),lights=new Container(),dust=new Container(),stars=new Graphics();
 container.addChild(art,lights,dust,stars);lights.blendMode='add';dust.blendMode='add';stars.blendMode='add';
 const xCuts=[0,288,320,1216,1248,1536],yCuts=[0,320,420,590,724,1024],slices=[],textures=[];
 for(let row=0;row<5;row++)for(let col=0;col<5;col++){
  const cut=new texture.constructor({source:texture.source,frame:new Rectangle(xCuts[col],yCuts[row],xCuts[col+1]-xCuts[col],yCuts[row+1]-yCuts[row])});
  const sprite=new Sprite(cut);art.addChild(sprite);textures.push(cut);slices.push({sprite,row,col});
 }
 const sources=[[768,130],[110,145],[1425,145],[110,850],[1425,850],[110,493],[1425,493],[768,872]];
 const jewels=sources.map(()=>{const halo=new Sprite(glow),h=new Sprite(glow),v=new Sprite(glow);for(const s of [halo,h,v]){s.anchor.set(.5);lights.addChild(s)}return{halo,h,v,x:0,y:0}});
 const particles=Array.from({length:76},()=>{const s=new Sprite(glow);s.anchor.set(.5);dust.addChild(s);return s});
 let rect,scale=.44;
 function mapped(value,cuts,lengths){let sum=0;for(let i=0;i<lengths.length;i++){if(value<=cuts[i+1])return sum+(value-cuts[i])/(cuts[i+1]-cuts[i])*lengths[i];sum+=lengths[i]}return sum}
 function resize(bounds){
  // User approved the relic design and asked for a slightly thinner frame.
  // Scale sculpted pieces uniformly; never squash their original artwork.
  rect=bounds;scale=Math.min(.44,rect.w/1600)*.85;
  const side=109*scale,top=156*scale,bottom=124*scale,wholeW=rect.w+side*2,wholeH=rect.h+top+bottom;
  const dx=(wholeW-(288*2+896)*scale)/2,dy=(wholeH-(320+170+300)*scale)/2;
  const widths=[288*scale,dx,896*scale,dx,288*scale],heights=[320*scale,dy,170*scale,dy,300*scale];
  const left=rect.x-side,above=rect.y-top;
  for(const {sprite,row,col} of slices){sprite.position.set(left+widths.slice(0,col).reduce((a,b)=>a+b,0),above+heights.slice(0,row).reduce((a,b)=>a+b,0));sprite.width=widths[col]+.25;sprite.height=heights[row]+.25}
  sources.forEach(([x,y],i)=>{
   const j=jewels[i];j.x=left+mapped(x,xCuts,widths);j.y=above+mapped(y,yCuts,heights);
   for(const sprite of [j.halo,j.h,j.v])sprite.position.set(j.x,j.y);
   j.halo.width=j.halo.height=(i===0?210:140)*scale/.44;
   j.h.width=(i===0?170:100)*scale/.44;j.h.height=3.3;j.v.width=3;j.v.height=(i===0?115:72)*scale/.44;
  });
 }
 function paint(t,burst,enabled){
  container.visible=enabled;if(!enabled||!rect)return;
  const b=burst<BURST_DURATION?burstEnvelope(burst):{flash:0,release:0,charge:0},exposure=b.flash*.8+b.release*.12;
  stars.clear();
  jewels.forEach((j,i)=>{
   const radiance=.52+Math.sin(t*.85+i*.81)*.2,spark=Math.pow(Math.max(0,Math.sin(t*.72+i*1.32)),7);
   j.halo.tint=i%3===0?0xb59aff:0x69cfff;j.halo.alpha=radiance*.68+exposure;
   j.h.tint=0xfff4d7;j.v.tint=0xe3eeff;j.h.alpha=.08+spark*.9+exposure;j.v.alpha=.05+spark*.75+exposure;
  });
  const count=rect.w<500?34:76;
  for(let i=0;i<particles.length;i++){
   const p=particles[i];p.visible=i<count;if(i>=count)continue;
   const seed=hash(i+734),life=(t*(.12+hash(i+552)*.08)+seed)%1,alpha=Math.sin(life*Math.PI),side=i%4,along=hash(i+221),distance=16+life*(rect.w<500?28:65),sway=Math.sin(t*.5+i)*5;
   let x,y;
   if(side===0){x=rect.x+along*rect.w+sway;y=rect.y-distance}
   else if(side===1){x=rect.x+rect.w+distance;y=rect.y+along*rect.h-life*20}
   else if(side===2){x=rect.x+along*rect.w+sway;y=rect.y+rect.h+distance}
   else{x=rect.x-distance;y=rect.y+along*rect.h-life*20}
   const size=1.8+hash(i+438)*3.2;p.position.set(x,y);p.width=p.height=size*3;p.tint=i%3===0?0xffdf9e:0xbddeff;p.alpha=alpha*(.5+hash(i+54)*.5);
   if(i%7===0){const r=2+alpha*3;stars.poly([x,y-r,x+r*.16,y-r*.16,x+r,y,x+r*.16,y+r*.16,x,y+r,x-r*.16,y+r*.16,x-r,y,x-r*.16,y-r*.16]).fill({color:0xfff6df,alpha:alpha*.7})}
  }
 }
 return{container,resize,paint,destroy(){textures.forEach(t=>t.destroy(false))}};
}
