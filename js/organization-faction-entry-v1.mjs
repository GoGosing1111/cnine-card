import {mount} from './organization-faction-v1.mjs?warChat=20261028-v2&v=20261025-wed-sat-sun&clanRestore=20261025&clanResume=20261025';
import {observeOrganizationHeight} from './organization-embed-size-v1.mjs?v=20261025-clan-eight';
const root=document.getElementById('organizationFactionRoot');
const token=()=>localStorage.getItem('cnine_card_api_token')||sessionStorage.getItem('cnine_card_api_token')||'';
const roundId=new URL(location.href).searchParams.get('roundId');
async function apiRequest(path,options={}){
 const url='/api/'+path+(roundId&&!options.body?'?roundId='+encodeURIComponent(roundId):'');
 const response=await fetch(url,{...options,headers:{'Content-Type':'application/json',Authorization:'Bearer '+token(),...options.headers},cache:'no-store'});
 const data=await response.json();if(!response.ok)throw Object.assign(Error(data.error||'클랜 전황을 불러오지 못했습니다.'),{status:response.status,code:data.code});return data;
}
let battleLoading;
async function loadLocalBattle(){
 if(!battleLoading)battleLoading=(async()=>{
  const resources=await fetch('/organization/faction/battle-resources.json?v=20261015-boundaries2').then(r=>r.json());
  for(const href of resources.styles){const link=document.createElement('link');link.rel='stylesheet';link.href='/'+href;document.head.append(link);}
  for(const src of resources.scripts)await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/'+src;script.onload=resolve;script.onerror=()=>reject(Error('전투 리소스를 불러오지 못했습니다.'));document.body.append(script);});
  await window.ProjectVBattleV3Live?.ensureRuntime?.();
  if(!window.ProjectVBattleV3Live?.ready?.())throw Error('전투 화면 준비가 지연되었습니다.');
 })().catch(error=>{battleLoading=null;throw error;});
 return battleLoading;
}
function battleHost(){
 if(new URL(location.href).searchParams.get('window')==='1')return window;
 let current=window;
 for(let i=0;i<4;i++){try{if(current.ensureFeatureResources)return current;if(current.parent===current)break;current=current.parent;}catch{break;}}
 return window;
}
const host=battleHost();
async function ensureBattle(){if(host.ensureFeatureResources)await host.ensureFeatureResources('battleV2');else await loadLocalBattle();}
async function playFactionBattle(data){
 await ensureBattle();
 const modal=host.document.getElementById('modal');
 if(!modal||!host.prepareBattleV2LiveLoading||!host.playPvpBattleV2Live)throw Error('전투 재생 화면을 확인하지 못했습니다.');
 const close=()=>{modal.__battleV2Renderer?.destroy?.();modal.__battleV2Renderer=null;modal.onclick=null;modal.className='modal';modal.innerHTML='';};
 try{
  const live=host.prepareBattleV2LiveLoading({modal,mode:'PVP',playerName:data.player.nickname,opponentName:data.opponent.nickname});
  live.stage.querySelector('.battle-v3-header strong').textContent='클랜 세력전';
  live.stage.querySelector('.battle-v3-header small').textContent='CLAN · TERRITORY WAR';
  await host.playPvpBattleV2Live({...live,modal,data});
  await new Promise(resolve=>{const button=host.document.createElement('button');button.className='fw-battle-close';button.textContent='클랜 전투실로 복귀';Object.assign(button.style,{position:'absolute',right:'20px',bottom:'20px',padding:'16px 26px',zIndex:'1000',background:'transparent url(/assets/ui/organization/interface-v2/action-primary.webp) center/100% 100% no-repeat',color:'#eee5cf',border:'0',fontWeight:'700',minHeight:'52px'});button.onclick=()=>{close();resolve();};modal.append(button);});
 }catch(error){close();throw error;}
}
mount(root,{apiRequest,ensureFeatureResources:ensureBattle,playFactionBattle});
if(new URL(location.href).searchParams.get('window')!=='1')observeOrganizationHeight(root.closest('.war-chat-workspace')||root,'organization:faction:height');
const leave=()=>{if(document.querySelector('#modal.show,dialog[open]'))return;try{if(window.parent!==window&&parent.location.origin===location.origin){parent.postMessage({type:'organization:faction:close'},location.origin);return;}}catch{}location.href='/organization/';};
root.addEventListener('click',event=>{if(event.target.closest('[data-fw-leave]'))leave();});
window.addEventListener('message',event=>{if(event.origin===location.origin&&event.source===parent&&event.data?.type==='organization:faction:escape')leave();});
window.addEventListener('keydown',event=>{if(event.key==='Escape'&&!event.defaultPrevented)leave();});
