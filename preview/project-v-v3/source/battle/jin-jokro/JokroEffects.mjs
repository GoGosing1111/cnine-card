import {Assets,Texture,Rectangle,Container,Sprite,Graphics,Point} from 'pixi.js';
import presentation from './presentation.json' with {type:'json'};
import {installSwordUltimate,renderSwordUltimate} from './SwordUltimates.mjs';
const clamp=x=>Math.max(0,Math.min(1,x));
export class JokroEffects{
 static async load(base){const manifest=await(await fetch(base+'effects/runtime/fx-manifest.json')).json(),ultimate=await(await fetch(base+'effects/sword-ultimates-v10/runtime/fx-manifest.json')).json(),textures={};delete manifest.effects.descent;delete manifest.effects.storm;for(const[id,s]of Object.entries(ultimate.effects))manifest.effects[id]={...s,atlas:'../sword-ultimates-v10/runtime/'+s.atlas};for(const[id,s]of Object.entries(manifest.effects)){const atlas=await Assets.load(base+'effects/runtime/'+s.atlas);textures[id]=s.frames.map(f=>new Texture({source:atlas.source,frame:new Rectangle(f.x,f.y,f.w,f.h)}));}return{manifest,textures};}
 constructor(adapter,id,targets){Object.assign(this,{adapter,id,targets,assets:adapter.assets,disposed:false,time:0});this.layers=new Map();this.frames={};const e=adapter.engine;
  this.back=new Container();this.back.label='JOKRO_FX_BACK';this.back.zIndex=-100000;e.combatLayer.addChildAt(this.back,0);this.front=new Container();this.front.label='JOKRO_FX_FRONT';this.front.zIndex=100000;e.combatLayer.addChild(this.front);
  this.shade=new Graphics().rect(-200,-400,2400,1800).fill({color:0x120000,alpha:1});this.shade.alpha=0;this.back.addChild(this.shade);
  if(adapter.actionSpec.ultimate)installSwordUltimate(this);else{this.add('main',id);this.add('charge','pressure',true);this.add('charge-sparks','shards');targets.forEach((_,i)=>{this.add('impact'+i,'shards');this.add('ground'+i,'pressure',true);});}
  const shell=e.host.closest('.battle-v3-live-shell'),css=shell?getComputedStyle(shell):null,left=parseFloat(css?.getPropertyValue('--v3-hud-left'))||18,right=parseFloat(css?.getPropertyValue('--v3-hud-right'))||18,top=parseFloat(css?.getPropertyValue('--v3-hud-top'))||72;
  const tl=e.combatLayer.toLocal(new Point(left+16,top+12)),br=e.combatLayer.toLocal(new Point(e.app.screen.width-right-16,e.app.screen.height-18));this.field={left:tl.x,top:tl.y,right:br.x,bottom:br.y};
  this.ghosts=[];if(adapter.ghostFactory&&['thrust','storm','eclipse','descent'].includes(id))for(let i=0;i<(adapter.actionSpec.ultimate?4:2);i++){const rig=adapter.ghostFactory();rig.autoUpdate=false;rig.state.clearTracks();rig.skeleton.setupPose();const entry=rig.state.setAnimation(0,id,false);rig.tint=i?0x990000:0xff0000;rig.visible=false;this.back.addChild(rig);this.ghosts.push({rig,entry,delay:(i+1)*.055});}
 }
 add(id,asset,back=false){const spec=this.assets.manifest.effects[asset];if(!spec)return;const sprite=new Sprite(this.assets.textures[asset][0]);sprite.label='JOKRO_FX_'+id;sprite.blendMode=spec.blend;sprite.visible=false;(back?this.back:this.front).addChild(sprite);this.layers.set(id,{sprite,spec,asset});}
 paint(id,phase,point,width,{height,angle=0,alpha=1,origin=[.5,.5],mirror=1}={}){
  const row=this.layers.get(id);if(!row)return;const{sprite,spec,asset}=row,index=Math.floor(phase*spec.frames.length+1e-7);
  sprite.visible=this.adapter.fxEnabled&&index>=0&&index<spec.frames.length&&alpha>.005;this.frames[id]=sprite.visible?index:-1;if(!sprite.visible)return;
  const f=spec.frames[index],ink=spec.inkBounds,pivot=[ink.left+ink.width*origin[0],ink.top+ink.height*origin[1]],sourceHeight=height??width*ink.height/ink.width;
  const requestedWidth=width*presentation.effectScale,requestedHeight=sourceHeight*presentation.effectScale,cos=Math.cos(angle),sin=Math.sin(angle),field=this.field;
  // Fit the rotated visible ink, rather than transparent atlas padding, inside the battle field.
  const fit=Math.min(1,(field.right-field.left)/(Math.abs(cos)*requestedWidth+Math.abs(sin)*requestedHeight),(field.bottom-field.top)/(Math.abs(sin)*requestedWidth+Math.abs(cos)*requestedHeight));
  const w=requestedWidth*fit,h=requestedHeight*fit,corners=[[-origin[0],-origin[1]],[1-origin[0],-origin[1]],[1-origin[0],1-origin[1]],[-origin[0],1-origin[1]]].map(([x,y])=>({x:mirror*x*w*cos-y*h*sin,y:mirror*x*w*sin+y*h*cos}));
  const xs=corners.map(p=>p.x),ys=corners.map(p=>p.y),left=Math.min(...xs),right=Math.max(...xs),top=Math.min(...ys),bottom=Math.max(...ys);
  const x=Math.max(field.left-left,Math.min(field.right-right,point.x)),y=Math.max(field.top-top,Math.min(field.bottom-bottom,point.y));
  sprite.texture=this.assets.textures[asset][index];sprite.anchor.set((pivot[0]-spec.crop.left)*spec.rasterScale[0]/f.w,(pivot[1]-spec.crop.top)*spec.rasterScale[1]/f.h);
  sprite.scale.set(mirror*w/ink.width/spec.rasterScale[0],h/ink.height/spec.rasterScale[1]);sprite.position.set(x,y);sprite.rotation=angle;sprite.alpha=alpha;
  row.geometry={requestedWidth,requestedHeight,effectScale:presentation.effectScale,fit,width:w,height:h,mirror,rotation:angle,x,y,originPoint:{...point},bounds:{left:x+left,right:x+right,top:y+top,bottom:y+bottom}};
 }
 area(width,height,ground=false){const f=this.field,xs=this.targets.map(t=>t.root.x),ys=this.targets.map(t=>t.root.y),x=(Math.min(...xs)+Math.max(...xs))/2,y=(Math.min(...ys)+Math.max(...ys))/2,widthLimit=(f.right-f.left)*.90,heightLimit=(f.bottom-f.top)*.88;let w=Math.min(Math.max(width,Math.max(...xs)-Math.min(...xs)+160),widthLimit),h=Math.min(Math.max(height,Math.max(...ys)-Math.min(...ys)+110),heightLimit);return{width:w,height:h,point:{x:Math.max(f.left+w/2,Math.min(f.right-w/2,x)),y:ground?Math.max(f.top+h*.94,Math.min(f.bottom-h*.06,y)):Math.max(f.top+h/2,Math.min(f.bottom-h/2,y-45))}};}
 render(t){if(this.disposed)return;this.time=t;const ad=this.adapter,a=ad.actor,skill=ad.actionSpec,s=Math.abs(a.root.scale.x),facing=a.view.scale.x<0?-1:1,c=skill.contact;
  this.back.visible=this.front.visible=ad.fxEnabled;this.shade.alpha=(skill.area?.20:.03)*clamp(t/.15)*clamp((skill.duration-t)/.25);
  if(skill.ultimate){renderSwordUltimate(this,t);this.renderGhosts(t);return;}
  const starts={iaido:c-.10,cross:.22,thrust:c-.11,eclipse:.26,storm:.26,descent:.58},start=starts[this.id],phase=t<c?(t-start)/(c-start)*.44:.44+(t-c)/(this.id==='storm'?.48:.40),grip=ad.socket('grip_front',Math.min(t,c)),tip=ad.socket('tip_front',Math.min(t,c)),angle=Math.atan2((tip.y-grip.y)*facing,(tip.x-grip.x)*facing);
  const victim=this.targets[0],chest={x:victim.root.x,y:victim.root.y-(victim.art?.bodyHeight||285)*Math.abs(victim.root.scale.x)*.46};
  if(this.id==='iaido')this.paint('main',phase,{x:(grip.x+tip.x)/2,y:(grip.y+tip.y)/2},730*s,{height:310*s,origin:[.46,.52],angle,mirror:facing});
  else if(this.id==='cross')this.paint('main',phase,chest,610*s,{height:610*s,mirror:facing});
  else if(this.id==='thrust')this.paint('main',phase,tip,960*s,{height:270*s,origin:[.92,.5],angle,mirror:facing});
  else if(this.id==='eclipse'){const q=this.area(1370*s,900*s);this.paint('main',phase,q.point,q.width,{height:q.height,angle:(clamp(phase)-.44)*.45*presentation.eclipseDirection,mirror:facing*presentation.eclipseDirection});}
  else if(this.id==='storm'){const q=this.area(1450*s,1040*s);this.paint('main',phase,q.point,q.width,{height:q.height,mirror:facing});}
  this.paint('charge',(t-.04)/.42,ad.rootAt(Math.min(t,.13)),(skill.area?560:350)*s,{height:(skill.area?135:90)*s,alpha:.65});
  this.paint('charge-sparks',(t-.08)/.38,ad.socket('grip_front',Math.min(t,.20)),210*s,{alpha:.70});
  this.targets.forEach((target,i)=>{const floor={x:target.root.x,y:target.root.y},chest={x:floor.x,y:floor.y-(target.art?.bodyHeight||285)*Math.abs(target.root.scale.x)*.46};this.paint('impact'+i,(t-c)/.45,chest,(skill.area?650:450)*s);this.paint('ground'+i,(t-c)/.50,floor,(skill.area?920:570)*s,{height:125*s});if(this.id==='storm'){const begin=.37+i*.21;this.paint('combo'+i,(t-begin)/.30,chest,420*s,{height:500*s,angle:(i%2?-.4:.35),alpha:.9});}});
  this.renderGhosts(t);
 }
 renderGhosts(t){const ad=this.adapter,skill=ad.actionSpec,c=skill.contact,s=Math.abs(ad.actor.root.scale.x);for(const[i,g]of this.ghosts.entries()){const past=t-g.delay,p=ad.rootAt(past),active=skill.ultimate?(skill.visualContacts||[]).some(beat=>t>beat-.22&&t<beat+.20):past>skill.travel.depart&&t<c+.16;g.rig.visible=ad.fxEnabled&&past>0&&active;g.rig.alpha=skill.ultimate?.28-i*.06:(.22-i*.07)*clamp((c+.16-t)/.14);if(g.rig.visible){g.rig.position.set(p.x,p.y);g.rig.scale.set(ad.rig.scale.x*s*ad.facingAt(past),ad.rig.scale.y*s);g.entry.trackTime=past;g.rig.update(0);}}}
 audit(){return{time:this.time,enabled:this.adapter.fxEnabled,active:[...this.layers.values()].filter(r=>r.sprite.visible).length,ghosts:this.ghosts.filter(g=>g.rig.visible).length,frames:{...this.frames},geometry:Object.fromEntries([...this.layers].filter(([,r])=>r.sprite.visible).map(([id,r])=>[id,r.geometry])),composition:this.composition,native:'Effekseer 1.70e',disposed:this.disposed};}
 destroy(){if(this.disposed)return;this.disposed=true;for(const l of[this.back,this.front]){l.removeFromParent();l.destroy({children:true,texture:false,textureSource:false});}}
}
