import {Assets,Texture,Rectangle} from 'pixi.js';
import {battleAssetMemory} from '../../preview/project-v-v3/source/battle/BattleAssetMemory.mjs';

// Texture references belong to one battle, just like the shared V3 image lease.
// Assets may unload the boss's idle image on exit. Never retain it for a retry.
export class NoxBattleArt {
  constructor(assets=Assets,memory=battleAssetMemory){this.assets=assets;this.memory=memory;this.poses={};this.fx={};this.generation=0;}
  async load(){
    const generation=this.generation,base='/assets/ui/raid-nox-v1/';
    const read=async(name)=>{const url=base+name+'.webp';this.memory.remember(url);return this.assets.load(url);};
    const [poses,sheets]=await Promise.all([
      Promise.all(['idle','anticipation','strike','memory','coop','defeat'].map(async key=>[key,await read('boss-'+key)])),
      Promise.all(['rhythm','memory','coop'].map(async key=>[key,await read('fx-'+key)]))
    ]);
    if(generation!==this.generation)return false;
    for(const [key,texture] of poses)this.poses[key]=texture;
    for(const [key,t] of sheets)this.fx[key]=Array.from({length:16},(_,i)=>new Texture({source:t.source,frame:new Rectangle(i%4*t.width/4,Math.floor(i/4)*t.height/4,t.width/4,t.height/4)}));
    return true;
  }
  clear(){
    this.generation++;
    for(const frames of Object.values(this.fx))for(const frame of frames)frame.destroy(false);
    for(const key of Object.keys(this.fx))delete this.fx[key];
    // The shared asset lease owns the sources; no double-destroy of actor art.
    for(const key of Object.keys(this.poses))delete this.poses[key];
  }
  diagnostics(){const textures=[...Object.values(this.poses),...Object.values(this.fx).flat()];return {poses:Object.keys(this.poses).length,fxFrames:Object.values(this.fx).flat().length,invalid:textures.filter(t=>t.destroyed||!t.source||t.source.destroyed).length};}
}
