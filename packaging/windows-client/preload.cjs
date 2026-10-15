const {contextBridge,ipcRenderer}=require('electron');
const commands=new Set(['check','install','repair','play','cancel','folder','website','restart-client']);
contextBridge.exposeInMainWorld('soopLauncher',Object.freeze({
  getState:()=>ipcRenderer.invoke('launcher:state'),
  command:name=>{if(!commands.has(name))return Promise.reject(new Error('지원하지 않는 명령입니다.'));return ipcRenderer.invoke('launcher:command',name);},
  onState:callback=>{const listener=(_event,state)=>callback(state);ipcRenderer.on('launcher:state',listener);return()=>ipcRenderer.removeListener('launcher:state',listener);}
}));
