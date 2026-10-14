import {mountForBattle,destroy as destroyEngine} from '../../project-v-v3/source/project-v-pixi-battle.src.js';
import {Assets} from 'pixi.js';
import {BattleCharacter,TEAM} from '../../project-v-v3/source/battle/BattleCharacter.js';
import {loadAssets,UziBarrageFX} from './UziBarrageFX.js';
const ROOT='/preview/mercenary-black-uniform-dual-uzi-v1/',$=id=>document.getElementById(id);
const ids=['CN-02D9DC1E8A8A4209','CN-0505936A0CBB4E59','CN-25F931CE393D474E','CN-23EB4B19986D4818','CN-519C181C18DF4B8E'];
const get=async url=>{const r=await fetch(url);if(!r.ok)throw Error(url+' '+r.status);return r.json()};
let engine,actor,fx,disposed=false;
function update(v){
 $('skill-play').textContent=v.playing?'일시정지':v.plan.name+' 재생';$('skill-scrub').max=v.plan.duration;$('skill-scrub').value=v.time;$('skill-time').textContent=v.time.toFixed(2)+' / '+v.plan.duration.toFixed(2)+'초';$('skill-cue').textContent=v.state.label;
 $('skill-title').textContent=v.plan.name;$('skill-impact').textContent=v.mode==='quantum'?'대폭발 보기':'집중 타격 보기';
 $('skill-description').textContent=v.mode==='quantum'?'적 전원 포착 → 상공 미사일 강하 → 직격 대폭발 → 연쇄 폭격':'스코프 표적 포착 → 쌍우지 연속 사격 → 조준점 집중 타격';
 document.querySelectorAll('[data-skill-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.skillMode===v.mode)));
}
function resize(){fx?.pause();engine.setFormationMercenaries([actor]);fx?.render(fx.time);}
function dispose(){if(disposed)return;disposed=true;engine?.app?.renderer.off('resize',resize);fx?.destroy();actor?.destroy();destroyEngine();}
async function boot(){try{
 const [manifest,catalogs]=await Promise.all([get(ROOT+'manifest.json'),Promise.all(['fur/manifest-v2.json','zenith/manifest-v1.json','superstar/manifest-v1.json'].map(p=>get('/assets/ui/project-v/characters/'+p)))]);
 const entries=catalogs.flatMap(m=>m.characters.map(c=>({...c,grade:m.rarity})));const deck=ids.map((id,i)=>{const c=entries.find(x=>x.cardId===id);if(!c)throw Error('V3 preview card missing '+id);return {...c,id,cardId:id,name:c.member,image:'/'+c.sourceArt,sourceArt:'/'+c.sourceArt,originalCardArt:'/'+c.sourceArt,power_type:['ATTACK','DEFENSE','SPEED','HP','ATTACK'][i],hp:100,maxHp:100};});
 window.cnineCardCatalog=()=>deck;const payload={previewOnly:true,mode:'PVP',battlefieldMode:'PVP',battleV2:{mode:'PVP',teams:{A:{cards:deck},B:{cards:deck}},result:{timeline:[]}}};
 engine=await mountForBattle(payload,$('v3-host'));await engine.deployCards({instant:true,force:true});await engine.setVisible(true);engine.uiLayer.visible=false;
 const [sd,art,assets]=await Promise.all([Assets.load(ROOT+manifest.battleSprite.path),Assets.load(ROOT+manifest.sourceArt.path),loadAssets(manifest,ROOT)]);
 actor=new BattleCharacter({id:'DUAL_UZI_REVIEW',name:'카이론',team:TEAM.ALLY,fullBodyTexture:sd,cutInTexture:art,fullBodyHeight:360,accent:0xc9c8c2});actor.fullBodySprite.anchor.set(manifest.battleSprite.foot.x/sd.width,manifest.battleSprite.foot.y/sd.height);engine.combatLayer.addChild(actor.root);engine.setFormationMercenaries([actor]);actor.root.visible=true;actor.root.alpha=1;engine.sortCombatDepth();
 const targets=engine.enemies.slice().sort((a,b)=>b.baseY-a.baseY);fx=new UziBarrageFX(engine,actor,targets,assets,manifest,update);
 $('skill-play').onclick=()=>fx.playing?fx.pause():fx.play();$('skill-restart').onclick=()=>{fx.seek(0);fx.play();};$('skill-stop').onclick=()=>fx.cancel();$('skill-impact').onclick=()=>fx.seek(fx.mode==='quantum'?4.15:3.68);$('skill-scrub').oninput=()=>fx.seek(Number($('skill-scrub').value));$('skill-speed').onchange=()=>fx.setSpeed(Number($('skill-speed').value));$('skill-aura').onchange=()=>fx.setAura($('skill-aura').checked);$('skill-rim').onchange=()=>fx.setRim($('skill-rim').checked);
 $('skill-descent').onclick=()=>{fx.setMode('quantum');fx.seek(2.15);fx.play();};
 document.querySelectorAll('[data-skill-mode]').forEach(b=>{b.onclick=()=>fx.setMode(b.dataset.skillMode);});
 document.querySelectorAll('#skill-preview button,#skill-preview input,#skill-preview select').forEach(e=>e.disabled=false);$('skill-health').textContent='재생 준비 완료 · 기존 V3 전장 / PixiJS + GSAP';engine.app.renderer.on('resize',resize);
 window.UziPreview={get fx(){return fx},get engine(){return engine},get actor(){return actor},manifest,diagnostics:()=>fx.diagnostics(),dispose};
 window.addEventListener('pagehide',dispose,{once:true});document.addEventListener('visibilitychange',()=>{if(document.hidden)fx.cancel()});engine.app.canvas.addEventListener('webglcontextlost',()=>{fx.cancel();$('skill-health').textContent='그래픽 연결이 끊어졌습니다. 새로고침해 주세요.';});
 }catch(e){$('skill-health').textContent='전장 준비 실패: '+e.message;console.error('[UziPreview]',e)}}
if(location.protocol==='file:'){$('skill-health').textContent='스킬 재생은 로컬 프리뷰 서버 주소에서 열어 주세요.';}else if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else void boot();
