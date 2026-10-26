import {app,BrowserWindow,Menu,ipcMain,session,shell,screen} from 'electron';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {GAME_ORIGIN,CLIENT_VERSION,manifestEntry,allowedNavigation} from './lib/policy.mjs';
import {ResourceStore,fileResponse} from './lib/resource-store.mjs';
import {forwardNetworkRequest} from './lib/network-request.mjs';
import {GameZoom} from './lib/game-zoom.mjs';
import {ClientUpdater} from './lib/client-updater.mjs';
import {GameDialogs} from './lib/game-dialogs.mjs';
import {APP_ID,LEGACY_PROFILE_DIRECTORY} from './lib/app-identity.mjs';
import {windowsUserAgent} from './lib/user-agent.mjs';
import {mkdirSync} from 'node:fs';

// Set before any session/window exists, including the launcher and DK popups.
app.userAgentFallback=windowsUserAgent(process.versions);
const here=path.dirname(fileURLToPath(import.meta.url));
const qa=!app.isPackaged && process.env.SOOPKETMON_QA==='1';
if(qa&&process.env.SOOPKETMON_QA_ROOT)app.setPath('userData',path.resolve(process.env.SOOPKETMON_QA_ROOT));
else{const profile=path.join(app.getPath('appData'),LEGACY_PROFILE_DIRECTORY);mkdirSync(profile,{recursive:true});app.setPath('userData',profile);}
app.setAppUserModelId(APP_ID);
const singleton=app.requestSingleInstanceLock();
if(!singleton)app.quit();
let launcher,game,store,latest,active,gameManifest,operation,gameSession,gameZoom,gameDialogs,clientUpdater,quitting=false;
const hasGameWindows=()=>Boolean(gameZoom?.contents.size);
let state={phase:'checking',title:'업데이트 확인 중',description:'게임 파일 정보를 확인하고 있습니다.',clientVersion:CLIENT_VERSION,stats:{bytes:0,count:0},plan:null,progress:null,ready:false};
const uiUrl=pathToFileURL(path.join(here,'renderer/index.html')).href;
const emit=patch=>{state={...state,...patch};if(launcher&&!launcher.isDestroyed())launcher.webContents.send('launcher:state',state);};
const failure=error=>emit({phase:'error',title:error?.name==='AbortError'?'다운로드 일시 정지':'다시 확인해 주세요',description:error?.name==='AbortError'?'받은 파일은 보관됩니다. 이어서 다운로드할 수 있습니다.':String(error?.message||error),progress:null,ready:false});
function authorize(event){
  if(!launcher||event.sender!==launcher.webContents||event.senderFrame!==launcher.webContents.mainFrame||event.senderFrame.url!==uiUrl)throw new Error('Launcher access denied');
}
async function updateStats(){emit({stats:await store.stats()});}
async function check(){
  if(operation||hasGameWindows()||quitting||clientUpdater?.state.status==='installing')return;
  void clientUpdater?.check();
  const token=new AbortController();operation=token;emit({phase:'checking',title:'업데이트 확인 중',description:'새 파일과 PC에 저장된 파일을 확인합니다.',ready:false,progress:null});
  try{
    latest=await store.checkForUpdate(token.signal);const plan=await store.plan(latest);active=await store.readActive();
    const ready=!plan.missingFiles;
    if(ready){await store.activateCached(latest,{signal:token.signal});active=latest;}
    emit({phase:ready?'ready':'available',title:ready?'플레이 준비 완료':active?'새 업데이트가 있습니다':'첫 실행을 준비해 주세요',description:ready?'최신 상태입니다. 추가 다운로드 없이 시작합니다.':'필수 파일을 먼저 준비하고, 이미지와 음원은 이용할 때 받아 보관합니다.',ready,plan,releaseId:latest.releaseId.slice(0,12)});
    await updateStats();
  }catch(error){failure(error);}finally{if(operation===token)operation=null;}
}
async function prepare({repair=false,launch=false}={}){
  if(operation||hasGameWindows()||quitting||clientUpdater?.state.status==='installing')return;if(!latest){await check();if(!latest)return;}
  const token=new AbortController();operation=token;
  try{
    // check() already verified the active content. Starting again must not look
    // like another installation or rewrite the same active manifest.
    if(launch&&!repair&&state.ready&&active?.releaseId===latest.releaseId){await store.prune(active);token.signal.throwIfAborted();await openGame();return;}
    emit({phase:'downloading',title:repair?'게임 파일 검사·복구 중':'변경된 게임 파일 다운로드 중',description:repair?'저장된 파일을 검사하고, 없거나 손상된 파일만 받습니다.':'변경된 파일만 받습니다. 중단해도 완료된 파일은 유지됩니다.',ready:false,progress:null});
    await store.prepare(latest,{repair,signal:token.signal,onProgress:progress=>emit({progress})});
    active=latest;await store.prune(active);await updateStats();
    emit({phase:'ready',title:'플레이 준비 완료',description:repair?'파일 검사와 필요한 복구를 마쳤습니다.':'필수 리소스를 모두 준비했습니다.',ready:true,progress:null,plan:await store.plan(active)});
    if(launch)await openGame();
  }catch(error){failure(error);}finally{if(operation===token)operation=null;}
}
function returnToLauncher(){
  if(quitting||!launcher||launcher.isDestroyed())return;
  if(!qa)launcher.show();void check();
}
function secureGameWindow(win){
  gameZoom.attach(win.webContents);
  emit({gameOpen:true});
  win.webContents.once('destroyed',()=>{
    emit({gameOpen:hasGameWindows()});
    if(!hasGameWindows()&&!game)returnToLauncher();
  });
  win.webContents.setWindowOpenHandler(({url})=>{
    if(allowedNavigation(url))return {action:'allow',overrideBrowserWindowOptions:{show:!qa,autoHideMenuBar:true,webPreferences:{session:gameSession,preload:path.join(here,'game-preload.cjs'),nodeIntegration:false,nodeIntegrationInSubFrames:true,contextIsolation:true,sandbox:true,webSecurity:true}}};
    return {action:'deny'};
  });
  win.webContents.on('will-navigate',(event,url)=>{if(!allowedNavigation(url))event.preventDefault();});
  win.webContents.on('will-redirect',(event,url)=>{if(!allowedNavigation(url))event.preventDefault();});
  win.webContents.on('will-attach-webview',event=>event.preventDefault());
  win.webContents.on('did-create-window',child=>secureGameWindow(child));
  win.webContents.on('before-input-event',(event,input)=>{
    if(input.type!=='keyDown')return;
    if(input.key==='F11'){event.preventDefault();win.setFullScreen(!win.isFullScreen());}
    if(input.key==='F5'||(input.control&&input.key.toLowerCase()==='r')){
      event.preventDefault();
      void gameDialogs.show(win,{kind:'confirm',title:'게임을 새로고침할까요?',message:'진행 중인 전투가 중단될 수 있습니다.\n대기 화면에서만 새로고침해 주세요.',acceptLabel:'새로고침'}).then(accepted=>{if(accepted&&!win.isDestroyed())win.reload();});
    }
  });
}
async function openGame(){
  if(game){game.focus();return;}if(!active)throw new Error('게임 파일을 먼저 준비해 주세요.');
  gameManifest=active;
  // Subframes run the same isolated preload for embedded game screens. sandbox
  // remains enabled, so neither the page nor its frames receive a Node runtime.
  game=new BrowserWindow({width:1440,height:960,minWidth:900,minHeight:650,show:!qa,title:'리버스콜',backgroundColor:'#080c17',icon:path.join(here,'renderer/assets/icon.png'),autoHideMenuBar:true,webPreferences:{session:gameSession,preload:path.join(here,'game-preload.cjs'),nodeIntegration:false,nodeIntegrationInSubFrames:true,contextIsolation:true,sandbox:true,webSecurity:true,spellcheck:false}});
  secureGameWindow(game);
  const current=game;
  game.on('closed',()=>{game=null;gameManifest=null;returnToLauncher();});
  game.webContents.on('render-process-gone',()=>emit({notice:'게임 화면이 종료됐습니다. 런처에서 다시 실행할 수 있습니다.'}));
  emit({phase:'playing',title:'게임 실행 중',description:'업데이트와 파일 복구는 게임을 종료한 뒤 진행할 수 있습니다.',ready:false,progress:null});
  try{await game.loadURL(GAME_ORIGIN+'/?source=windows-client');}
  catch(error){if(!current.isDestroyed())current.destroy();throw new Error('게임 화면을 열지 못했습니다. 연결을 확인하고 다시 실행해 주세요.');}
  if(!qa&&!current.isDestroyed()){current.show();launcher.hide();}
}

async function start(){
  await app.whenReady();Menu.setApplicationMenu(null);
  gameZoom=new GameZoom(path.join(app.getPath('userData'),'game-display-v1.json'));
  gameDialogs=new GameDialogs({BrowserWindow,ipcMain,screen,basePath:here,gameContents:gameZoom.contents,allowedNavigation,zoomFactor:()=>gameZoom.factor});
  ipcMain.on('game:zoom',(event,direction)=>{
    if(!gameDialogs.authorizedGame(event))return;
    if(['in','out','reset'].includes(direction))gameZoom.change(direction);
  });
  const fixtureOrigin=qa&&process.env.SOOPKETMON_QA_SERVER;
  if(fixtureOrigin && !/^http:\/\/127\.0\.0\.1:\d+$/.test(fixtureOrigin))throw new Error('Invalid QA server');
  // Node fetch exposes same-origin Pages redirects for verified public downloads.
  // Downloads never share cookies or credentials with the game browser session.
  const fetcher=(url,options={})=>fetch(fixtureOrigin?fixtureOrigin+new URL(url).pathname+new URL(url).search:url,options);
  store=new ResourceStore({root:path.join(app.getPath('userData'),'resources-v1'),fetcher});await store.initialize();
  gameSession=session.fromPartition('persist:soopketmon-game-v1');
  gameSession.setUserAgent(app.userAgentFallback);
  // Local game QA must never open a production WebSocket with fixture credentials.
  if(qa)gameSession.webRequest.onBeforeRequest({urls:['ws://*/*','wss://*/*']},(_details,callback)=>callback({cancel:true}));
  // This is the dedicated app profile, never the user's PWA/browser profile.
  await gameSession.clearStorageData({storages:['serviceworkers','cachestorage']});
  const canUsePermission=(origin,permission)=>origin===GAME_ORIGIN&&['fullscreen','clipboard-sanitized-write'].includes(permission);
  gameSession.setPermissionRequestHandler((webContents,permission,callback,details)=>{
    let origin;try{origin=new URL(details.requestingUrl||webContents.getURL()).origin;}catch{}
    callback(canUsePermission(origin,permission));
  });
  gameSession.setPermissionCheckHandler((_webContents,permission,origin)=>canUsePermission(origin,permission));
  gameSession.protocol.handle('https',async request=>{
    const url=new URL(request.url);
    if(url.origin===GAME_ORIGIN&&url.pathname==='/service-worker.js')return new Response('Desktop resources are managed by the launcher',{status:404,headers:{'Content-Type':'text/plain'}});
    const entry=gameManifest&&manifestEntry(gameManifest,request.url,request.method);
    if(entry){
      try{const file=await store.ensure(entry,gameManifest.releaseId);void store.touch(entry);return fileResponse(file,entry,request);}
      catch(error){emit({notice:'리소스를 받지 못했습니다. 전투를 마친 뒤 런처에서 업데이트를 확인해 주세요.'});return new Response('Resource unavailable',{status:503,headers:{'Content-Type':'text/plain'}});}
    }
    // API requests, cookies, auth headers, bodies and live sockets stay on the
    // original HTTPS service. They are never written to the resource store.
    return forwardNetworkRequest(gameSession,request,fixtureOrigin);
  });
  launcher=new BrowserWindow({width:1120,height:760,minWidth:950,minHeight:680,show:!qa,title:'리버스콜 런처',titleBarStyle:'hidden',titleBarOverlay:{color:'#100c1d',symbolColor:'#cbb9df',height:38},backgroundColor:'#080c17',icon:path.join(here,'renderer/assets/icon.png'),autoHideMenuBar:true,webPreferences:{preload:path.join(here,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,spellcheck:false}});
  launcher.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  launcher.webContents.on('will-navigate',event=>event.preventDefault());
  launcher.on('close',event=>{if(hasGameWindows()&&!quitting){event.preventDefault();launcher.hide();}else operation?.abort();});
  ipcMain.handle('launcher:state',event=>{authorize(event);return state;});
  ipcMain.handle('launcher:command',async(event,command)=>{
    authorize(event);
    if(command==='cancel'){operation?.abort();return;}
    if(command==='check')return check();
    if(command==='restart-client')return clientUpdater?.install();
    if(command==='install')return prepare();
    if(command==='repair')return prepare({repair:true});
    if(command==='play'){if(game){game.show();game.focus();return;}return prepare({launch:true});}
    if(command==='folder')return shell.openPath(store.root);
    if(command==='website')return shell.openExternal(GAME_ORIGIN);
    throw new Error('Unknown launcher command');
  });
  await launcher.loadURL(uiUrl);
  if(app.isPackaged){
    const {default:electronUpdater}=await import('electron-updater');
    clientUpdater=new ClientUpdater({updater:electronUpdater.autoUpdater,version:app.getVersion(),onState:clientUpdate=>emit({clientUpdate}),canInstall:()=>!hasGameWindows()&&!operation&&!quitting});
    // Startup, manual checks and return from the game all check the launcher.
    // Long idle sessions also discover releases without interrupting gameplay.
    const timer=setInterval(()=>{if(!hasGameWindows()&&!quitting)void clientUpdater.check();},4*60*60*1000);timer.unref();
  }
  void check();
}
app.on('second-instance',()=>{const win=game||launcher;if(win){win.show();if(win.isMinimized())win.restore();win.focus();}});
app.on('before-quit',()=>{quitting=true;operation?.abort();clientUpdater?.stop();gameDialogs?.dispose();});
app.on('window-all-closed',()=>app.quit());
if(singleton)void start().catch(async error=>{console.error(error);if(!qa&&gameDialogs)await gameDialogs.show(launcher||null,{kind:'alert',title:'리버스콜 실행 오류',message:String(error?.message||error)});app.quit();});
