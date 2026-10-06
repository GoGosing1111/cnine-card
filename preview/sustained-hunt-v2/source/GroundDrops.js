import {Container,Graphics,Sprite,Assets} from 'pixi.js';
import {gsap} from 'gsap';
// Items are rendered inside the existing V3 effect layer. A matched DOM button
// supplies a keyboard/touch target; it never grants an item without a receipt.
export class GroundDrops{
  constructor(engine,{claim,onPicked,onExpired,onError}={}){
    this.engine=engine;this.claim=claim;this.onPicked=onPicked;this.onExpired=onExpired;this.onError=onError;this.rows=new Map();this.absorbed=new Set();this.revision=0;
    this.host=document.createElement('div');this.host.className='ground-drops';this.host.setAttribute('aria-label','필드 드랍 아이템');document.body.append(this.host);
    this.tick=()=>this.render();engine.app.ticker.add(this.tick,null,-30);
  }
  async add(drop,serverNow,automaticReceipt=null){
    if(drop?.state==='CLAIMED'&&automaticReceipt?.automatic)return this.absorb(drop,automaticReceipt);
    if(!drop||this.rows.has(drop.id))return;
    const rev=this.revision,receivedAt=performance.now(),texture=await Assets.load(drop.item.image);if(rev!==this.revision)return;
    const remaining=Math.max(0,drop.expiresAt-serverNow-(performance.now()-receivedAt));
    if(!remaining){this.onExpired?.(drop);return;}
    const rarity=drop.item.tier||drop.item.rarity;
    const root=new Container({label:'HUNT_GROUND_DROP_'+drop.id}),color=rarity==='epic'?0xd4a1ff:rarity==='rare'?0x69dcff:0xd5ff87;
    const halo=new Graphics().ellipse(0,0,36,14).fill({color,alpha:.32}).ellipse(0,0,29,10).stroke({color:0x07101b,width:5,alpha:.9}).ellipse(0,0,29,10).stroke({color,width:2.5,alpha:1});
    const icon=new Sprite(texture);icon.anchor.set(.5,1);const scale=54/Math.max(texture.width,texture.height);icon.scale.set(scale);icon.y=-10;
    root.addChild(halo,icon);this.engine.effectLayer.addChild(root);
    const button=document.createElement('button');button.className='ground-drop '+rarity;button.type='button';button.dataset.dropId=drop.id;
    button.setAttribute('aria-label',drop.item.name+' '+drop.item.quantity+'개 획득');button.innerHTML='<span class="drop-countdown"></span><span class="drop-quantity"></span><span class="drop-label"></span>';
    const quantity=button.querySelector('.drop-quantity');quantity.textContent='×'+drop.item.quantity;quantity.hidden=!(drop.item.quantity>1);
    button.querySelector('.drop-label').textContent=drop.item.name;this.host.append(button);
    const row={drop,root,icon,halo,iconScale:scale,button,deadline:performance.now()+remaining,pending:false,expired:false};
    this.rows.set(drop.id,row);
    button.onclick=async event=>{
      if(!event.isTrusted||row.pending||row.expired||this.engine.huntPaused)return;
      row.pending=true;button.disabled=true;button.classList.add('claiming');button.setAttribute('aria-busy','true');
      button.querySelector('.drop-label').textContent='획득 중';
      row.tween?.kill();root.alpha=.4;
      row.tween=gsap.to(root.scale,{x:.72,y:.72,duration:.12,ease:'power2.out'});
      try{const receipt=await this.claim(drop);if(rev!==this.revision)return;this.remove(drop.id);this.onPicked?.(receipt);}
      catch(error){if(rev!==this.revision)return;
        if(error.message==='DROP_EXPIRED'){this.remove(drop.id);this.onExpired?.(drop);}
        else{row.pending=false;button.disabled=false;button.classList.remove('claiming');button.removeAttribute('aria-busy');button.querySelector('.drop-label').textContent=drop.item.name;row.tween?.kill();root.scale.set(1);root.alpha=1;this.onError?.(error);}
      }
    };
    row.tween=gsap.fromTo(root.scale,{x:.5,y:.5},{x:1,y:1,duration:.22,ease:'back.out(1.7)'});
    this.render();
  }
  async absorb(drop,receipt){
    if(this.absorbed.has(drop.id))return;this.absorbed.add(drop.id);
    const revision=this.revision;let texture;
    try{texture=await Assets.load(drop.item.image);}catch{if(revision===this.revision)this.onPicked?.(receipt);return;}
    if(revision!==this.revision)return;
    const field=this.field(),pet=this.engine.petSupports?.get('A'),destination=pet?.root.position||{x:field.x,y:field.y+field.height};
    const root=new Container({label:'PET_MAGNET_DROP_'+drop.id}),halo=new Graphics().circle(0,0,32).stroke({color:0xc4f588,width:3,alpha:.8}),icon=new Sprite(texture);
    icon.anchor.set(.5);icon.scale.set(52/Math.max(texture.width,texture.height));root.addChild(halo,icon);
    root.position.set(field.x+drop.position.x*field.width,field.y+drop.position.y*field.height);this.engine.effectLayer.addChild(root);
    this.onPicked?.(receipt);
    void this.engine.timeline(t=>{
      t.fromTo(root.scale,{x:.65,y:.65},{x:1,y:1,duration:.12},0);
      t.to(root,{x:destination.x,y:destination.y-55,duration:this.engine.reducedMotion ? .15 : .6,ease:'power2.in'},.08);
      t.to(root.scale,{x:.12,y:.12,duration:.45,ease:'power2.in'},.2);
      t.to(root,{alpha:0,duration:.12},.55);
    },()=>{if(!root.destroyed)root.destroy({children:true});});
  }
  field(){
    const e=this.engine,ox=e.viewportFit?.offsetX||0,oy=e.viewportFit?.offsetY||0;
    // Keep the field stable across casualties and waves; existing loot must not slide.
    const points=[...e.allies,...e.enemies];
    const minX=Math.min(...points.map(a=>a.baseX)),maxX=Math.max(...points.map(a=>a.baseX));
    const minY=Math.min(...points.map(a=>a.baseY)),maxY=Math.max(...points.map(a=>a.baseY));
    return {x:Math.max(ox+55,minX-40),y:Math.max(oy+100,minY-35),width:Math.max(600,maxX-minX+80),height:Math.max(330,maxY-minY+80)};
  }
  render(){
    const e=this.engine;if(!e.app?.canvas)return;const box=e.app.canvas.getBoundingClientRect(),field=this.field(),time=performance.now();
    for(const [id,r] of this.rows){
      const left=r.deadline-time;
      if(left<=0&&!r.pending){this.remove(id);this.onExpired?.(r.drop);continue;}
      r.root.position.set(field.x+r.drop.position.x*field.width,field.y+r.drop.position.y*field.height);
      const p=r.root.getGlobalPosition(),x=box.left+p.x*box.width/e.app.screen.width,y=box.top+p.y*box.height/e.app.screen.height;
      // Keep the item readable when the V3 world shrinks on a phone. The DOM
      // hit target and Pixi icon still share the same field position.
      const matrix=r.root.parent.worldTransform,viewScale=Math.hypot(matrix.a,matrix.b)*box.width/e.app.screen.width;
      const boost=Math.max(1,40/(54*Math.max(.001,viewScale)));
      r.icon.scale.set(r.iconScale*boost);r.halo.scale.set(boost);
      // The larger touch target remains attached to the server's field position.
      r.button.style.left=x+'px';r.button.style.top=(y-28)+'px';
      r.button.disabled=r.pending||!!e.huntPaused;
      r.button.querySelector('.drop-countdown').textContent=r.pending?'…':Math.max(0,Math.ceil(left/1000))+'s';
      r.button.classList.toggle('expiring',left<2500);
      r.icon.y=(-10+Math.sin(time/240)*2)*boost;
    }
  }
  remove(id){const r=this.rows.get(id);if(!r)return;r.expired=true;r.tween?.kill();r.button.remove();r.root.destroy({children:true});this.rows.delete(id);}
  clear(){this.revision++;this.absorbed.clear();for(const id of [...this.rows.keys()])this.remove(id);}
  diagnostics(){return {active:this.rows.size,items:[...this.rows.values()].map(r=>({id:r.drop.id,position:r.drop.position,expiresInMs:Math.max(0,r.deadline-performance.now()),pending:r.pending}))};}
  destroy(){this.clear();this.engine.app?.ticker?.remove(this.tick);this.host.remove();}
}
