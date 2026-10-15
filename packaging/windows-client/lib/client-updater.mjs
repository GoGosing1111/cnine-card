import {versionLess} from './policy.mjs';

// Electron owns the executable download, SHA-512 verification and NSIS handoff.
// Keep this lifecycle separate from game-resource updates and remote game IPC.
export class ClientUpdater {
  constructor({updater,version,onState,canInstall}){
    this.updater=updater;this.version=version;this.onState=onState;this.canInstall=canInstall;
    this.state={status:'idle'};this.pending=null;this.stopped=false;
    updater.autoDownload=false;
    // A Windows shutdown must never start an installer that the OS can kill.
    // Installation only follows the explicit restart button while no game is open.
    updater.autoInstallOnAppQuit=false;
    updater.allowPrerelease=false;updater.allowDowngrade=false;updater.disableWebInstaller=true;
    updater.on('download-progress',progress=>{
      if(this.state.status==='downloading')this.set({progress:{bytes:progress.transferred,total:progress.total}});
    });
    updater.on('error',()=>this.failed());
  }
  set(patch){
    if(this.stopped)return;
    this.state={...this.state,...patch};this.onState(this.state);
  }
  failed(){this.set({status:'error',progress:null});}
  check(){
    if(this.stopped||this.state.status==='ready'||this.state.status==='installing')return Promise.resolve();
    if(this.pending)return this.pending;
    this.pending=this.run().finally(()=>{this.pending=null;this.cancellation=null;});
    return this.pending;
  }
  async run(){
    this.set({status:'checking',version:null,progress:null});
    try{
      const result=await this.updater.checkForUpdates();
      if(this.stopped)return;
      const version=result?.updateInfo?.version;
      if(!result?.isUpdateAvailable||!version||!/^\d+\.\d+\.\d+$/.test(version)||!versionLess(this.version,version)){
        this.set({status:'current'});return;
      }
      this.cancellation=result.cancellationToken;
      this.set({status:'downloading',version});
      const files=await this.updater.downloadUpdate(this.cancellation);
      if(!files?.length)throw new Error('No verified installer');
      this.set({status:'ready',progress:null});
    }catch{this.failed();}
  }
  install(){
    if(this.stopped||this.state.status!=='ready')throw new Error('런처 업데이트를 먼저 준비해 주세요.');
    if(!this.canInstall())throw new Error('게임 창을 모두 닫고 파일 준비가 끝난 뒤 다시 시작해 주세요.');
    this.set({status:'installing'});
    try{this.updater.quitAndInstall(true,true);}catch{this.failed();}
  }
  stop(){this.stopped=true;this.cancellation?.cancel();}
}
