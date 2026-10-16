import path from 'node:path';
import {pathToFileURL} from 'node:url';

const kinds=new Set(['alert','confirm','prompt']);
const cancelled=kind=>kind==='prompt'?null:false;
const validRequest=request=>request&&kinds.has(request.kind)&&typeof request.message==='string'&&request.message.length<=65536&&
  (request.kind!=='prompt'||typeof request.defaultValue==='string'&&request.defaultValue.length<=16384);

// The caller's renderer waits synchronously, just like native window.confirm.
// This separate, sandboxed renderer stays interactive; the main process never blocks.
export class GameDialogs {
  constructor({BrowserWindow,ipcMain,screen,basePath,gameContents,allowedNavigation,zoomFactor=()=>1}){
    Object.assign(this,{BrowserWindow,ipcMain,screen,basePath,gameContents,allowedNavigation,zoomFactor});
    this.pending=new Map();this.owners=new Map();this.stopped=false;
    this.url=pathToFileURL(path.join(basePath,'renderer/dialog.html')).href;
    this.onRequest=(event,request)=>{
      const reply=value=>{try{event.returnValue=value;}catch{/* Caller already closed. */}};
      if(this.stopped||!this.authorizedGame(event)||!validRequest(request))return reply(cancelled(request?.kind));
      this.show(this.BrowserWindow.fromWebContents(event.sender),request).then(reply,()=>reply(cancelled(request.kind)));
    };
    this.onResult=(event,result)=>{
      const entry=this.authorizedDialog(event);if(!entry)return;
      if(result?.accepted!==true)return entry.finish(cancelled(entry.request.kind));
      if(entry.request.kind==='prompt'){
        if(typeof result.value!=='string'||result.value.length>16384)return;
        entry.finish(result.value);
      }else entry.finish(true);
    };
    this.onReady=(event,height)=>{
      const entry=this.authorizedDialog(event);if(!entry||entry.ready)return;
      entry.ready=true;clearTimeout(entry.timeout);
      const {window:win,area,scale}=entry;
      const target=Math.max(entry.minHeight,Math.min(area.height-24,Math.ceil(Number(height)*scale)||entry.minHeight));
      win.setSize(entry.width,target);
      this.position(win,entry.parent,area);
      win.show();win.focus();
    };
    ipcMain.on('game:dialog',this.onRequest);
    ipcMain.on('game-dialog:result',this.onResult);
    ipcMain.on('game-dialog:ready',this.onReady);
    ipcMain.handle('game-dialog:data',event=>{
      const entry=this.authorizedDialog(event);if(!entry)throw Error('Dialog access denied');
      return entry.request;
    });
  }
  authorizedGame(event){
    if(!this.gameContents.has(event.sender)||event.sender.isDestroyed())return false;
    const main=event.sender.mainFrame,frame=event.senderFrame;
    return Boolean(frame&&(frame===main||frame.top===main)&&this.allowedNavigation(main.url)&&this.allowedNavigation(frame.url));
  }
  authorizedDialog(event){
    const entry=this.pending.get(event.sender);
    return entry&&event.senderFrame===event.sender.mainFrame&&event.senderFrame?.url===this.url?entry:null;
  }
  position(win,parent,area){
    const bounds=parent&&!parent.isDestroyed()?parent.getBounds():area;
    const [width,height]=win.getSize();
    win.setPosition(Math.round(Math.max(area.x,Math.min(area.x+area.width-width,bounds.x+(bounds.width-width)/2))),
      Math.round(Math.max(area.y,Math.min(area.y+area.height-height,bounds.y+(bounds.height-height)/2))));
  }
  show(parent,request){
    if(this.stopped||!validRequest(request)||parent?.isDestroyed())return Promise.resolve(cancelled(request?.kind));
    // Repeated F5 presses or overlapping callers must not open a stack or share consent.
    if(this.owners.has(parent)){this.owners.get(parent).window.focus();return Promise.resolve(cancelled(request.kind));}
    return new Promise(resolve=>{
      let entry,win,settled=false;
      const ownerContents=parent?.webContents;
      const finish=value=>{
        if(settled)return;settled=true;
        if(entry){clearTimeout(entry.timeout);this.pending.delete(entry.contents);this.owners.delete(parent);}
        parent?.removeListener('closed',cancel);
        ownerContents?.removeListener('did-start-navigation',navigation);
        ownerContents?.removeListener('render-process-gone',cancel);
        resolve(value);
        if(win&&!win.isDestroyed())win.destroy();
      };
      const cancel=()=>finish(cancelled(request.kind));
      const navigation=(_event,_url,_inPlace,isMainFrame)=>{if(isMainFrame)cancel();};
      try{
        const area=parent?this.screen.getDisplayMatching(parent.getBounds()).workArea:this.screen.getPrimaryDisplay().workArea;
        const scale=Math.max(1,Math.min(2,this.zoomFactor()||1,(area.width-24)/440,(area.height-24)/300));
        const width=Math.min(area.width-24,Math.round(520*scale)),minHeight=Math.min(area.height-24,Math.round(300*scale));
        win=new this.BrowserWindow({parent:parent||undefined,modal:Boolean(parent),width,height:minHeight,
          show:false,frame:false,resizable:false,minimizable:false,maximizable:false,fullscreenable:false,
          skipTaskbar:Boolean(parent),title:request.title||'리버스콜',backgroundColor:'#101827',
          icon:path.join(this.basePath,'renderer/assets/icon.png'),autoHideMenuBar:true,
          webPreferences:{preload:path.join(this.basePath,'lib/dialog-preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true,spellcheck:false,zoomMode:'isolated',zoomFactor:scale}});
        entry={window:win,contents:win.webContents,parent,request,finish,area,scale,width,minHeight,ready:false};
        this.pending.set(win.webContents,entry);this.owners.set(parent,entry);
        entry.timeout=setTimeout(cancel,15000);entry.timeout.unref();
        parent?.once('closed',cancel);parent?.webContents.on('did-start-navigation',navigation);parent?.webContents.once('render-process-gone',cancel);
        win.once('closed',cancel);
        win.webContents.once('render-process-gone',cancel);
        win.webContents.once('did-fail-load',cancel);
        win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
        win.webContents.on('will-navigate',event=>event.preventDefault());
        win.webContents.on('will-redirect',event=>event.preventDefault());
        win.webContents.on('will-attach-webview',event=>event.preventDefault());
        win.webContents.setZoomMode('isolated');win.webContents.setZoomFactor(scale);
        win.webContents.on('before-input-event',(event,input)=>{
          if(input.type==='keyDown'&&input.key==='Escape'&&!input.isComposing){event.preventDefault();cancel();}
          if(input.type==='keyDown'&&(input.key==='F5'||input.control&&['r','+','=','-','0'].includes(input.key.toLowerCase())))event.preventDefault();
        });
        void win.loadURL(this.url).catch(cancel);
      }catch{cancel();}
    });
  }
  dispose(){
    this.stopped=true;
    for(const entry of [...this.pending.values()])entry.finish(cancelled(entry.request.kind));
    this.ipcMain.removeListener('game:dialog',this.onRequest);
    this.ipcMain.removeListener('game-dialog:result',this.onResult);
    this.ipcMain.removeListener('game-dialog:ready',this.onReady);
    this.ipcMain.removeHandler('game-dialog:data');
  }
}
