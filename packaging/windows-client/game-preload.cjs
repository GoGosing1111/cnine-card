const {ipcRenderer}=require('electron');

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
