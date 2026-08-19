import {AnimatedSprite, BitmapText, Container, Graphics} from 'pixi.js';

/**
 * Fixed-cost reusable object pool.
 * Objects are never destroyed during combat; release() only resets and parks them.
 */
export class ObjectPool{
  constructor({factory,reset,destroy,warm=0,name='pool'}){
    this.factory=factory;
    this.reset=reset;
    this.destroyItem=destroy||((item)=>item.destroy?.({children:true}));
    this.name=name;
    this.available=[];
    this.inUse=new Set();
    this.warm(warm);
  }

  warm(count){
    while(this.available.length+this.inUse.size<count)this.available.push(this.factory());
    return this;
  }

  acquire(){
    const item=this.available.pop()||this.factory();
    this.inUse.add(item);
    item.visible=true;
    return item;
  }

  release(item){
    if(!item||!this.inUse.delete(item))return false;
    item.removeFromParent?.();
    this.reset(item);
    item.visible=false;
    this.available.push(item);
    return true;
  }

  releaseAll(){
    [...this.inUse].forEach(item=>this.release(item));
  }

  stats(){
    return {name:this.name,available:this.available.length,inUse:this.inUse.size,total:this.available.length+this.inUse.size};
  }

  destroy(){
    this.releaseAll();
    this.available.forEach(item=>this.destroyItem(item));
    this.available.length=0;
  }
}

const resetDisplayObject=item=>{
  item.alpha=0;
  item.visible=false;
  item.position.set(0,0);
  item.scale.set(1);
  item.rotation=0;
  item.tint=0xffffff;
};

export function createDamageTextPool(size=24){
  return new ObjectPool({
    name:'damage-text',
    warm:size,
    factory:()=>{
      const label=new BitmapText({
        text:'0',
        style:{
          // BitmapText keeps damage-number glyphs in a texture atlas instead
          // of rasterising a fresh canvas texture for every hit.
          fontFamily:'Arial',
          fontSize:54,
          fill:0xfff4a6,
          stroke:{color:0x130b00,width:8,join:'round'}
        }
      });
      label.anchor.set(.5);
      label.visible=false;
      return label;
    },
    reset:label=>{
      resetDisplayObject(label);
      label.text='0';
      label.style.fill=0xfff4a6;
      label.style.fontSize=54;
    }
  });
}

function proceduralSlash(){
  const root=new Container();
  root.visible=false;
  root.blades=[];
  [
    {angle:-.72,length:315,width:34,offsetX:-70,offsetY:55},
    {angle:.55,length:270,width:27,offsetX:-35,offsetY:-40},
    {angle:-.2,length:205,width:18,offsetX:20,offsetY:18}
  ].forEach((spec,index)=>{
    const blade=new Container();
    blade.rotation=spec.angle;
    blade.position.set(spec.offsetX,spec.offsetY);
    const half=spec.length*.5;
    const shadow=new Graphics().poly([
      -half,0,
      -half*.34,-spec.width*.5,
      half,-3,
      half+26,0,
      half,3,
      -half*.34,spec.width*.5
    ]).fill({color:0x010101,alpha:.98});
    shadow.effectBlendMode='normal';
    const neon=new Graphics().poly([
      -half*.96,0,
      -half*.28,-spec.width*.22,
      half*.98,-1,
      half+18,0,
      half*.98,1,
      -half*.28,spec.width*.22
    ]).fill({color:index===1?0xffc400:0xffe14a,alpha:1});
    neon.blendMode='add';
    const core=new Graphics().poly([-half*.72,0,-half*.18,-2,half*.94,-.6,half+12,0,half*.94,.6,-half*.18,2]).fill({color:0xffffff,alpha:.94});
    core.blendMode='add';
    blade.addChild(shadow,neon,core);
    blade.scale.x=.04;
    root.addChild(blade);
    root.blades.push(blade);
  });
  root.burst=new Graphics().circle(0,0,40).stroke({width:8,color:0xffd219,alpha:.9});
  root.burst.blendMode='screen';
  root.burst.scale.set(.2);
  root.addChild(root.burst);
  root.shards=[];
  for(let index=0;index<20;index+=1){
    const shard=new Graphics().roundRect(-18,-2,36,4,2).fill({color:index%4===0?0xffffff:0xffd219,alpha:.94});
    shard.blendMode='add';
    shard.rotation=Math.PI*2*index/20;
    shard.position.set(Math.cos(shard.rotation)*28,Math.sin(shard.rotation)*28);
    root.addChild(shard);
    root.shards.push(shard);
  }
  return root;
}

/**
 * Pass frames from a PixiJS Spritesheet animation to replace the procedural FX.
 * Production atlas example:
 *
 * Assets.addBundle('combat-fx', {
 *   slashAtlas: '/assets/effects/slash-yellow/slash-yellow.json'
 * });
 * const sheet = await Assets.load('slashAtlas');
 * const frames = sheet.animations.slash_yellow; // ordered Texture[] from atlas JSON
 * createSlashFxPool({frames});
 *
 * Keep every frame in one atlas page, use trimmed frames, one premultiplied-alpha
 * policy, and the same blend mode. This allows PixiJS to batch the sequence with
 * fewer texture switches than dozens of independent PNG requests.
 */
export function createSlashFxPool({size=10,frames=[]}={}){
  return new ObjectPool({
    name:'slash-fx',
    warm:size,
    factory:()=>{
      if(frames.length){
        const animation=new AnimatedSprite(frames);
        animation.anchor.set(.5);
        animation.loop=false;
        animation.animationSpeed=.55;
        animation.visible=false;
        animation.autoUpdate=true;
        return animation;
      }
      return proceduralSlash();
    },
    reset:item=>{
      resetDisplayObject(item);
      if(item instanceof AnimatedSprite){
        item.stop();
        item.gotoAndStop(0);
        return;
      }
      item.blades?.forEach(blade=>{blade.alpha=1;blade.scale.set(.04,1)});
      if(item.burst){item.burst.alpha=1;item.burst.scale.set(.2)}
      item.shards?.forEach(shard=>{shard.alpha=1;shard.scale.set(1);shard.position.set(Math.cos(shard.rotation)*28,Math.sin(shard.rotation)*28)});
    }
  });
}

export function createBattlePools({slashFrames=[]}={}){
  const damage=createDamageTextPool(28);
  const slash=createSlashFxPool({size:12,frames:slashFrames});
  return {
    damage,
    slash,
    releaseAll(){damage.releaseAll();slash.releaseAll()},
    destroy(){damage.destroy();slash.destroy()},
    stats(){return [damage.stats(),slash.stats()]}
  };
}
