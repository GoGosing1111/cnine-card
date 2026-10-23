import {mountForBattle} from '../../project-v-v3/source/project-v-pixi-battle.src.js';
import {Sprite} from 'pixi.js';
import {BattleCharacter,TEAM} from '../../project-v-v3/source/battle/BattleCharacter.js';
import {MODES,SHOWCASE,makePlan} from '../skill.mjs';
import {GeneralJokFX,loadGeneralJokAssets,ROOT} from './GeneralJokFX.js';
import {REQUIEM_BASELINE,GENERAL_JOK_COMBAT,resolvePreviewCast} from '../balance.mjs';
const parentDoc=window.parent.document,$=id=>parentDoc.getElementById(id)||document.getElementById(id);
const IDS=['CN-02D9DC1E8A8A4209','CN-0505936A0CBB4E59','CN-25F931CE393D474E','CN-23EB4B19986D4818','CN-519C181C18DF4B8E'];
const get=async p=>{const r=await fetch(p);if(!r.ok)throw Error('자산 누락: '+p);return r.json()};
let engine,renderer,merc,fx,disposed=false,resizeRaf;
const queue={active:false,index:0,completed:false};
function stopQueue(){queue.active=false;$('showcase').textContent='전체 시연'}
function change(){stopQueue();const mode=$('mode').value;fx.setPlan(makePlan({mode,stop:$('scenario').value==='normal'?null:.3}));}
function queueNext(){if(!queue.active)return;const mode=SHOWCASE[queue.index];$('mode').value=mode;fx.setPlan(makePlan({mode}));fx.play();$('showcase').textContent=`시연 ${queue.index+1} / ${SHOWCASE.length}`;}
function update(f){
 $('play').textContent=f.playing?'일시정지':'재생';$('scrub').max=f.plan.duration;$('scrub').value=f.time;$('time').textContent=f.time.toFixed(2)+' / '+f.plan.duration.toFixed(2)+'초';
 $('cue').textContent=f.sample.label;$('description').textContent=MODES[f.plan.mode].description;
 $('events').replaceChildren(...f.plan.events.map(([t,label])=>{const li=parentDoc.createElement('li');li.className=t<=f.time?'active':'';const time=parentDoc.createElement('time');time.textContent=t.toFixed(2)+'s';const span=parentDoc.createElement('span');span.textContent=label;li.append(time,span);return li;}));
 for(const b of parentDoc.querySelectorAll('[data-mode]'))b.setAttribute('aria-pressed',String(b.dataset.mode===f.plan.mode));
}
function layoutSideView(){
 if(!engine||!merc)return;
 // Local art-review layout inside the existing V3 renderer. The production
 // formation, deck API, damage engine and card dock are not changed.
 const w=engine.app.screen.width,h=engine.app.screen.height,world={width:1600,height:670};
 const dock=engine.host.closest('.battle-v3-live-shell').querySelector('.battle-v3-dock')?.getBoundingClientRect().height||110;
 const scale=Math.min((w-16)/world.width,Math.max(100,h-dock-16)/world.height);
 engine.scene=world;engine.root.scale.set(scale);engine.root.position.set((w-world.width*scale)/2,20);
 const bgRatio=1942/809,bgHeight=Math.max(h,w/bgRatio),groundY=20+550*scale;
 engine.host.style.backgroundSize=(bgHeight*bgRatio)+'px '+bgHeight+'px';
 engine.host.style.backgroundPosition='center '+(groundY-bgHeight*.78)+'px';
 engine.host.style.backgroundRepeat='no-repeat';
 engine.camera.reset(true);engine.camera.setViewport(world.width,world.height);engine.layoutParallax(world.width,world.height);
 // One background image on the canvas host. Avoid drawing a second scaled copy
 // inside the letterboxed combat world (which would create a visible rectangle).
 engine.backgroundLayer.visible=false;
 if(engine.isoFloorLayer)engine.isoFloorLayer.visible=false;
 engine.uiLayer.visible=false;if(engine.bottomShade)engine.bottomShade.visible=false;
 for(const [i,a]of engine.allies.entries()){
  a.setFormation(92+i*62,550,180/a.fullBodyHeight);a.perspectiveResolver=()=>a.restScale;a.hud.visible=false;a.stateHalo.visible=false;a.view.rotation=0;a.view.x=0;a.view.y=0;
 }
 for(const [i,a]of engine.enemies.entries()){
  a.setFormation(1050+i*102,550,(i===0?395:330)/a.fullBodyHeight);a.perspectiveResolver=()=>a.restScale;a.hud.visible=false;a.stateHalo.visible=false;a.view.rotation=0;a.view.x=0;a.view.y=0;
 }
 merc.setFormation(445,550,1);merc.perspectiveResolver=()=>1;merc.hud.visible=true;merc.hud.position.set(-12,-470);merc.hud.scale.set(.8);merc.stateHalo.visible=false;merc.view.rotation=0;merc.view.position.set(0,0);
 engine.combatLayer.sortChildren();
}
function resize(){if(!fx||disposed)return;cancelAnimationFrame(resizeRaf);resizeRaf=requestAnimationFrame(()=>{const at=fx.time;layoutSideView();fx.captureFormation();fx.render(at);});}
function dispose(){if(disposed)return;disposed=true;queue.active=false;cancelAnimationFrame(resizeRaf);engine?.app.renderer.off('resize',resize);fx?.destroy();for(const a of [...(engine?.allies||[]),...(engine?.enemies||[])]){a.animationAdapter?.destroy?.();a.animationController?.kill?.();}merc?.destroy();renderer?.destroy();window.ProjectVPixiBattle?.destroy();}
async function boot(){try{
 const [manifest,catalogs]=await Promise.all([get(ROOT+'manifest.json'),Promise.all(['fur/manifest-v2.json','zenith/manifest-v1.json','superstar/manifest-v1.json'].map(p=>get('/assets/ui/project-v/characters/'+p)))]);
 const all=catalogs.flatMap(m=>m.characters);
 const deck=IDS.map((id,i)=>{const c=all.find(x=>x.cardId===id);if(!c)throw Error('실제 기준 카드 누락');return {...c,id,cardId:id,name:c.member,title:c.title,image:'/'+c.sourceArt,sourceArt:'/'+c.sourceArt,originalCardArt:'/'+c.sourceArt,power_type:['ATTACK','DEFENSE','SPEED','HP','ATTACK'][i],hp:100,maxHp:100};});
 window.cnineCardCatalog=()=>deck;const payload={previewOnly:true,mode:'PVP',battlefieldMode:'PVP',battleV2:{mode:'PVP',teams:{A:{cards:deck},B:{cards:deck}},result:{timeline:[]}}};
 const api=window.ProjectVPixiBattle;api.mountForBattle=async(data,host)=>{engine=await mountForBattle(data,host);return engine;};
 const prepared=window.ProjectVBattleV3Live.prepareLoading({modal:$('lab-modal'),mode:'PVP',playerName:'제너럴 족',opponentName:'전투 리소스 검수',autoText:'전투 리소스 불러오는 중'});
 try{renderer=await window.ProjectVBattleV3Live.createRenderer({...prepared,modal:$('lab-modal'),data:payload,mode:'PVP',playerName:'제너럴 족'});}finally{api.mountForBattle=mountForBattle;}
 await engine.deployCards({instant:true,force:true});const assets=await loadGeneralJokAssets(manifest);
 merc=new BattleCharacter({id:'GENERAL_JOK_RESOURCE_PREVIEW',name:'제너럴 족',team:TEAM.ALLY,fullBodyTexture:assets.standing,cutInTexture:null,fullBodyHeight:manifest.sprite.physicalBodyHeight,accent:0x9cbfff});
 engine.combatLayer.addChild(merc.root);engine.setFormationMercenaries([merc]);merc.root.alpha=1;merc.root.visible=true;
 const plate=new Sprite(assets.panel);plate.width=250;plate.height=62;plate.position.set(-15,-10);merc.namePlate.visible=false;merc.hud.addChildAt(plate,0);
 merc.hpShell.visible=false;merc.hpFill.visible=false;merc.shieldShell.visible=false;merc.shieldFill.visible=false;
 layoutSideView();fx=new GeneralJokFX(engine,merc,engine.enemies,assets,manifest,makePlan({mode:'attack'}),update);
 const header=engine.host.closest('.battle-v3-live-shell').querySelector('.battle-v3-header strong');header.textContent='제너럴 족';
 const shell=engine.host.closest('.battle-v3-live-shell');shell.querySelector('.battle-v3-header small').textContent='C9 ARTILLERY';shell.querySelector('.battle-v3-status').textContent='M777 155mm · C9 야포단';
 fx.onCancel=stopQueue;fx.onComplete=()=>{if(!queue.active)return;queue.index++;if(queue.index<SHOWCASE.length)queueNext();else{queue.completed=true;stopQueue();$('cue').textContent='전체 시연 완료';}};
 $('showcase').onclick=()=>{queue.active=true;queue.index=0;queue.completed=false;$('scenario').value='normal';queueNext();};
 $('play').onclick=()=>fx.playing?fx.pause():fx.play();$('restart').onclick=()=>{stopQueue();fx.seek(0);fx.play();};$('cancel').onclick=()=>fx.cancel();
 $('impact').onclick=()=>{stopQueue();fx.seek(fx.plan.contacts[0]??.55);};$('recoil-point').onclick=()=>{stopQueue();fx.seek((fx.plan.shots[0]?.fire??.5)+.06);};
 $('scrub').oninput=()=>{stopQueue();fx.seek(Number($('scrub').value));};$('speed').onchange=()=>fx.setSpeed($('speed').value);
 $('flag').onchange=()=>fx.setFlag($('flag').checked);$('aura').onchange=()=>fx.setAura($('aura').checked);$('rim').onchange=()=>fx.setRim($('rim').checked);$('motion-only').onchange=()=>fx.setMotionOnly($('motion-only').checked);$('reduced').onchange=()=>fx.setReducedMotion($('reduced').checked);
 $('mode').onchange=change;$('scenario').onchange=change;$('reduced').checked=fx.reducedMotion;
 for(const button of parentDoc.querySelectorAll('[data-mode]'))button.onclick=()=>{$('mode').value=button.dataset.mode;change();fx.play();};
 for(const control of parentDoc.querySelectorAll('button,select,input'))control.disabled=false;
 $('health').textContent='M777 야포단 · 황금 파쇄탄 · 초대형 연쇄 폭발';prepared.phase.textContent='SSS LIMITED';
 const n=v=>v.toLocaleString('ko-KR',{maximumFractionDigits:3});
 const rows=[['기본 전투력',n(REQUIEM_BASELINE.basePower),n(GENERAL_JOK_COMBAT.basePower)],['공격 연계',n(REQUIEM_BASELINE.link.attackPercent)+'%',n(GENERAL_JOK_COMBAT.link.attackPercent)+'%'],['체력 연계',n(REQUIEM_BASELINE.link.hpPercent)+'%',n(GENERAL_JOK_COMBAT.link.hpPercent)+'%'],['받는 피해 감소','80%','80%'],['행동 배율','3.12×','3.12×'],['PVE 광역 총 피해','1,512%','1,512%'],['광역 재사용 / 소모','3행동 / 20','3행동 / 20']];
 $('balance-rows').replaceChildren(...rows.map(row=>{const tr=parentDoc.createElement('tr');for(const [i,text]of row.entries()){const cell=parentDoc.createElement(i?'td':'th');cell.textContent=text;tr.append(cell);}return tr;}));
 engine.app.renderer.on('resize',resize);
 const review={get fx(){return fx},get engine(){return engine},get merc(){return merc},manifest,queue,balance:{baseline:REQUIEM_BASELINE,general:GENERAL_JOK_COMBAT,resolveCast:resolvePreviewCast},diagnostics:()=>({...fx.diagnostics(),queue:{...queue},scene:engine.scene}),dispose};window.GeneralJokPreview=review;window.parent.GeneralJokPreview=review;
 const params=new URLSearchParams(window.parent.location.search),mode=MODES[params.get('mode')]?params.get('mode'):'attack';$('mode').value=mode;fx.setPlan(makePlan({mode}));resize();
 const initialAt=Number(params.get('at'));if(params.has('at')&&Number.isFinite(initialAt))fx.seek(initialAt);else if(!fx.reducedMotion)fx.play();
 window.addEventListener('pagehide',dispose,{once:true});document.addEventListener('visibilitychange',()=>{if(document.hidden)fx.pause();});engine.app.canvas.addEventListener('webglcontextlost',()=>fx.cancel());
}catch(e){$('health').textContent='시연 준비 실패: '+e.message;console.error('[GeneralJok]',e);}}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else void boot();
