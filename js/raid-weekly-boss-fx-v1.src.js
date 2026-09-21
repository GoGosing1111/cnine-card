import {Application,Assets,Container,Graphics,Sprite} from 'pixi.js';
import {gsap} from 'gsap';

class WeeklyRaidUltimateFxV1{
  constructor(){this.app=null;this.host=null;this.layer=null;this.timeline=null;this.cache=new Map();this.castKey='';this.destroyed=false;this.resizeObserver=null;}
  async mount(host){
    if(this.destroyed)return false;if(this.host===host&&this.app)return true;this.destroy();this.destroyed=false;this.host=host;
    this.app=new Application();await this.app.init({backgroundAlpha:0,antialias:true,autoStart:false,resolution:Math.min(1.5,devicePixelRatio||1),autoDensity:true,preference:'webgl',powerPreference:'low-power'});
    this.app.canvas.className='raid-weekly-ultimate-canvas';this.app.canvas.setAttribute('aria-hidden','true');host.append(this.app.canvas);this.layer=new Container();this.app.stage.addChild(this.layer);this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(host);this.resize();return true;
  }
  resize(){if(!this.app?.renderer||!this.host)return;const {width,height}=this.host.getBoundingClientRect();if(width>0&&height>0)this.app.renderer.resize(Math.ceil(width),Math.ceil(height));}
  async frames(profile){
    const path=String(profile?.atlas||'');if(!path)return[];if(this.cache.has(path))return this.cache.get(path);
    const request=Assets.load(path).then(resource=>Object.entries(resource?.textures||{}).filter(([name])=>name.startsWith(String(profile.framePrefix||''))).sort(([a],[b])=>a.localeCompare(b,undefined,{numeric:true})).map(([,texture])=>texture)).catch(error=>{console.error('[WEEKLY RAID FX]',error);return[]});this.cache.set(path,request);return request;
  }
  async play(host,profile,castNo){
    if(document.hidden||matchMedia('(prefers-reduced-motion: reduce)').matches||!profile)return false;const key=`${profile.code}:${castNo}`;if(this.castKey===key)return false;this.castKey=key;
    if(!await this.mount(host)||this.destroyed)return false;const frames=await this.frames(profile);if(frames.length!==12||this.destroyed||!this.layer)return false;
    this.timeline?.kill();this.layer.removeChildren().forEach(child=>child.destroy({children:true,texture:false,textureSource:false}));
    const group=new Container(),flash=new Graphics().circle(0,0,90).fill({color:0xffffff,alpha:.72});flash.alpha=0;group.addChild(flash);
    const sprite=new Sprite(frames[0]);sprite.anchor.set(.5);sprite.eventMode='none';sprite.blendMode='normal';group.addChild(sprite);this.layer.addChild(group);
    const w=this.app.screen.width,h=this.app.screen.height,scale=Math.min(w/(frames[0].width*1.05),h/(frames[0].height*1.05))*1.12;group.position.set(w*.5,h*.5);sprite.scale.set(scale);flash.scale.set(scale*1.4);const cursor={frame:0};
    const render=()=>{if(!this.destroyed){sprite.texture=frames[Math.min(11,Math.floor(cursor.frame))];this.app.render();}};render();this.app.start();
    this.timeline=gsap.timeline({onComplete:()=>{this.app?.stop();group.removeFromParent();group.destroy({children:true,texture:false,textureSource:false});this.timeline=null;}})
      .to(cursor,{frame:7,duration:.48,ease:'none',onUpdate:render},0)
      .to(flash,{alpha:.82,duration:.045,ease:'power4.out',onUpdate:()=>this.app?.render()},.43)
      .to(flash,{alpha:0,duration:.11,ease:'power2.out',onUpdate:()=>this.app?.render()},.475)
      .to(cursor,{frame:11,duration:.32,ease:'none',onUpdate:render},.52)
      .to(sprite,{alpha:0,duration:.12,onUpdate:()=>this.app?.render()},.79);
    return true;
  }
  destroy(){this.timeline?.kill();this.timeline=null;this.resizeObserver?.disconnect();this.resizeObserver=null;this.app?.destroy(true,{children:true,texture:false,textureSource:false});this.app=null;this.layer=null;this.host=null;this.castKey='';this.destroyed=true;}
}

globalThis.WeeklyRaidUltimateFxV1=new WeeklyRaidUltimateFxV1();
