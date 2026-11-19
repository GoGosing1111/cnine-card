import {ReferenceCrimsonEffects as ApprovedEffects} from './ReferenceCrimsonEffects.mjs';
import {RyujinTwinMoonEffects} from './RyujinTwinMoonEffects.mjs';
export class ReferenceCrimsonEffects extends ApprovedEffects{
 static async load(){const [approved,ambient]=await Promise.all([ApprovedEffects.load(),RyujinTwinMoonEffects.load()]);return {...approved,ambient};}
 constructor(engine,assets){super(engine,assets);this.aura=new RyujinTwinMoonEffects(engine,assets.ambient,this);}
 async warm(){await super.warm();await this.aura.warm();}
 ambient(adapter,t){this.aura.render(adapter,t);}
 setAmbientEnabled(v){this.aura.setEnabled(v);}
 setEnabled(v){super.setEnabled(v);this.aura?.syncVisibility();}
 stopPersistentFor(adapter){super.stopPersistentFor(adapter);this.aura?.release(adapter);}
 audit(){return {...super.audit(),version:'ryujin-v14-selected-rear',approvedSkillMotionUnchanged:true,ambient:this.aura?.audit()};}
 destroy(){this.aura?.destroy();super.destroy();}
}
