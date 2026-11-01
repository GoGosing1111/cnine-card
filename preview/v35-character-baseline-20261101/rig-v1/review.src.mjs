import * as PIXI from 'pixi.js';
import {gsap} from 'gsap';
import {createEffectScene} from '@v3/effect-scene';
window.PIXI=PIXI;
const api=window.rigReview={ready:false,errors:[]};
window.addEventListener('error',e=>api.errors.push(e.message));window.addEventListener('unhandledrejection',e=>api.errors.push(String(e.reason)));
window.startRigReview=async()=>{
 const host=document.querySelector('#stage'),engine=createEffectScene(host);await engine.mount();
 const delivery=await(await fetch('qa/native.json')).json();
 await PIXI.Assets.load([{alias:'rigData',src:delivery.runtimeDir+'/'+delivery.skeletonJson},{alias:'rigAtlas',src:delivery.runtimeDir+'/'+delivery.atlas},{alias:'baseline',src:'baseline.png'}]);
 document.querySelector('#download-spine').href=delivery.native;
 const world=new PIXI.Container();engine.combatLayer.addChild(world);
 const reference=new PIXI.Sprite(PIXI.Assets.get('baseline'));reference.position.set(-512,-1450);world.addChild(reference);
 const actor=window.spine.Spine.from({skeleton:'rigData',atlas:'rigAtlas',autoUpdate:false,ticker:engine.app.ticker});world.addChild(actor);
 const marks=new PIXI.Graphics();world.addChild(marks);marks.visible=false;
 const clock={time:0};let timeline,record,entry,mode='rig',action='setup',disposed=false;
 const names=actor.skeleton.data.animations.map(x=>x.name);
 const layout=()=>{const {width,height}=engine.scene;const scale=Math.min((width-32)/1100,(height-24)/1580);world.scale.set(scale);world.position.set(width/2,(height-1536*scale)/2+1450*scale);};engine.onEffectResize=layout;layout();
 function render(){entry.trackTime=clock.time;actor.update(0);document.querySelector('#seek').value=clock.time;document.querySelector('#time').textContent=action==='idle'?clock.time.toFixed(2)+' / 4.20초':'정지 조립';}
 function select(name,play=false){timeline?.kill();if(record)engine.simpleTimelines.delete(record);action=name;actor.state.clearTracks();actor.skeleton.setupPose();entry=actor.state.setAnimation(0,name,true);clock.time=0;document.querySelector('#seek').max=entry.animation.duration;timeline=gsap.timeline({paused:true,repeat:-1,onUpdate:render});timeline.fromTo(clock,{time:0},{time:entry.animation.duration,duration:entry.animation.duration,ease:'none',immediateRender:true});record={instance:timeline,resumeOnVisible:play};engine.simpleTimelines.add(record);timeline.timeScale(Number(document.querySelector('#speed').value));render();if(play)timeline.play();document.querySelector('#play').textContent=play?'일시정지':'재생';document.querySelector('#animation').value=name;}
 function setMode(value){mode=value;reference.visible=value!=='rig';actor.visible=value!=='source';reference.alpha=value==='overlay'?.5:1;actor.alpha=value==='overlay'?.5:1;document.querySelector('#mode').value=value;}
 function play(){timeline.play();document.querySelector('#play').textContent='일시정지';}
 function pause(){timeline.pause();document.querySelector('#play').textContent='재생';}
 function seek(t){pause();timeline.totalTime(t,true);clock.time=t;render();return sample();}
 function setBackground(value){host.dataset.background=value;document.querySelector('#background').value=value;}
 function sample(){const p=n=>{const b=actor.skeleton.findBone(n).appliedPose;return {x:b.worldX,y:b.worldY};};return {action,time:clock.time,paused:timeline.paused(),mode,head:p('head'),grip:p('weapon_grip'),tip:p('blade_tip'),soleBack:p('sole_back'),soleFront:p('sole_front'),chest:p('chest'),canvasCount:host.querySelectorAll('canvas').length,errors:[...api.errors],autoUpdate:actor.autoUpdate,pixi:PIXI.VERSION,spine:actor.skeleton.data.version};}
 for(const n of names)document.querySelector('#animation').add(new Option(n==='idle'?'대기':'정지 조립',n));
 document.querySelector('#animation').onchange=e=>select(e.target.value,false);document.querySelector('#mode').onchange=e=>setMode(e.target.value);
 document.querySelector('#play').onclick=()=>{if(action!=='idle'&&names.includes('idle'))select('idle',true);else timeline.paused(!timeline.paused());document.querySelector('#play').textContent=timeline.paused()?'재생':'일시정지';};
 document.querySelector('#speed').onchange=e=>timeline.timeScale(Number(e.target.value));document.querySelector('#seek').oninput=e=>seek(Number(e.target.value));
 document.querySelector('#background').onchange=e=>setBackground(e.target.value);
 document.querySelector('#contacts').onchange=e=>{marks.visible=e.target.checked;marks.clear();for(const [x,y]of [[143-512,1450-1440],[846-512,1450-1422]]){marks.moveTo(x-34,-y).lineTo(x+34,-y).stroke({width:3,color:0x56daca});}};
 await engine.setVisible(true);select('setup',false);setMode('rig');
 const destroy=()=>{if(disposed)return;disposed=true;timeline.kill();engine.simpleTimelines.delete(record);world.destroy({children:true});engine.destroy();};window.addEventListener('pagehide',destroy,{once:true});
 Object.assign(api,{ready:true,engine,actor,world,reference,select,seek,setMode,sample,play,pause,setVisible:v=>engine.setVisible(v),setBackground,dispose:destroy});
 document.querySelector('#status').textContent='기준 그림과 정지 조립을 먼저 비교합니다.';
};
