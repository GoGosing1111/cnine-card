import {Application, Assets, Container, Graphics, Sprite} from 'pixi.js';
import {gsap} from 'gsap';

// Isolated UI renderer. Never imports, mounts or changes the V3 battle engine.
const ART='/assets/ui/tiers/challenger-v2032.png';
let application=null,initializing=null,target=null,observer=null,intersection=null,resize=null;
let scene=null,arcs=null,particles=null,shine=null,mask=null,timeline=null,visible=true,failed=false;
const motion={time:0,intro:0,sweep:-1};
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const motes=Array.from({length:28},(_,i)=>({phase:i*.618,side:i%2?-1:1,speed:.12+(i%5)*.025,size:.6+(i%3)*.35}));

function render(){
  if(!target||!scene)return;
  const width=target.clientWidth,height=target.clientHeight;
  if(!width||!height)return;
  const s=Math.min(width,height),cx=width/2,cy=height/2;
  arcs.clear();particles.clear();shine.clear();
  // Swept wing energy follows the crest silhouette, with no blur or white wash.
  for(const side of [-1,1])for(let lane=0;lane<2;lane++){
    const phase=(motion.time*.12+lane*.47)%1,points=[];
    for(let i=0;i<=32;i++){
      const t=i/32,a=t*Math.PI;
      points.push({x:cx+side*s*(.08+.38*Math.sin(a*.8)),y:cy+s*(.39-.81*t)});
    }
    for(let i=1;i<points.length;i++){
      const distance=Math.abs(i/32-phase),alpha=Math.max(0,1-distance*5)*.66*motion.intro;
      if(!alpha)continue;
      arcs.moveTo(points[i-1].x,points[i-1].y).lineTo(points[i].x,points[i].y)
        .stroke({width:Math.max(.65,s*.003),color:lane?0x74c9ed:0xe7bd68,alpha});
    }
  }
  for(const mote of motes){
    const t=(mote.phase+motion.time*mote.speed)%1;
    const x=cx+mote.side*s*(.18+.29*Math.sin(t*Math.PI)),y=cy+s*(.4-.8*t);
    const alpha=Math.sin(t*Math.PI)*.7*motion.intro;
    particles.circle(x,y,Math.max(.5,s*.0022*mote.size)).fill({color:mote.side>0?0xb5e4f3:0xf0d093,alpha});
  }
  const x=motion.sweep*width;
  shine.moveTo(x-s*.15,0).lineTo(x,0).lineTo(x+s*.42,height).lineTo(x+s*.27,height).closePath()
    .fill({color:0xccecf6,alpha:.22*motion.intro});
  for(const [gx,gy,offset] of [[.5,.3,0],[.28,.32,1.7],[.73,.2,3.4]]){
    const light=Math.max(0,Math.sin(motion.time*1.1+offset))**12*.7*motion.intro;
    const r=s*.018;
    particles.moveTo(width*gx-r,height*gy).lineTo(width*gx+r,height*gy).stroke({width:.8,color:0xf3dfaf,alpha:light});
    particles.moveTo(width*gx,height*gy-r).lineTo(width*gx,height*gy+r).stroke({width:.8,color:0xf3dfaf,alpha:light});
  }
}
function syncPlayback(){
  const active=Boolean(target?.isConnected&&visible&&!document.hidden&&!reduced.matches);
  if(active){application?.start();timeline?.resume();}else{application?.stop();timeline?.pause();}
  if(application?.canvas)application.canvas.hidden=!active;
}
function fit(){
  if(!target||!application)return;
  const w=target.clientWidth,h=target.clientHeight;
  if(!w||!h)return;
  application.renderer.resize(w,h);
  const size=Math.min(w,h);mask.width=size;mask.height=size;mask.position.set((w-size)/2,(h-size)/2);
  render();syncPlayback();
}
function detach(){
  resize?.disconnect();intersection?.disconnect();target=null;
  application?.stop();timeline?.pause();application?.canvas.remove();
}
async function mount(next){
  if(failed||reduced.matches||!next)return;
  if(target===next){syncPlayback();return;}
  if(initializing){await initializing;return refresh();}
  if(!application){
    initializing=(async()=>{
      const app=new Application();
      await app.init({width:256,height:256,backgroundAlpha:0,antialias:true,resolution:Math.min(devicePixelRatio||1,2),autoDensity:true,preference:'webgl',autoStart:false});
      application=app;app.ticker.maxFPS=30;
      app.canvas.className='challenger-webgl';app.canvas.setAttribute('aria-hidden','true');
      app.canvas.addEventListener('webglcontextlost',()=>{failed=true;detach();});
      const texture=await Assets.load(ART);
      scene=new Container();arcs=new Graphics();particles=new Graphics();shine=new Graphics();mask=new Sprite(texture);
      shine.mask=mask;scene.addChild(arcs,shine,mask,particles);app.stage.addChild(scene);
      timeline=gsap.timeline({repeat:-1,paused:true});
      timeline.fromTo(motion,{time:0,intro:0,sweep:-1},{time:12,duration:12,ease:'none'},0)
        .to(motion,{intro:1,duration:1.1,ease:'power2.out'},0)
        .to(motion,{sweep:1.4,duration:2.2,ease:'power1.inOut'},1.4);
      app.ticker.add(render);
    })();
    try{await initializing;}catch(error){failed=true;application?.stop();application?.canvas.remove();console.warn('[Challenger FX] static crest retained',error);}finally{initializing=null;}
    if(failed)return;
  }
  if(!next.isConnected)return refresh();
  detach();target=next;visible=true;target.append(application.canvas);
  resize=new ResizeObserver(fit);resize.observe(target);
  intersection=new IntersectionObserver(entries=>{visible=entries[0]?.isIntersecting===true;syncPlayback();});intersection.observe(target);
  timeline.restart();fit();
}
function refresh(){
  const candidates=[...document.querySelectorAll('[data-challenger-fx]')];
  const next=candidates.find(el=>el.getBoundingClientRect().width>0&&el.getBoundingClientRect().height>0);
  if(!next){detach();return;}
  void mount(next);
}
let scheduled=false;
function schedule(){if(scheduled)return;scheduled=true;queueMicrotask(()=>{scheduled=false;refresh();});}
window.RankedChallengerFX={refresh:schedule,diagnostics:()=>({renderer:application?.renderer?.type??null,contexts:application?1:0,mounted:Boolean(target),visible,failed})};
document.addEventListener('visibilitychange',syncPlayback);
reduced.addEventListener('change',()=>{syncPlayback();if(!reduced.matches)schedule();});
window.addEventListener('resize',schedule);
observer=new MutationObserver(records=>{if(records.some(r=>[...r.addedNodes,...r.removedNodes].some(n=>n.nodeType===1&&n!==application?.canvas)))schedule();});
observer.observe(document.body,{childList:true,subtree:true});
schedule();
