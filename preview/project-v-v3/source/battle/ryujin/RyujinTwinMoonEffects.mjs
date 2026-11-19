import {ROOT} from './assets.mjs';
import catalog from './rear-catalog.json' with {type:'json'};
import {Assets,Sprite} from 'pixi.js';
import {RyujinFloorEffects} from './RyujinFloorEffects.mjs';
const base=ROOT+'rear/';
export class RyujinTwinMoonEffects extends RyujinFloorEffects{
 static async load(){const floor=await super.load();const records=['10','06'].map(id=>catalog.records.find(r=>r.id===id));if(records.some(r=>!r))throw Error('Selected concepts missing');const textures=await Promise.all(records.map(r=>Assets.load(base+r.file)));return {...floor,rearRecords:records,rearTextures:textures};}
 constructor(engine,assets,skills){super(engine,assets,skills);this.rearRecords=assets.rearRecords;this.rearTextures=assets.rearTextures;}
 ensure(adapter){const it=super.ensure(adapter);if(!it.selectedRear){it.selectedRear=this.rearRecords.map((r,i)=>{const sprite=new Sprite(this.rearTextures[i]);sprite.label='RYUJIN_SELECTED_REAR_'+r.id;it.back.addChildAt(sprite,1+i);return {record:r,sprite};});}return it;}
 render(adapter,time){super.render(adapter,time);const it=this.instances.get(adapter);if(!it)return;const H=adapter.bodyHeight,root=it.points.root,states=[];for(const {record:r,sprite}of it.selectedRear){const b=r.alpha24Bounds,main=r.id==='06',scale=main?Math.min(H*1.68/b.width,H*.56/b.height)*1.10:Math.min(H*1.55/b.width,H*.64/b.height);sprite.anchor.set((b.left+b.width/2)/r.width,(b.top+b.height/2)/r.height);sprite.scale.set(scale);sprite.position.set(root.x-H*.035,root.y-H*(main?.59:.42));sprite.alpha=(main?.98:.72)*it.weight;sprite.visible=this.enabled&&this.skillEffects.enabled;states.push({id:r.id,scale,x:sprite.x,y:sprite.y,alpha:sprite.alpha,width:b.width*scale,height:b.height*scale,behindBody:true});}it.last.selectedRear={main:'06',mainScaleMultiplier:1.10,mainRiseH:.04,fill:'10',fillBehindMain:true,stillArtwork:true,sourcePixelsEdited:false,layers:states};}
 audit(){return {...super.audit(),version:'ryujin-v14-six-plus-ten',selectedConcept:'06+10',newEffectAnimationClaimed:false};}
}
