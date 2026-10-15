const {ipcRenderer,contextBridge}=require('electron');

// Install before any page script. Only these three standard dialog operations
// cross the bridge, never the IPC object or a caller-selected channel.
contextBridge.executeInMainWorld({func:(ask)=>{
  const dialog=(kind,message,defaultValue='')=>ask({kind,message:message===undefined?'':String(message),defaultValue:String(defaultValue)});
  Object.defineProperties(window,{
    alert:{value:function(message){dialog('alert',message);},writable:true,configurable:true},
    confirm:{value:function(message){return dialog('confirm',message)===true;},writable:true,configurable:true},
    prompt:{value:function(message,defaultValue=''){const result=dialog('prompt',message,defaultValue);return typeof result==='string'?result:null;},writable:true,configurable:true}
  });
},args:[request=>ipcRenderer.sendSync('game:dialog',request)]});

// Capture Ctrl+wheel before game/canvas scrolling handlers. Keep the bridge
// private to the sandboxed preload; the remote page receives no Node or IPC API.
window.addEventListener('wheel',event=>{
  if(!event.isTrusted||!event.ctrlKey||event.altKey||event.metaKey||!event.deltaY)return;
  event.preventDefault();event.stopImmediatePropagation();
  ipcRenderer.send('game:zoom',event.deltaY<0?'in':'out');
},{capture:true,passive:false});
window.addEventListener('keydown',event=>{
  if(!event.isTrusted||!event.ctrlKey||event.altKey||event.metaKey)return;
  let action;
  if(['+','=','Add'].includes(event.key)||event.code==='NumpadAdd')action='in';
  else if(['-','Subtract'].includes(event.key)||event.code==='NumpadSubtract')action='out';
  else if(event.key==='0'||event.code==='Digit0'||event.code==='Numpad0')action='reset';
  if(action){event.preventDefault();event.stopImmediatePropagation();ipcRenderer.send('game:zoom',action);}
},{capture:true});
