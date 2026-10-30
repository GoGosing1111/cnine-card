import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {GAME_ORIGIN,MANIFEST_PATH,MAX_MANIFEST_BYTES,validateManifest,manifestEntry} from '../../windows-client/lib/policy.mjs';
import {blockedRequest,excludedAsset} from '../web/policy.mjs';
export {blockedRequest};

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function localPath(value){
  try{const url=new URL(value);if(url.origin!==GAME_ORIGIN)return null;const file=decodeURIComponent(url.pathname);return file==='/'||file==='/index'?'/index.html':file;}catch{return null;}
}
async function boundedJson(response){
  if(Number(response.headers.get('content-length'))>MAX_MANIFEST_BYTES)throw Error('Store manifest is too large');
  const chunks=[];let length=0;
  for await(const chunk of response.body){length+=chunk.length;if(length>MAX_MANIFEST_BYTES)throw Error('Store manifest is too large');chunks.push(chunk);}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

/** Permanent ONE store distribution; wraps public downloads, never account APIs. */
export async function createStoreDistribution({bundleRoot,fetcher=fetch}){
  const raw=await readFile(path.join(bundleRoot,'manifest.json'));
  const input=JSON.parse(raw);
  if(input.schema!==1||input.channel!=='onestore')throw Error('Invalid ONE store bundle');
  const fingerprint=hash(raw);
  const bundle=validateManifest({schema:1,origin:GAME_ORIGIN,releaseId:fingerprint,files:input.files});
  const overrides=new Map(bundle.files.map(file=>[file.path,file]));
  if(!overrides.has('/js/store-distribution-v1.js'))throw Error('Missing permanent store policy');
  const loaded=new Map();
  async function bundled(file){
    if(!loaded.has(file.path)){
      const bytes=await readFile(path.join(bundleRoot,file.path.slice(1)));
      if(bytes.length!==file.bytes||hash(bytes)!==file.sha256)throw Error('Bundled store file verification failed: '+file.path);
      loaded.set(file.path,bytes);
    }
    return loaded.get(file.path);
  }
  function mergeManifest(input){
    const original=validateManifest(input);
    const files=original.files.filter(file=>!overrides.has(file.path)&&!excludedAsset(file.path)&&!blockedRequest(GAME_ORIGIN+file.path)).concat(bundle.files);
    return validateManifest({...original,releaseId:hash(original.releaseId+fingerprint),files});
  }
  return Object.freeze({
    mergeManifest,
    entry(manifest,url,method='GET'){
      if(!['GET','HEAD'].includes(method)||blockedRequest(url))return null;
      const file=overrides.get(localPath(url));
      return file?manifest.files.find(row=>row.path===file.path&&row.sha256===file.sha256)||null:manifestEntry(manifest,url,method);
    },
    async fetch(url,options={}){
      if(blockedRequest(url))return new Response('{"code":"STORE_CONTENT_UNAVAILABLE"}',{status:403,headers:{'content-type':'application/json','cache-control':'no-store'}});
      const resource=overrides.get(localPath(url));
      if(resource&&['GET','HEAD'].includes(options.method||'GET')){
        const bytes=await bundled(resource);
        return new Response(options.method==='HEAD'?null:bytes,{headers:{'content-type':resource.type,'content-length':String(bytes.length),'cache-control':'no-store'}});
      }
      const response=await fetcher(url,options);
      const target=new URL(url);
      if(!response.ok||target.origin!==GAME_ORIGIN||target.pathname!==MANIFEST_PATH)return response;
      return new Response(JSON.stringify(mergeManifest(await boundedJson(response))),{headers:{'content-type':'application/json','cache-control':'no-store'}});
    }
  });
}
