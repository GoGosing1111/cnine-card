import {Sprite,Assets,Texture,Rectangle,Point} from 'pixi.js';
import {BlueGearEffects as LegacyEffects} from './BlueGearEffectsLegacy.mjs';
import {ACTIONS} from './skills.mjs';
const BASE="/assets/ui/project-v/mercenaries/astra-20261115/";
const common=['bg3-cast','bg3-target','bg3-muzzle'];
const needed={
 companion:['crawler'],
 attack_basic:['crawler',...common,'bg3-bullet','bg3-impact'],
 skill_drone:['drone',...common,'bg3-bullet','bg3-impact'],
 skill_siege:['crawler',...common,'bg3-shell','bg3-siege'],
 skill_fortress:['fortress',...common,'bg3-shell','bg3-rail','bg3-fortress']
};
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x)),lerp=(a,b,u)=>a+(b-a)*u;
export class BlueGearEffects extends LegacyEffects{
 static async create(engine){const [manifest,registration]=await Promise.all([fetch(BASE+'assets-v3.json').then(r=>r.json()),fetch(BASE+'pose-registration.json').then(r=>r.json())]);const fx=new BlueGearEffects(engine,manifest);fx.registration=registration;return fx;}
 async preload(action){const ids=action==='all'?Object.keys(this.manifest.assets):needed[action]||[];await Promise.all(ids.map(id=>{if(!this.loading.has(id))this.loading.set(id,(async()=>{const s=this.manifest.assets[id],atlas=await Assets.load(BASE+s.atlas+'?v='+s.sha256.slice(0,12));if(this.disposed)return;this.textures[id]=s.frames.map(f=>new Texture({source:atlas.source,frame:new Rectangle(f.x,f.y,f.w,f.h)}));})());return this.loading.get(id);}));}
 audit(){const a=super.audit(),seen=new Set();a.decodedBytes=0;for(const id of a.loaded){const s=this.manifest.assets[id];if(!seen.has(s.atlas)){seen.add(s.atlas);a.decodedBytes+=s.atlasSize[0]*s.atlasSize[1]*4;}}a.artSource=this.manifest.artSource;return a;}
 begin(adapter,mode,targets){
  this.clear();const owner=this,e=this.engine,a=adapter.actor,layer=e.effectLayer,spec=this.manifest.assets,objects=[],frames={},mechs=[],shots=[],marks=[];
  const local=p=>layer.toLocal(p),origin=local(a.root.parent.toGlobal(new Point(a.baseX,a.baseY))),unit=local(a.root.parent.toGlobal(new Point(a.baseX+Math.abs(a.restScale||a.root.scale.x),a.baseY))),scale=Math.hypot(unit.x-origin.x,unit.y-origin.y);
  const primary=targets[0],direction=local(primary.root.toGlobal(new Point())).x>=origin.x?1:-1,targetPoint=t=>local(t.root.toGlobal(new Point(0,-(t.art?.bodyHeight||300)*.52)));
  const point=(x,y)=>({x:origin.x+direction*x*scale,y:origin.y+y*scale});
  const bodyPoint=(pose,key='muzzle')=>{const p=owner.registration.poses[pose].sockets[key];return local(adapter.rig.toGlobal(new Point(p[0],-p[1])));};
  let serial=0,disposed=false,time=0;const duration=ACTIONS[mode].duration;
  function sprite(id,kind){const s=spec[id],v=new Sprite(owner.textures[id][0]);v.label='BLUEGEAR_'+kind+'_'+serial++;v.anchor.set(s.pivot[0]/s.frames[0].w,s.pivot[1]/s.frames[0].h);v.blendMode=s.blend;v.visible=false;layer.addChild(v);objects.push(v);return v;}
  function show(v,id,index,pos,kx,ky=kx,rotation=0,alpha=1){const s=spec[id];v.visible=index>=0&&index<s.frames.length&&alpha>0&&(s.kind==='mechanical'||owner.enabled);if(!v.visible)return;v.texture=owner.textures[id][index];const f=s.frames[index],pivot=f.pivot||s.pivot;v.anchor.set(pivot[0]/f.w,pivot[1]/f.h);v.position.set(pos.x,pos.y);v.scale.set(kx/s.rasterScale[0],ky/s.rasterScale[1]);v.rotation=rotation;v.alpha=alpha;frames[v.label]=index;}
  function mark(id,position,start,end,size,flat=false){const m={id,position,start,end,size,flat,v:sprite(id,id==='bg3-target'?'TARGET_MARK':'CAST_MARK')};marks.push(m);return m;}
  function mech(id,x,y,size,start,end,persistent=false){const m={id,x,y,size,start,end,persistent,shotTimes:[],v:null,frame:1};if(!persistent)mark('bg3-cast',()=>point(x,y),Math.max(0,start-.12),start+.95,size*1.06,true);m.v=sprite(id,'MECH');mechs.push(m);return m;}
  // A hollow command insignia forms near the owner, and individual lock marks
  // assemble on the target before each action. All are driven by V3 action time.
  const first=mode==='attack_basic'?.30:mode==='skill_drone'?.64:mode==='skill_siege'?.86:1.28;
  mark('bg3-cast',()=>point(0,-155),Math.max(.02,first-.55),Math.min(duration-.2,first+.25),mode==='skill_fortress'?430:325);
  for(const t of targets)mark('bg3-target',()=>targetPoint(t),Math.max(.02,first-.42),ACTIONS[mode].contact+.18,mode==='skill_fortress'?360:290);
  function shot(m,at,arrival,target,{body=false,kind='bg3-bullet',impact='bg3-impact',size=270,impactSize=340,bend=0,rail=false}={}){
   if(m)m.shotTimes.push(at);const s={m,body,at,arrival,target,kind,impact,size,impactSize,bend,rail,from:null,to:null,u:0,v:sprite(kind,'PROJECTILE'),ghosts:[sprite(kind,'TRAIL'),sprite(kind,'TRAIL')],flash:sprite('bg3-muzzle','MUZZLE'),hit:sprite(impact,'IMPACT'),railV:rail?sprite('bg3-rail','RAIL'):null};shots.push(s);
  }
  this.companionHidden=mode!=='skill_drone';this.updateCompanion();
  if(mode==='attack_basic'){
   const m=mech('crawler',180,42,360,0,duration,true);
   shot(null,.30,.52,primary,{body:true,size:300,impactSize:330});
   shot(m,.34,.52,primary,{size:245,impactSize:290,bend:38});
  }
  if(mode==='skill_drone'){
   const up=mech('drone',185,-250,260,.18,1.90),down=mech('drone',335,-110,260,.26,1.98);
   shot(up,.64,.82,primary,{bend:-90,impactSize:350});shot(down,.76,.94,primary,{bend:75,impactSize:370});
  }
  if(mode==='skill_siege'){
   const m=mech('crawler',180,42,360,0,duration,true);
   for(const [at,arrival,i]of [[.86,1.08,0],[1.04,1.26,1],[1.26,1.48,2]])shot(m,at,arrival,primary,{kind:'bg3-shell',impact:'bg3-siege',size:310+i*15,impactSize:400+i*30,bend:(i-1)*25});
  }
  if(mode==='skill_fortress'){
   const m=mech('fortress',330,42,600,.24,3.45);
   for(const t of targets){shot(m,1.28,1.56,t,{kind:'bg3-shell',impact:'bg3-fortress',size:400,impactSize:490,rail:true});shot(m,1.44,1.72,t,{kind:'bg3-shell',impact:'bg3-fortress',size:430,impactSize:540,rail:true});}
  }
  const mechState=(m,t)=>{const life=m.end-m.start,elapsed=t-m.start,p=clamp(elapsed/life);let frame=!m.persistent&&(elapsed<.16||elapsed>life-.14)?0:1;for(const at of m.shotTimes){const dt=t-at;if(dt>=0&&dt<.07)frame=2;else if(dt>=.07&&dt<.18&&frame!==2)frame=3;}const float=m.id==='drone'?Math.sin(p*Math.PI*2)*8:0;return {frame,visible:elapsed>=0&&elapsed<life,...point(m.x,m.y+float),k:m.size/512*scale,alpha:m.persistent?1:Math.min(1,clamp(elapsed/.12),clamp((life-elapsed)/.16))};};
  function muzzle(s){if(s.body)return bodyPoint('rifle_recoil');const p=mechState(s.m,s.at),m=spec[s.m.id],socket=m.muzzleFrames[p.frame][0];return {x:p.x+(socket[0]-m.pivot[0])/m.rasterScale[0]*p.k*direction,y:p.y+(socket[1]-m.pivot[1])/m.rasterScale[1]*p.k};}
  const path=(s,u)=>({x:lerp(s.from.x,s.to.x,u),y:lerp(s.from.y,s.to.y,u)+Math.sin(u*Math.PI)*s.bend*scale});
  const angle=(s,u)=>Math.atan2(s.to.y-s.from.y+Math.cos(u*Math.PI)*Math.PI*s.bend*scale,s.to.x-s.from.x);
  function elapsedFrame(id,dt){return Math.floor(dt*spec[id].fps);}
  const session={get time(){return time;},render(t){
   if(disposed)return;time=t;for(const o of objects)o.visible=false;
   for(const m of marks){const life=m.end-m.start,u=(t-m.start)/life;if(u<0||u>=1)continue;const frame=Math.min(spec[m.id].frames.length-1,Math.floor(u*spec[m.id].frames.length)),alpha=Math.min(clamp(u/.12),clamp((1-u)/.18))*(m.id==='bg3-target'?.92:.76);show(m.v,m.id,frame,m.position(),m.size/512*scale,m.size/512*scale*(m.flat?.38:1),0,alpha);}
   for(const m of mechs){const p=mechState(m,t);m.frame=p.frame;if(p.visible)show(m.v,m.id,p.frame,p,p.k*direction,p.k,0,p.alpha);}
   for(const s of shots){
    s.from=muzzle(s);s.to=targetPoint(s.target);const dt=t-s.at,travel=s.arrival-s.at,u=dt/travel;s.u=u;
    if(dt>=0){const a=angle(s,0);show(s.flash,'bg3-muzzle',elapsedFrame('bg3-muzzle',dt),s.from,(s.rail?310:230)/512*scale,(s.rail?310:230)/512*scale,a,1);}
    if(u>=0&&u<=1){
     const frame=Math.min(spec[s.kind].frames.length-1,Math.floor(clamp(u)*spec[s.kind].frames.length));
     for(let i=1;i>=0;i--){const trailU=u-(i+1)*.14;if(trailU>=0)show(s.ghosts[i],s.kind,frame,path(s,trailU),s.size/512*scale*(1.2+i*.1),s.size/512*scale*.65,angle(s,trailU),i?.17:.36);}
     show(s.v,s.kind,frame,path(s,u),s.size/512*scale,s.size/512*scale,angle(s,u),Math.min(1,u*10+.25));
    }
    if(s.railV&&dt>=0&&t<s.arrival+.23){const end=path(s,clamp(u)),d=Math.hypot(end.x-s.from.x,end.y-s.from.y),p={x:(s.from.x+end.x)/2,y:(s.from.y+end.y)/2};const after=Math.max(0,t-s.arrival);show(s.railV,'bg3-rail',after>0?Math.min(5,3+Math.floor(after/.23*3)):Math.min(2,Math.floor(dt/.07)),p,d/(512*.80),1.2*scale*Math.max(.05,1-after/.23),Math.atan2(end.y-s.from.y,end.x-s.from.x),1-after/.23);}
    const impactDt=t-s.arrival;if(impactDt>=0)show(s.hit,s.impact,elapsedFrame(s.impact,impactDt),s.to,s.impactSize/512*scale*direction,s.impactSize/512*scale,0,s.rail?.88:1);
   }
  },audit(){return {time,active:objects.filter(v=>v.visible).length,mechanical:mechs.filter(m=>m.v.visible).length,marks:marks.filter(m=>m.v.visible).length,projectiles:shots.filter(s=>s.v.visible).length,muzzleFlashes:shots.filter(s=>s.flash.visible).length,impacts:shots.filter(s=>s.hit.visible).length,maxObjects:objects.length,frames:{...frames},emissions:shots.map(s=>({source:s.body?'mercenary':'summon',at:s.at,arrival:s.arrival,from:s.from,to:s.to,progress:s.u,target:s.target.id})),disposed};},
  destroy(){if(disposed)return;disposed=true;for(const v of objects){v.removeFromParent();v.destroy();}if(owner.session===session)owner.session=null;owner.companionHidden=false;owner.updateCompanion();owner.completed++;}
  };this.session=session;return session;
 }
}
