import './bootstrap.mjs';
import {storeDocumentUrl,canonicalDocument} from '../../../shared/onestore-web-v1.mjs';

// Unlike a browser-wide cookie or shared storage flag, this policy belongs to
// this document. The ordinary website and installed direct clients keep theirs.
const state={status:'loading',sdk:null,paused:false,silent:false,media:new Set(),audioContexts:new Set()};
Object.defineProperty(window,'CNineStoreWeb',{value:Object.freeze({state,storeDocumentUrl}),writable:false});
function external(url){
  if(!/^https?:$/.test(url.protocol))return;
  if(state.sdk&&state.status==='ready')Promise.resolve(state.sdk.openDeeplink(url.href)).catch(()=>{});
  else if(state.status==='browser')window.open(url.href,'_blank','noopener,noreferrer');
}
function route(value){
  const url=new URL(value,location.href),next=storeDocumentUrl(url.href,location.href);
  if(next){location.assign(next);return;}
  if(url.origin!==location.origin)external(url);
}
document.addEventListener('click',event=>{
  const anchor=event.composedPath().find(node=>node?.matches?.('a[href]'));
  if(!anchor||anchor.hasAttribute('download')||anchor.getAttribute('href')?.startsWith('#'))return;
  const url=new URL(anchor.href,location.href);
  event.preventDefault();event.stopImmediatePropagation();route(url.href);
},true);
// Also catches location.assign/href in standalone game modules. Unregistered
// document destinations cannot escape into an unrestricted account screen.
window.navigation?.addEventListener('navigate',event=>{
  if(event.hashChange||!event.cancelable)return;
  const url=new URL(event.destination.url);
  if(url.origin===location.origin&&url.pathname.startsWith('/onestore/')&&canonicalDocument(url.pathname))return;
  event.preventDefault();route(url.href);
});
// No install prompt or root-scoped service worker in this iframe distribution.
window.addEventListener('beforeinstallprompt',event=>event.preventDefault());
// Track detached Audio() objects too; lobby and battle sounds need not be DOM nodes.
const play=HTMLMediaElement.prototype.play;
HTMLMediaElement.prototype.play=function(){
  if(!state.media.has(this)){state.media.add(this);this.addEventListener('ended',()=>state.media.delete(this),{once:true});}
  if(state.paused||state.silent)return Promise.resolve();
  return play.apply(this,arguments);
};
for(const name of ['AudioContext','webkitAudioContext']){
  const Native=window[name];if(!Native)continue;
  window[name]=new Proxy(Native,{construct(Target,args){const context=new Target(...args);state.audioContexts.add(context);if(state.paused||state.silent)void context.suspend();return context;}});
}
