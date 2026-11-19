import {Container,Graphics,Text} from 'pixi.js';

// Raid geometry lives on V3's floor, below its unchanged actors. Accessible DOM
// hit polygons are projected from these same vertices, including camera motion.
export class NoxFloor {
  constructor(engine,count=30){
    this.engine=engine;this.root=new Container({label:'NoxMemoryFloor'});this.root.depthSortY=-99999;this.root.eventMode='none';engine.combatLayer.addChild(this.root);
    this.tiles=Array.from({length:count},()=>{const art=new Graphics(),label=new Text({text:'',style:{fontFamily:'NoxHUD',fontSize:30,fontWeight:'800',fill:0xffffff}});label.anchor.set(.5);this.root.addChild(art,label);return {art,label,points:[]};});this.signature='';this.layoutKey='';this.targetKey='';this.state=null;this.root.visible=false;this.layoutDirty=true;this.observer=new ResizeObserver(()=>{this.layoutDirty=true;});this.observer.observe(engine.app.canvas);
  }
  update(state){this.state=state;this.root.visible=state.status==='ACTIVE'&&state.stage==='MEMORY';if(this.root.visible&&this.layout())this.draw();}
  layout(){
    if(!this.layoutDirty)return true;
    const e=this.engine,canvas=e.app.canvas,host=canvas.closest('.battle-v3-canvas-host'),box=canvas.getBoundingClientRect(),dock=Number.parseFloat(getComputedStyle(host).getPropertyValue('--v3-dock-h'))||120;
    const w=box.width,h=box.height,scale=e.root.scale.x;
    if(w<2||h<2||!Number.isFinite(scale)||scale<=0)return false;
    this.layoutDirty=false;
    const key=[w,h,dock,scale].join(':');if(key===this.layoutKey)return true;this.layoutKey=key;
    const landscape=w>=650&&h<320,portrait=w<650,columns=landscape?3:portrait?6:10,rows=landscape?5:portrait?5:3,bankW=w*.265,cellW=landscape?(bankW-12)/3.5:Math.min(112,(w-20)/(columns+.5)),cellH=landscape?40:portrait?46:52,bottom=h-dock-7;
    const toWorld=(x,y)=>e.stage.toLocal({x:x*e.app.screen.width/w,y:y*e.app.screen.height/h});
    for(let id=0;id<this.tiles.length;id++){
      const index=landscape?id%15:id,bank=landscape?Math.floor(id/15):0,col=index%columns,row=Math.floor(index/columns),stepX=cellW*1.02,stepY=cellH*.72,totalW=(columns-1)*stepX+cellW*1.5;
      const x=(landscape?(bank?w-bankW:0)+(bankW-totalW)/2:(w-totalW)/2)+cellW/2+col*stepX+(row%2)*cellW*.5,y=(landscape?h-7:bottom)-cellH/2-(rows-1-row)*stepY,tile=this.tiles[id];
      tile.center=toWorld(x,y);tile.points=[[x,y-cellH/2],[x+cellW/2,y],[x,y+cellH/2],[x-cellW/2,y]].map(([a,b])=>toWorld(a,b));tile.label.position.copyFrom(tile.center);tile.label.style.fontSize=(landscape?18:22)/e.root.scale.x;tile.label.scale.y=.88;
    }
    this.signature='';this.targetKey='';return true;
  }
  draw(){
    const {challenge:c,me}=this.state,signature=JSON.stringify([c.id,c.cue,c.cueStep,me.memoryTiles,me.hp]);if(signature===this.signature)return;this.signature=signature;
    for(let id=0;id<this.tiles.length;id++){
      const t=this.tiles[id],safe=c.tiles[id].kind==='safe',cue=c.cue===id,step=(me.memoryTiles||[]).indexOf(id)+1,color=cue||step?0xffe8a1:safe?0x51e9db:0xff3e53,points=t.points.flatMap(p=>[p.x,p.y]),center=t.center,g=t.art,scale=this.engine.root.scale.x;
      const inner=t.points.flatMap(p=>[center.x+(p.x-center.x)*.76,center.y+(p.y-center.y)*.76]);g.clear();g.poly(points).fill({color:safe?0x053f42:0x4b0817,alpha:cue?.92:.72}).stroke({color,width:(cue?4:2)/scale,alpha:1});g.poly(inner).stroke({color,width:1/scale,alpha:.7});
      if(!safe){
        const radius=8/scale,star=[];for(let n=0;n<16;n++){const angle=n*Math.PI/8,r=n%2?radius*.55:radius;star.push(center.x+Math.cos(angle)*r,center.y+Math.sin(angle)*r*.62);}g.poly(star).fill({color:0xff5260,alpha:1});g.circle(center.x,center.y,4/scale).fill(0x3e0716).stroke({color:0xff8090,width:1/scale});g.circle(center.x,center.y,1.5/scale).fill(0xffe4cf);
      }else if(!cue&&!step){const r=6/scale;g.poly([center.x,center.y-r*.7,center.x+r,center.y,center.x,center.y+r*.7,center.x-r,center.y]).stroke({color,width:2/scale});}
      t.label.text=cue?String(c.cueStep):step?String(step):'';t.label.style.fill=0xfff6cf;
    }
  }
  placeTargets(target){
    if(!this.root.visible||!this.layout())return;this.draw();const e=this.engine,m=e.stage.worldTransform,key=[m.a,m.b,m.c,m.d,m.tx,m.ty,this.layoutKey,this.state.challenge.id].join(':');
    // Each MEMORY replaces the DOM buttons. An unchanged camera does not mean
    // those new elements have hit areas; also cover a same-phase DOM remount.
    if(key===this.targetKey&&target.children[0]===this.targetFirst)return;this.targetKey=key;this.targetFirst=target.children[0];
    for(let id=0;id<this.tiles.length;id++){
      const b=target.children[id];if(!b)continue;const points=this.tiles[id].points.map(p=>e.stage.toGlobal(p)),left=Math.min(...points.map(p=>p.x)),top=Math.min(...points.map(p=>p.y)),width=Math.max(...points.map(p=>p.x))-left,height=Math.max(...points.map(p=>p.y))-top;
      const transform=`translate(${left}px,${top}px)`;if(b.style.transform!==transform)b.style.transform=transform;b.style.width=width+'px';b.style.height=height+'px';b.style.clipPath='polygon('+points.map(p=>`${(p.x-left)/width*100}% ${(p.y-top)/height*100}%`).join(',')+')';
    }
  }
  diagnostics(){return {visible:this.root.visible,belowActors:this.root.parent===this.engine.combatLayer,tiles:this.tiles.map((t,id)=>({id,points:t.points.map(p=>this.engine.stage.toGlobal(p))}))};}
  destroy(){this.observer.disconnect();this.root.destroy({children:true});}
}
