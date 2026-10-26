import {isStoreEntry} from './_onestore_web.js';
export function onRequest(context){
  if(!isStoreEntry(context.request))return context.next();
  const url=new URL(context.request.url);url.pathname='/onestore/';
  return new Response(null,{status:302,headers:{location:url.href,'cache-control':'no-store',vary:'Referer'}});
}
