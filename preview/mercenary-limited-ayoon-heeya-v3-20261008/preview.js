import {mountForBattle} from '../project-v-v3/source/project-v-pixi-battle.src.js';
import {LimitedDuoFX,loadDuoAssets} from '../project-v-v3/source/battle/LimitedDuoCombatPlayback.js';
import {LIMITED_DUO,limitedDuo} from '../../shared/mercenary-limited-duo-20261008.mjs';
import {makePlan} from './skill.mjs';
const $=id=>document.getElementById(id),IDS=['CN-02D9DC1E8A8A4209','CN-0505936A0CBB4E59','CN-25F931CE393D474E','CN-23EB4B19986D4818','CN-519C181C18DF4B8E'];
let engine,renderer,fx,disposed=false,generation=0;
const get=async p=>{const r=await fetch(p);if(!r.ok)throw Error(p+': '+r.status);return r.json();};
function update(f){$('play').textContent=f.playing?'일시정지':'재생';$('scrub').max=f.plan.duration;$('scrub').value=f.time;$('time').textContent=f.time.toFixed(2)+' / '+f.plan.duration.toFixed(2);$('health').textContent=limitedDuo(f.plan.code).name+' · '+f.sample.phase;}
async function change(){
 const token=++generation;fx?.destroy();fx=null;const code=$('character').value,actor=engine.mercenaries.find(c=>c.cardId===code),target=(actor.team==='ALLY'?engine.enemies:engine.allies).filter(a=>!a.isMercenary).slice().sort((a,b)=>b.baseY-a.baseY)[0];
 const assets=await loadDuoAssets(code);if(disposed||token!==generation){for(const t of [...assets.motion,...assets.effects])t.destroy(false);return;}
 fx=new LimitedDuoFX(engine,actor,target,assets,makePlan(code,$('mode').value),update);fx.showEffects=$('effects').checked;fx.setSpeed(Number($('speed').value));fx.play();
}
async function boot(){try{
 const catalogs=await Promise.all(['fur/manifest-v2.json','zenith/manifest-v1.json','superstar/manifest-v1.json'].map(p=>get('/assets/ui/project-v/characters/'+p)));
 const available=catalogs.flatMap(m=>m.characters.map(c=>({...c,grade:m.rarity})));
 const deck=IDS.map((id,i)=>{const c=available.find(c=>c.cardId===id);return {...c,id,cardId:id,name:c.member,title:c.title,image:'/'+c.sourceArt,sourceArt:'/'+c.sourceArt,originalCardArt:'/'+c.sourceArt,power_type:['ATTACK','DEFENSE','SPEED','HP','ATTACK'][i],hp:100,maxHp:100};});
 const merc=(code,side)=>({id:side+':MERCENARY:'+code,cardId:code,code,name:LIMITED_DUO[code].name,rank:'SS',role:LIMITED_DUO[code].role,position:LIMITED_DUO[code].position,hp:100,maxHp:100,shield:0,maxShield:0});
 window.cnineCardCatalog=()=>deck;const payload={previewOnly:true,mode:'PVP',battlefieldMode:'PVP',battleV2:{mode:'PVP',teams:{A:{cards:deck,mercenaries:[merc('V-997','A')]},B:{cards:deck,mercenaries:[merc('V-998','B')]}},result:{timeline:[]}}};
 const api=window.ProjectVPixiBattle;api.mountForBattle=async(data,host)=>{engine=await mountForBattle(data,host);return engine;};
 const prepared=window.ProjectVBattleV3Live.prepareLoading({modal:$('lab-modal'),mode:'PVP',playerName:'아윤 · SS LIMITED',opponentName:'하이희야 · SS LIMITED',autoText:'전장 준비 중'});
 renderer=await window.ProjectVBattleV3Live.createRenderer({...prepared,modal:$('lab-modal'),data:payload,mode:'PVP',playerName:'아윤 · SS LIMITED'});api.mountForBattle=mountForBattle;
 await engine.deployCards({instant:true,force:true});prepared.phase.textContent='SS LIMITED · V3';prepared.stage.querySelector('#pvBattleStatus').textContent='아윤 / 하이희야 · 전용 스킬';
 $('play').onclick=()=>fx.playing?fx.pause():fx.play();$('restart').onclick=()=>{fx.seek(0);fx.play();};$('cancel').onclick=()=>fx.cancel();$('scrub').oninput=()=>fx.seek(Number($('scrub').value));$('speed').onchange=()=>fx.setSpeed(Number($('speed').value));$('effects').onchange=()=>{fx.showEffects=$('effects').checked;fx.render(fx.time);};
 $('character').onchange=change;$('mode').onchange=change;
 const resize=()=>{if(fx){fx.pause();engine.setFormationMercenaries(engine.mercenaries);fx.captureFormation();fx.render(fx.time);}};engine.app.renderer.on('resize',resize);
 window.LimitedDuoPreview={get engine(){return engine;},get fx(){return fx;},change,diagnostics:()=>fx?.diagnostics(),dispose(){if(disposed)return;disposed=true;generation++;fx?.destroy();engine.app.renderer.off('resize',resize);renderer?.destroy();window.ProjectVPixiBattle?.destroy();}};
 window.addEventListener('pagehide',()=>window.LimitedDuoPreview.dispose(),{once:true});document.addEventListener('visibilitychange',()=>{if(document.hidden)fx?.cancel();});await change();
}catch(e){$('health').textContent='재생 준비 실패: '+e.message;console.error(e);}}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else void boot();
