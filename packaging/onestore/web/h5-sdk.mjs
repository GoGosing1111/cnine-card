import {createSDK} from 'https://h5sdk.onestore.net/lib/v1.1.0/onestore-h5-sdk.min.js';
import {handleGameBack} from './h5-back.mjs';

const state=window.CNineStoreWeb.state,sdk=createSDK();
state.sdk=sdk;
let info={},paused=false,silent=false,bgmWasActive=false;
const pausedMedia=new Map();
const pausedContexts=new Set();
const domReady=document.readyState==='loading'?new Promise(resolve=>document.addEventListener('DOMContentLoaded',resolve,{once:true})):Promise.resolve();
function mediaSilence(){
  for(const el of new Set([...state.media,...document.querySelectorAll('audio,video')])){
    if(!pausedMedia.has(el))pausedMedia.set(el,{playing:!el.paused,muted:el.muted});
    if(paused)el.pause();else if(silent)el.muted=true;
  }
}
document.addEventListener('play',()=>{if(paused||silent)mediaSilence();},true);
function sound(){
  state.paused=paused;state.silent=silent;
  for(const context of state.audioContexts){
    if((paused||silent)&&context.state==='running'){pausedContexts.add(context);void context.suspend();}
    else if(!paused&&!silent&&pausedContexts.has(context)){pausedContexts.delete(context);void context.resume();}
  }
  if(paused||silent){if(window.lobbyBgm?.active)bgmWasActive=true;window.lobbyBgm?.stop();mediaSilence();return;}
  for(const [el,previous] of pausedMedia){el.muted=previous.muted;if(previous.playing)el.play()?.catch(()=>{});}
  pausedMedia.clear();
  if(bgmWasActive){bgmWasActive=false;window.lobbyBgm?.syncRoute();}
}
function syncPause(){
  if(!document.body)return;
  document.body.inert=paused;
  document.documentElement.dataset.onestorePaused=String(paused);
  window.dispatchEvent(new Event(paused?'cnine:canvas-suspend':'cnine:canvas-resume'));
  sound();
}
function saveSession(){
  if(!info.playerId)return;
  try{sessionStorage.setItem('reversecall:onestore:'+info.playerId,JSON.stringify({path:location.pathname,screen:window.SoopketmonV21ExactShell?.currentRoute||'',at:Date.now()}));}catch{}
  // Account progress and combat receipts are already persisted by the server.
  // Never write a balance, grant a reward, or finish a battle during exit.
}
sdk.on('pause',()=>{if(paused)return;paused=true;saveSession();syncPause();});
sdk.on('resume',event=>{paused=false;if(typeof event?.ringerSilent==='boolean')silent=event.ringerSilent;syncPause();});
sdk.on('exit',()=>{saveSession();paused=true;syncPause();});
sdk.onBackPressed(()=>{
  if(paused)return true;
  const result=handleGameBack();
  if(result==='handled')return true;
  if(result==='page'&&location.pathname!=='/onestore/'&&location.pathname!=='/onestore/index.html'){location.assign('/onestore/');return true;}
  return false;
});
async function readyScreen(){
  await domReady;
  const main=document.getElementById('app');
  if(!main)return;
  if(document.documentElement.dataset.v21UiReady==='1'||main.querySelector('main.page,.login-wrap,.maintenance-screen,.prison-lock-shell'))return;
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{watch.disconnect();reject(new Error('game_screen_timeout'));},30000);
    const watch=new MutationObserver(()=>{
      if(document.documentElement.dataset.v21UiReady==='1'||main.querySelector('main.page,.login-wrap,.maintenance-screen,.prison-lock-shell')){clearTimeout(timer);watch.disconnect();resolve();}
    });
    watch.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['data-v21-ui-ready']});
  });
}
async function failure(error){
  state.status='error';state.reason=String(error?.reason||error?.message||'sdk_error');
  await domReady;
  const notice=document.createElement('div');notice.id='onestore-boot-error';notice.setAttribute('role','alert');
  notice.innerHTML='<p>원스토어 연결을 완료하지 못했습니다.</p><button type="button">다시 연결</button>';
  notice.querySelector('button').onclick=()=>location.reload();document.body.append(notice);
  console.error('ONE store startup:',state.reason);
}
async function boot(){
  try{
    info=await sdk.initializeAsync();
    if(info.err){
      if(info.err==='Platform Not Supported'&&window.parent===window){state.status='browser';return;}
      throw new Error(info.err);
    }
    state.status='initialized';silent=info.ringerSilent===true;
    for(const edge of ['top','right','bottom','left'])document.documentElement.style.setProperty('--onestore-safe-'+edge,Math.max(0,Number(info.safeArea?.[edge])||0)+'px');
    sdk.setLoadingProgress(10);
    await domReady;syncPause();sdk.setLoadingProgress(60);
    await readyScreen();sdk.setLoadingProgress(100);
    await sdk.startGameAsync();state.status='ready';
  }catch(error){await failure(error);}
}
void boot();
