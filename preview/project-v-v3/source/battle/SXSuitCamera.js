import {Container} from 'pixi.js';
import {smooth,DURATION} from '../../../battle-suit-sx-v1/ultimate-v3/motion.mjs';

// Only the live ultimate owns this framing. Background bands stay together in
// one inverse transform, instead of acquiring independent scale/pivot offsets.
export class SXSuitCamera{
  constructor(engine,fx){this.engine=engine;this.fx=fx;this.tick=()=>this.apply();}
  frame(time){
    if(time<=0||time>=DURATION){this.release();return;}
    if(!this.active){
      const e=this.engine;
      e.camera.reset(true);
      this.bands=(e.parallaxLayers||[]).map(({layer})=>({layer,parent:layer.parent,index:layer.parent.getChildIndex(layer)}));
      this.backdrop=new Container({label:'SXUltimateBackdrop',eventMode:'none'});
      e.backgroundLayer.addChildAt(this.backdrop,0);
      for(const {layer}of this.bands)this.backdrop.addChild(layer);
      this.active=true;e.app.ticker.add(this.tick,null,-10);
    }
    this.time=time;this.apply();
  }
  apply(){
    if(!this.active||this.engine.stage.destroyed)return;
    const e=this.engine,stage=e.stage,canvas=e.app.canvas,rect=canvas.getBoundingClientRect();
    if(rect.width<=0||rect.height<=0)return;
    const shell=canvas.closest('.battle-v3-live-shell')||canvas.ownerDocument;
    const safe={left:12,right:rect.width-12,top:12,bottom:rect.height-12};
    for(const selector of ['.battle-v3-header','.battle-v3-status','.battle-v3-dock']){
      const node=shell.querySelector(selector),r=node?.getBoundingClientRect();
      if(!r?.width||!r.height||r.bottom<=rect.top||r.top>=rect.bottom)continue;
      if(selector==='.battle-v3-header'||r.top+r.height/2<rect.top+rect.height*.35)safe.top=Math.max(safe.top,r.bottom-rect.top+12);
      else safe.bottom=Math.min(safe.bottom,r.top-rect.top-12);
    }
    if(safe.bottom<=safe.top||safe.right<=safe.left)return;
    const pixelX=e.app.screen.width/rect.width,pixelY=e.app.screen.height/rect.height;
    const a=stage.parent.toLocal({x:safe.left*pixelX,y:safe.top*pixelY}),z=stage.parent.toLocal({x:safe.right*pixelX,y:safe.bottom*pixelY});
    const b=this.fx.bounds(),size=b.size;
    const box={left:Math.min(this.fx.home.x,b.caster.x)-size*.94,right:b.maxX+size*1.13,top:b.floor-size*4.62,bottom:Math.max(...b.points.map(p=>p.y),b.caster.y)+size*.22};
    // Keep the allied formation inside portrait screens too. Formation anchors
    // are stable while actors dash, so their movement cannot pump the camera.
    for(const actor of e.allies||[])if(actor.root.visible&&!actor.root.destroyed){
      const width=(actor.fullBodyHeight||300)*actor.root.scale.x*.65,x=actor.root.baseX??actor.root.x;
      box.left=Math.min(box.left,x-width);box.right=Math.max(box.right,x+width);
    }
    const zoom=Math.min(e.camera.base.scale,(z.x-a.x)/(box.right-box.left),(z.y-a.y)/(box.bottom-box.top));
    const amount=smooth(this.time/.38)*(1-smooth((this.time-3.9)/1.4)),scale=1+(zoom-1)*amount;
    const focus={x:(box.left+box.right)/2+(e.camera.base.x-(a.x+z.x)/2)/zoom,y:(box.top+box.bottom)/2+(e.camera.base.y-(a.y+z.y)/2)/zoom};
    stage.position.set(e.camera.base.x,e.camera.base.y);
    stage.pivot.set(e.camera.base.pivotX+(focus.x-e.camera.base.pivotX)*amount,e.camera.base.pivotY+(focus.y-e.camera.base.pivotY)*amount);
    stage.scale.set(scale);stage.rotation=0;stage.skew.set(0,0);
    this.backdrop.scale.set(1/scale);this.backdrop.pivot.set(0,0);
    this.backdrop.position.set(stage.pivot.x-stage.x/scale,stage.pivot.y-stage.y/scale);
    for(const {layer}of this.bands)layer.position.set(0,0);
    this.safeFrame=safe;this.zoom=scale;
  }
  release(){
    if(!this.active)return;
    const e=this.engine;this.active=false;e.app?.ticker?.remove(this.tick);
    for(const {layer,parent,index}of this.bands)if(!layer.destroyed&&!parent.destroyed)parent.addChildAt(layer,Math.min(index,parent.children.length));
    this.backdrop.destroy();this.backdrop=null;this.bands=[];
    if(!e.stage.destroyed){e.camera.reset(true);e.stage.skew.set(0,0);e.parallaxTicker?.();}
  }
  diagnostics(){return {active:!!this.active,zoom:this.zoom??1,safeFrame:this.safeFrame||null};}
}
