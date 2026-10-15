const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('soopDialog',Object.freeze({
  data:()=>ipcRenderer.invoke('game-dialog:data'),
  ready:height=>ipcRenderer.send('game-dialog:ready',height),
  finish:(accepted,value)=>ipcRenderer.send('game-dialog:result',{accepted:accepted===true,value:typeof value==='string'?value:''})
}));
