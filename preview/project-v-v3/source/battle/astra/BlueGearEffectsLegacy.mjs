import {Assets,Sprite,Texture,Rectangle,Point} from 'pixi.js';
const BASE='/preview/v35-bluegear-summoner-20261115/runtime/';
const needed={
 companion:['crawler'],
 attack_basic:['crawler','deploy-gate','drone-pulse','drone-contact'],
 skill_drone:['drone','deploy-gate','drone-pulse','drone-contact'],
 skill_siege:['crawler','deploy-gate','drone-pulse','siege-burst'],
 skill_fortress:['fortress','deploy-gate','fortress-rail','fortress-impact']
};
export class BlueGearEffects{
 static async create(engine){const manifest=await(await fetch(BASE+'assets.json')).json();return new BlueGearEffects(engine,manifest);}
 constructor(engine,manifest){Object.assign(this,{engine,manifest,textures:{},loading:new Map(),enabled:true,session:null,disposed:false,completed:0});}
 async preload(action){const ids=action==='all'?Object.keys(this.manifest.assets):needed[action]||[];await Promise.all(ids.map(id=>{if(!this.loading.has(id))this.loading.set(id,(async()=>{const s=this.manifest.assets[id],atlas=await Assets.load(BASE+s.atlas+'?v='+s.sha256.slice(0,12));if(this.disposed)return;this.textures[id]=s.frames.map(f=>new Texture({source:atlas.source,frame:new Rectangle(f.x,f.y,f.w,f.h)}));})());return this.loading.get(id);}));}
 setEnabled(value){this.enabled=!!value;if(this.session)this.session.render(this.session.time);}
 clear(){this.session?.destroy();}
 destroy(){this.clear();}
 setCompanion(actor){this.companion?.destroy();this.actor=actor;const s=this.manifest.assets.crawler;this.companion=new Sprite(this.textures.crawler[1]);this.companion.label='BLUEGEAR_FRONT_COMPANION';this.companion.anchor.set(s.pivot[0]/s.frames[0].w,s.pivot[1]/s.frames[0].h);this.engine.combatLayer.addChild(this.companion);this.updateCompanion();}
 updateCompanion(){const a=this.actor,v=this.companion;if(!a||!v||v.destroyed)return;const scale=Math.abs(a.restScale||a.root.scale.x),direction=a.team==='ENEMY'?-1:1,s=this.manifest.assets.crawler;
  // Same stable resting formation basis as Icon Diim's autonomous weapon. The
  // slightly wider 180px offset accommodates this long railgun's silhouette.
  v.position.set(a.baseX+direction*180*scale,a.baseY+42*scale);v.scale.set(direction*360/512*scale/s.rasterScale[0],360/512*scale/s.rasterScale[1]);v.depthSortY=v.y;v.visible=!this.companionHidden&&a.hp>0&&a.root.visible;
 }
 dispose(){this.clear();this.disposed=true;this.companion?.destroy();this.companion=null;for(const ts of Object.values(this.textures))for(const t of ts)t.destroy(false);this.textures={};}
 audit(){return {enabled:this.enabled,loaded:Object.keys(this.textures),decodedBytes:Object.keys(this.textures).reduce((n,id)=>n+this.manifest.assets[id].atlasSize.reduce((a,b)=>a*b,4),0),companion:this.companion&&!this.companion.destroyed?{visible:this.companion.visible,x:this.companion.x,y:this.companion.y,ownerBaseX:this.actor.baseX,ownerBaseY:this.actor.baseY,frontFacing:this.actor.team,anchor:'ICON_DIIM_RESTING_FORMATION'}:null,session:this.session?.audit()||null,completed:this.completed};}
}
