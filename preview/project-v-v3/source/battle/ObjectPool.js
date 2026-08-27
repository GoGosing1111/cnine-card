import {BitmapText, Container, Graphics} from 'pixi.js';

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

const DAMAGE_STYLE=Object.freeze({
  ATTACK:{fill:0xffc553,stroke:0x250207,tag:'ARMOR BREAK',tagColor:0xff5238},
  DEFENSE:{fill:0xc9f3ff,stroke:0x00182d,tag:'GUARD CRUSH',tagColor:0x55b9ff},
  SPEED:{fill:0x66f7ff,stroke:0x130028,tag:'7 HIT · TOTAL',tagColor:0x9c70ff},
  HP:{fill:0xf6d85d,stroke:0x00251a,tag:'VITAL DRAIN',tagColor:0x45eba0}
});

const normalizeDamageKind=value=>{
  const raw=String(value||'ATTACK').toUpperCase();
  if(['HEAL','HEALER','HEALTH','VITAL'].includes(raw))return 'HP';
  return DAMAGE_STYLE[raw]?raw:'ATTACK';
};

export function configureDamageText(view,{kind='ATTACK',damage=0,critical=false,healing=0,hitCount=1,compact=false}={}){
  const normalized=normalizeDamageKind(kind);
  const profile=DAMAGE_STYLE[normalized];
  const amount=Math.max(0,Number(damage)||0);
  view.effectKind=normalized;
  view.numberGlow.text=amount.toLocaleString('ko-KR');
  view.numberGlow.style.fill=profile.tagColor;
  view.numberGlow.style.stroke={color:profile.stroke,width:critical?18:16,join:'round'};
  view.numberGlow.style.fontSize=compact?(critical?86:78):(critical?78:68);
  view.numberLabel.text=amount.toLocaleString('ko-KR');
  view.numberLabel.style.fill=critical?0xffffff:profile.fill;
  view.numberLabel.style.stroke={color:profile.stroke,width:critical?15:13,join:'round'};
  view.numberLabel.style.fontSize=compact?(critical?84:76):(critical?76:68);
  view.roleTag.text=normalized==='SPEED'?`${Math.max(2,Math.floor(Number(hitCount)||7))} HIT · TOTAL`:profile.tag;
  view.roleTag.style.fill=0xf5fbff;
  view.roleTag.style.fontSize=compact?24:17;
  view.roleTag.alpha=amount>0?1:0;
  view.criticalLabel.text=critical?'CRITICAL':'';
  view.criticalLabel.style.fill=profile.tagColor;
  view.criticalLabel.style.fontSize=compact?21:12;
  view.healLabel.text=Number(healing)>0?`+${Number(healing).toLocaleString('ko-KR')} HP`:'';
  view.healLabel.style.fill=0x75ffbd;
  view.healLabel.style.fontSize=compact?31:28;
  view.hitLabel.text='';
  view.hitLabel.style.fill=profile.tagColor;
  view.hitLabel.style.fontSize=compact?21:13;
  view.underline.tint=profile.tagColor;
  const speedValues=[.1428,.1333,.1514].map(rate=>Math.round(amount*rate));
  view.speedHitLabels?.forEach((label,index)=>{
    label.text=normalized==='SPEED'?speedValues[index].toLocaleString('ko-KR'):'';
    label.style.fill=index%2?0x66f7ff:0xb795ff;
    label.alpha=normalized==='SPEED'?.86:0;
  });
  return view;
}

export function createDamageTextPool(size=24){
  return new ObjectPool({
    name:'damage-text',
    warm:size,
    factory:()=>{
      const root=new Container({label:'RoleDamageText'});
      const numberLabel=new BitmapText({
        text:'0',
        style:{
          // BitmapText keeps damage-number glyphs in a texture atlas instead
          // of rasterising a fresh canvas texture for every hit.
          fontFamily:'Arial Black, Arial',
          fontSize:56,
          fill:0xfff4a6,
          stroke:{color:0x130b00,width:9,join:'round'},
          letterSpacing:-2
        }
      });
      numberLabel.anchor.set(.5);
      const numberGlow=new BitmapText({text:'0',style:{fontFamily:'Arial Black, Arial',fontSize:72,fill:0xff5a64,stroke:{color:0x250207,width:16,join:'round'},letterSpacing:-2}});
      numberGlow.anchor.set(.5);numberGlow.alpha=.5;
      const roleTag=new BitmapText({text:'ARMOR BREAK',style:{fontFamily:'Arial',fontSize:13,fill:0xff5a64,letterSpacing:2}});
      roleTag.anchor.set(.5);roleTag.position.y=47;
      const criticalLabel=new BitmapText({text:'',style:{fontFamily:'Arial',fontSize:12,fill:0xff5a64,letterSpacing:2}});
      criticalLabel.anchor.set(.5);criticalLabel.position.y=-48;
      const healLabel=new BitmapText({text:'',style:{fontFamily:'Arial',fontSize:15,fill:0x75ffbd,letterSpacing:.5}});
      healLabel.anchor.set(.5);healLabel.position.set(0,67);
      const hitLabel=new BitmapText({text:'',style:{fontFamily:'Arial',fontSize:13,fill:0xb778ff,letterSpacing:1}});
      hitLabel.anchor.set(0,.5);hitLabel.position.set(60,-35);
      const speedHitLabels=[-1,0,1].map((offset,index)=>{
        const label=new BitmapText({text:'',style:{fontFamily:'Arial',fontSize:22,fill:index%2?0x66f7ff:0xb795ff,stroke:{color:0x05070b,width:7,join:'round'}}});
        label.anchor.set(.5);label.position.set(offset*92,88+(index%2)*8);label.alpha=0;return label;
      });
      const underline=new Graphics().roundRect(-58,37,116,2,1).fill(0xffffff);
      root.addChild(numberGlow,underline,numberLabel,roleTag,criticalLabel,healLabel,hitLabel,...speedHitLabels);
      root.numberGlow=numberGlow;root.numberLabel=numberLabel;root.roleTag=roleTag;root.criticalLabel=criticalLabel;root.healLabel=healLabel;root.hitLabel=hitLabel;root.speedHitLabels=speedHitLabels;root.underline=underline;
      Object.defineProperties(root,{
        text:{get:()=>numberLabel.text,set:value=>{numberLabel.text=value}},
        style:{get:()=>numberLabel.style}
      });
      root.visible=false;
      return root;
    },
    reset:root=>{
      resetDisplayObject(root);
      root.numberLabel.text='0';
      root.numberGlow.text='0';root.numberGlow.alpha=.5;
      root.numberLabel.style.fill=0xfff4a6;
      root.numberLabel.style.fontSize=56;
      root.roleTag.text='';root.criticalLabel.text='';root.healLabel.text='';root.hitLabel.text='';
      root.speedHitLabels?.forEach(label=>{label.text='';label.alpha=0});
    }
  });
}

export function createBattlePools(){
  const damage=createDamageTextPool(28);
  return {
    damage,
    releaseAll(){damage.releaseAll()},
    destroy(){damage.destroy()},
    stats(){return [damage.stats()]}
  };
}
