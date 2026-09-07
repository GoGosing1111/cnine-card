import {Application,Assets,Container,Graphics} from 'pixi.js';
import {AccountBattleUnit} from '../../project-v-v3/source/battle/AccountBattleUnit.js';
import {resolveAccountBattleSuitAnimation} from '../../project-v-v3/source/battle/AccountBattleSuitAnimationCatalog.js';

const $=id=>document.getElementById(id);
const state={weaponIndex:4,auto:false,loading:true,shots:0,error:null,light:false};
let app,manifest,units=[],floor,targets=[],requestId=0,timer;
const shortNames=['아발론 M4A1','인피니티 AK','인피니티 M200','소버린 SKS','금룡 돌격소총','금룡 대물저격총'];

function layout(){
  if(!app)return;
  const host=$('stage'),width=host.clientWidth,height=host.clientHeight;
  app.renderer.resize(width,height);
  const mobile=width<550,half=width;
  const size=Math.min(1.28,(half-40)/380,(height-24)/480);
  floor.clear();
  floor.rect(0,0,width,height).fill(state.light?0xc7d2df:0x0b131d);
  const gridColor=state.light?0x93a5b6:0x203347;
  for(let y=25;y<height;y+=42)floor.moveTo(0,y).lineTo(width,y).stroke({color:gridColor,width:1,alpha:.25});
  units.forEach((unit,i)=>{
    const start=mobile?0:i*half;
    unit.root.visible=unit.active;
    unit.setFormation(start+half*(mobile?.19:.32),height-26,size);
    const mx=start+half*.86,my=Math.max(36,height-340*size);
    targets[i]={x:mx,y:my};
    {
      floor.circle(mx,my,13).stroke({color:state.light?0x526f89:0x587694,width:1,alpha:.6});
      floor.moveTo(mx-20,my).lineTo(mx+20,my).moveTo(mx,my-20).lineTo(mx,my+20).stroke({color:state.light?0x526f89:0x587694,width:1,alpha:.45});
    }
  });
}
async function selectWeapon(index){
  const id=++requestId;
  state.weaponIndex=index;state.loading=true;
  stopAuto();$('fire').disabled=true;$('auto').disabled=true;
  document.querySelectorAll('.weapon').forEach((b,i)=>{b.classList.toggle('active',i===index);b.setAttribute('aria-pressed',String(i===index));});
  units.forEach(u=>{u.cancelFire();u.setActive(false);});
  try{
    const profile=resolveAccountBattleSuitAnimation(manifest.approvedLiveEquipmentCode,manifest.weapons[index].equipmentCode);
    if(!profile)throw Error('H-BODY 라이브 무기 매칭 누락');
    const textures=await Promise.all(manifest.suits.map(()=>Assets.load(profile.sheetUrl)));
    if(id!==requestId)return;
    manifest.suits.forEach((s,i)=>{
      if(!units[i].setAuthoredSheet(textures[i],profile,{height:430,source:profile.sheetUrl}))throw Error('V3 아틀라스 프레임 설정 실패');
      units[i].setName(s.name);units[i].nameHud.visible=false;
      units[i].setActive(true,{deployed:true});
    });
    $('downloads').innerHTML=manifest.suits.map(s=>{
      const e=s.entries[index];
      return `<article class="download"><div><strong>${s.name}</strong><span>${shortNames[index]} · 실제 알파 PNG${index===2?' · 승인본':e.authored?.weaponRasterCopied?` · 원본 총기 합성 V${index===4?7:6}`:''}</span></div><div class="download-links">${e.authored?.highResolution?`<a href="${e.authored.highResolution}" download>고해상도 ↓</a>`:''}<a href="${e.image}" download>투명 PNG ↓</a><a href="${e.profile.sheetUrl}" download>아틀라스 ↓</a></div></article>`;
    }).join('');
    $('weapon-name').textContent=manifest.weapons[index].name;
    state.loading=false;state.error=null;$('loading').hidden=true;$('loading').style.display='none';
    $('fire').disabled=false;$('auto').disabled=false;layout();
  }catch(error){
    if(id!==requestId)return;
    state.error=String(error.message||error);$('loading').textContent=state.error;$('loading').style.display='grid';
  }
}
async function fire(){
  if(state.loading)return false;
  const index=state.weaponIndex;
  const results=await Promise.all(units.map((unit,i)=>unit.root.visible?unit.playRangedFire({targetX:targets[i].x,targetY:targets[i].y,weaponCode:manifest.weapons[index].equipmentCode}):Promise.resolve(true)));
  if(results.every(Boolean))state.shots++;
  $('shot-status').textContent=`사격 ${state.shots}회 검수 · 무음 / 실제 피해 없음`;
  return results.every(Boolean);
}
function stopAuto(){state.auto=false;clearTimeout(timer);$('auto').setAttribute('aria-pressed','false');$('auto').textContent='연속 사격 OFF';}
async function autoLoop(){
  if(!state.auto)return;
  await fire();
  if(state.auto)timer=setTimeout(autoLoop,[160,200,750,470,160,850][state.weaponIndex]);
}
async function main(){
  const response=await fetch('./manifest.json');if(!response.ok)throw Error('리소스 명세를 불러올 수 없습니다.');
  manifest=await response.json();
  app=new Application();await app.init({width:1200,height:560,backgroundAlpha:0,antialias:true,resolution:Math.min(2,devicePixelRatio||1),autoDensity:true});
  $('stage').appendChild(app.canvas);floor=new Graphics();app.stage.addChild(floor);
  const effects=new Container();effects.sortableChildren=true;
  units=manifest.suits.map(()=>new AccountBattleUnit({effectLayer:effects}));
  units.forEach(u=>app.stage.addChild(u.root));app.stage.addChild(effects);
  $('weapons').innerHTML=manifest.weapons.map((w,i)=>`<button class="weapon" type="button" data-index="${i}" aria-pressed="false"><img src="${w.battleSprite}" alt=""><span>${shortNames[i]}</span></button>`).join('');
  $('weapons').addEventListener('click',e=>{const button=e.target.closest('button');if(button)selectWeapon(Number(button.dataset.index));});
  $('fire').addEventListener('click',()=>fire());
  $('auto').addEventListener('click',()=>{if(state.auto)stopAuto();else{state.auto=true;$('auto').setAttribute('aria-pressed','true');$('auto').textContent='연속 사격 ON';autoLoop();}});
  $('background').addEventListener('click',()=>{state.light=!state.light;document.body.classList.toggle('light',state.light);$('background').textContent=state.light?'어두운 배경':'밝은 배경';layout();});
  new ResizeObserver(layout).observe($('stage'));
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stopAuto();});
  await Promise.all(units.map(u=>u.prepareRangedFireEffects()));
  await selectWeapon(4);
  window.prestigeSuitPreview={diagnostics:()=>({...state,scope:'PREVIEW_ONLY',liveEnabled:false,equipmentCode:manifest.approvedLiveEquipmentCode,profileSource:'LIVE_V3_CATALOG',units:units.map(u=>u.diagnostics())}),selectWeapon,fire};
}
main().catch(error=>{state.error=String(error.message||error);$('loading').textContent=state.error;console.error(error);});
