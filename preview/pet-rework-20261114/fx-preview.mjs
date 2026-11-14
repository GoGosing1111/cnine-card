import {Application,Container,Sprite,Assets,Text} from 'pixi.js';
import {gsap} from 'gsap';
import {preparePetTraitFrames,playPetTraitOpeningFX} from '../project-v-v3/source/battle/PetTraitOpeningFX.js';
import {PET_TRAITS} from '../../shared/pet-growth-v2.mjs';
export async function createEffectPreview(host,{pet,instance,signal}){
 const app=new Application();let disposed=false,resource=null,row=null;const timelines=new Set();
 await app.init({width:960,height:310,background:0x0a1220,antialias:true,resolution:1});
 app.stop();
 if(!host.isConnected||signal?.aborted){app.destroy(true);return {dispose(){}};}
 host.replaceChildren(app.canvas);app.canvas.setAttribute('aria-label',PET_TRAITS[instance.trait.id].name+' 전투 시작 이펙트 미리보기');
 const layer=new Container();app.stage.addChild(layer);
 const actors=new Map(),add=async(url,x,label)=>{
  const texture=await Assets.load(url);if(signal?.aborted||!host.isConnected)throw new Error('Preview cancelled');const root=new Container();root.position.set(x,260);const sprite=new Sprite(texture);sprite.anchor.set(.5,1);sprite.scale.set(170/Math.max(texture.width,texture.height));root.addChild(sprite);
  const text=new Text({text:label,style:{fontFamily:'PetSans',fontSize:17,fill:0xdfeaf4}});text.anchor.set(.5,0);text.y=8;root.addChild(text);layer.addChild(root);return {root,sprite,fullBodyHeight:170};
 };
 try{
  row=await add('/'+pet.sourceArt.replace(/^\//,''),170,pet.name);
  if(instance.trait.id==='HUNTER'){
   const boss=await add('/assets/ui/project-v/monsters/hunt-tower/tower-023-petal-swordsman-boss-sd-v1.png',660,'보스 · 사냥 표식');actors.set('boss',boss);
  }else{
   const target=await add('/assets/ui/project-v/characters/zenith/zenith-cn-fc5b6212b541498c-sd-v1.png',530,'지원 대상');
   const second=await add('/assets/ui/project-v/characters/zenith/zenith-cn-f4c52e065fcc441d-sd-v1.png',780,'지원 대상');
   actors.set('target-1',target);actors.set('target-2',second);
  }
  resource=await preparePetTraitFrames(instance.trait.id);row.traitResource=resource;
  if(signal?.aborted||!host.isConnected)throw new Error('Preview cancelled');
 }catch(error){resource?.dispose();app.destroy(true,{children:true,texture:false,textureSource:false});throw error;}
 const engine={app,effectLayer:layer,reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches,combatantById:id=>actors.get(id),onPetTraitFrame(){window.__petFxUpdates=(window.__petFxUpdates||0)+1;},
  timeline(build,cleanup){const timeline=gsap.timeline({onComplete(){cleanup();timelines.delete(timeline);if(!timelines.size)app.stop();}});timelines.add(timeline);build(timeline);app.start();return Promise.resolve();}};
 const controls=document.createElement('div');controls.className='pg-effect-controls';controls.innerHTML='<button type="button" data-fx-play>다시 재생</button><button type="button" data-fx-pause>일시정지</button><button type="button" data-fx-slow>0.5배속</button><button type="button" data-fx-close>미리보기 닫기</button>';host.append(controls);
 let playCount=0,paused=false,slow=false;
 function stop(){for(const timeline of timelines)timeline.kill();timelines.clear();row.traitCleanup?.();app.stop();}
 function play(){if(disposed)return;stop();paused=false;controls.querySelector('[data-fx-pause]').textContent='일시정지';playPetTraitOpeningFX(engine,row,{eventKey:'preview-'+(++playCount),petTrait:{...instance.trait,name:PET_TRAITS[instance.trait.id].name,active:true,targetIds:[...actors.keys()]}});for(const timeline of timelines)timeline.timeScale(slow?.5:1);}
 function dispose(){if(disposed)return;disposed=true;stop();controls.removeEventListener('click',click);resource.dispose();app.destroy(true,{children:true,texture:false,textureSource:false});host.replaceChildren();host.hidden=true;window.__petActiveFx=Math.max(0,(window.__petActiveFx||1)-1);}
 function click(event){if(event.target.hasAttribute('data-fx-play'))play();if(event.target.hasAttribute('data-fx-close'))dispose();if(event.target.hasAttribute('data-fx-pause')){paused=!paused;for(const timeline of timelines)timeline.paused(paused);if(paused)app.stop();else if(timelines.size)app.start();event.target.textContent=paused?'계속 재생':'일시정지';}if(event.target.hasAttribute('data-fx-slow')){slow=!slow;for(const timeline of timelines)timeline.timeScale(slow?.5:1);event.target.textContent=slow?'정상 속도':'0.5배속';}}
 controls.addEventListener('click',click);window.__petActiveFx=(window.__petActiveFx||0)+1;play();
 return {dispose,get activeTimelines(){return timelines.size;}};
}
