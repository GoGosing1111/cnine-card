import {jointAccountRequest} from '../../js/joint-account-transport.mjs';
export function createMadaraScope(root){
  const nativeWindow=globalThis.window,nativeDocument=nativeWindow.document,surface=root.querySelector('#madara-live-app')||root,globals={},events=[],timers=new Set(),frames=new Set(),controllers=new Set();let stopped=false,roomId='';
  const listen=(target,type,fn,options)=>{target.addEventListener(type,fn,options);events.push([target,type,fn,options]);};
  const document=new Proxy(nativeDocument,{get(target,key){
    if(key==='getElementById')return name=>surface.querySelector('[data-madara-id="'+CSS.escape(name)+'"]');
    if(key==='querySelector'||key==='querySelectorAll')return surface[key].bind(surface);
    if(key==='addEventListener')return (type,fn,options)=>listen(target,type,fn,options);
    const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
  }});
  const window=new Proxy(nativeWindow,{get(target,key){if(key==='document')return document;if(key in globals)return globals[key];if(key==='addEventListener')return(type,fn,options)=>listen(target,type,fn,options);const value=Reflect.get(target,key,target);return ['scrollTo','scrollBy','matchMedia'].includes(key)?value.bind(target):value;},set(target,key,value){globals[key]=value;return true;}});
  const setTimeout=(fn,ms)=>{if(stopped)return 0;const timer=nativeWindow.setTimeout(()=>{timers.delete(timer);if(!stopped)fn();},ms);timers.add(timer);return timer;};
  const clearTimeout=timer=>{timers.delete(timer);nativeWindow.clearTimeout(timer);};
  const requestAnimationFrame=fn=>{if(stopped)return 0;const frame=nativeWindow.requestAnimationFrame(t=>{frames.delete(frame);if(!stopped)fn(t);});frames.add(frame);return frame;};
  async function fetch(input,options={}){
    if(stopped)throw new DOMException('레이드 화면이 닫혔습니다.','AbortError');
    const url=new URL(input,location.origin);
    if(!url.pathname.startsWith('/__madara/'))return nativeWindow.fetch(input,options);
    const route=url.pathname.split('/').at(-1),query=new URLSearchParams({since:url.searchParams.get('since')||'0'});
    if(url.searchParams.has('payload'))query.set('payload','1');
    const body=options.body?JSON.parse(options.body):null;let path=route,data;
    if(route==='session')path='lobby';
    else if(route==='state'){if(roomId)query.set('roomId',roomId);}
    else if(body){
      data={requestId:body.requestId||crypto.randomUUID()};
      if(route!=='create')data.roomId=route==='join'?String(body.code||'').trim().toUpperCase():roomId;
      if(['create','join'].includes(route))data.role=body.role;
      if(['create','join','ready','start'].includes(route))data.clientRulesVersion=2;
      if(route==='ready')data.ready=body.ready;
      if(route==='kick')data.targetId=body.targetId;
      if(route==='action')for(const key of ['actorId','action','taskId','token','target'])if(body[key]!==undefined)data[key]=body[key];
    }
    const controller=new AbortController();controllers.add(controller);
    try{
      const value=await jointAccountRequest('raid/madara/'+path+'?'+query,{method:data?'POST':'GET',body:data,signal:controller.signal,timeoutMs:20000});
      if(stopped)throw new DOMException('레이드 화면이 닫혔습니다.','AbortError');
      if(value.roomId)roomId=value.roomId;
      else if(value.account?.roomId)roomId=value.account.roomId;
      if(route==='leave')roomId='';
      if(route==='session')value.token='live-'+value.account.id;
      if(value.state?.status==='CANCELLED')value.state.status='FAILED';
      return Response.json(value);
    }catch(error){if(error.status){const code=error.code==='MADARA_KICKED'?'KICKED':error.code;return Response.json({error:error.message,code,retryable:error.retryable},{status:error.status});}throw error;}
    finally{controllers.delete(controller);}
  }
  return {window,document,fetch,setTimeout,clearTimeout,requestAnimationFrame,destroy(){stopped=true;for(const c of controllers)c.abort();for(const t of timers)nativeWindow.clearTimeout(t);for(const f of frames)nativeWindow.cancelAnimationFrame(f);for(const [target,type,fn,options]of events)target.removeEventListener(type,fn,options);globals.MadaraBattle?.teardown();root.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close());}};
}
