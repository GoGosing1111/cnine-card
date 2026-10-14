import {createHash,randomUUID} from 'node:crypto';
import {createReadStream,createWriteStream} from 'node:fs';
import {mkdir,readFile,writeFile,rename,rm,stat,readdir,statfs,utimes} from 'node:fs/promises';
import path from 'node:path';
import {Readable,Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {GAME_ORIGIN,MANIFEST_PATH,MAX_MANIFEST_BYTES,CACHE_BUDGET,validateManifest,CLIENT_VERSION,versionLess} from './policy.mjs';

export async function sha256File(file) {
  const hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);return hash.digest('hex');
}
async function atomicJson(file,value) {
  await mkdir(path.dirname(file),{recursive:true});const temp=file+'.'+randomUUID()+'.tmp';
  try{await writeFile(temp,JSON.stringify(value));await rename(temp,file);}finally{await rm(temp,{force:true}).catch(()=>{});}
}
export class ResourceStore {
  constructor({root,fetcher=fetch,budget=CACHE_BUDGET}) {
    this.root=path.resolve(root);this.objects=path.join(this.root,'objects');this.fetcher=fetcher;this.budget=budget;
    this.inflight=new Map();this.verified=new Map();this.hits=0;this.downloads=0;
  }
  objectPath(hash) {if(!/^[a-f0-9]{64}$/.test(hash))throw new Error('Invalid content hash');return path.join(this.objects,hash);}
  async initialize(){await mkdir(this.objects,{recursive:true});}
  async readActive(){try{return validateManifest(JSON.parse(await readFile(path.join(this.root,'active.json'),'utf8')));}catch{return null;}}
  async checkForUpdate(signal) {
    const response=await this.fetcher(GAME_ORIGIN+MANIFEST_PATH,{cache:'no-store',credentials:'omit',redirect:'error',signal});
    if(!response.ok)throw new Error('업데이트 정보를 받지 못했습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.');
    if(Number(response.headers.get('content-length'))>MAX_MANIFEST_BYTES)throw new Error('업데이트 정보 크기가 올바르지 않습니다.');
    const chunks=[];let size=0;
    for await(const chunk of response.body){size+=chunk.length;if(size>MAX_MANIFEST_BYTES)throw new Error('업데이트 정보 크기가 올바르지 않습니다.');chunks.push(chunk);}
    const manifest=validateManifest(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    if(versionLess(CLIENT_VERSION,manifest.minimumClientVersion))throw new Error('새 버전의 런처가 필요합니다. 공식 배포 안내에서 최신 설치 파일을 받아 주세요.');
    return manifest;
  }
  async has(entry,{verify=true}={}) {
    const file=this.objectPath(entry.sha256);let info;try{info=await stat(file);}catch{return false;}
    if(!info.isFile()||info.size!==entry.bytes)return false;
    if(!verify)return true;
    const key=info.size+':'+info.mtimeMs;
    if(this.verified.get(entry.sha256)===key)return true;
    if(await sha256File(file)!==entry.sha256)return false;
    this.verified.set(entry.sha256,key);return true;
  }
  async ensure(entry,releaseId,{signal,onBytes=()=>{}}={}) {
    if(this.inflight.has(entry.sha256))return this.inflight.get(entry.sha256);
    const task=(async()=>{
      if(await this.has(entry)){this.hits++;return this.objectPath(entry.sha256);}
      const file=this.objectPath(entry.sha256),temp=file+'.'+randomUUID()+'.part';
      // Pages canonicalizes HTML paths (/index.html -> /, /foo.html -> /foo).
      // Keep redirects on the game origin and still verify the final bytes.
      let url=GAME_ORIGIN+encodeURI(entry.path)+'?desktopRelease='+releaseId,response;
      for(let hop=0;hop<4;hop++){
        response=await this.fetcher(url,{cache:'no-store',credentials:'omit',redirect:'manual',signal});
        if(![301,302,303,307,308].includes(response.status))break;
        const location=response.headers.get('location');await response.body?.cancel();
        const next=location&&new URL(location,url);
        if(!next||next.origin!==GAME_ORIGIN||next.username||next.password||hop===3)throw new Error('게임 파일의 다운로드 주소가 올바르지 않습니다.');
        url=next.href;
      }
      if(!response.ok||!response.body)throw new Error('게임 파일을 받지 못했습니다: '+entry.path);
      const hash=createHash('sha256');let received=0;
      try {
        const inspect=new Transform({transform(chunk,encoding,callback){
          received+=chunk.length;if(received>entry.bytes)return callback(new Error('파일 크기가 변경됐습니다. 업데이트를 다시 확인해 주세요.'));
          hash.update(chunk);onBytes(chunk.length);callback(null,chunk);
        }});
        await pipeline(Readable.fromWeb(response.body),inspect,createWriteStream(temp,{flags:'wx'}),{signal});
        if(received!==entry.bytes||hash.digest('hex')!==entry.sha256)throw new Error('파일 검증에 실패했습니다. 업데이트를 다시 확인해 주세요.');
        // Only content-addressed cache files owned by this app can be replaced.
        await rm(file,{force:true});await rename(temp,file);this.verified.delete(entry.sha256);this.downloads++;
        return file;
      }finally{await rm(temp,{force:true}).catch(()=>{});}
    })().finally(()=>this.inflight.delete(entry.sha256));
    this.inflight.set(entry.sha256,task);return task;
  }
  async plan(manifest) {
    const needed=manifest.files.filter(f=>f.essential),missing=[];
    for(const entry of needed)if(!await this.has(entry,{verify:false}))missing.push(entry);
    return {files:needed.length,bytes:needed.reduce((n,f)=>n+f.bytes,0),missingFiles:missing.length,downloadBytes:missing.reduce((n,f)=>n+f.bytes,0)};
  }
  async prepare(manifest,{repair=false,signal,onProgress=()=>{}}={}) {
    const unique=new Map();for(const f of manifest.files)if(f.essential||(repair&&await this.has(f,{verify:false})))unique.set(f.sha256,f);
    const entries=[...unique.values()],total=entries.reduce((n,f)=>n+f.bytes,0);
    let missingBytes=0;for(const entry of entries)if(!await this.has(entry,{verify:false}))missingBytes+=entry.bytes;
    const disk=await statfs(this.objects);if(Number(disk.bavail)*Number(disk.bsize)<missingBytes+256*1024**2)throw new Error('저장 공간이 부족합니다. PC의 여유 공간을 확보해 주세요.');
    const group=new AbortController(),combined=signal?AbortSignal.any([signal,group.signal]):group.signal;
    let index=0,done=0,bytes=0,transferred=0,last=0,failed;
    const notify=(current,force=false)=>{const now=Date.now();if(force||now-last>100){last=now;onProgress({files:entries.length,done,bytes,total,transferred,current});}};
    notify('',true);
    await Promise.allSettled(Array.from({length:Math.min(6,entries.length)},async()=>{
      try{while(index<entries.length){combined.throwIfAborted();const entry=entries[index++];
        await this.ensure(entry,manifest.releaseId,{signal:combined,onBytes:n=>{transferred+=n;notify(entry.path);}});
        done++;bytes+=entry.bytes;notify(entry.path);
      }}catch(error){if(!failed)failed=error;group.abort();throw error;}
    }));
    if(failed)throw failed;
    signal?.throwIfAborted();await atomicJson(path.join(this.root,'active.json'),manifest);notify('',true);
    return {files:done,bytes,transferred};
  }
  async touch(entry){const file=this.objectPath(entry.sha256);try{const info=await stat(file);if(Date.now()-info.mtimeMs>600000){await utimes(file,new Date(),new Date());this.verified.delete(entry.sha256);}}catch{}}
  async stats(){
    const files=await readdir(this.objects);let bytes=0,count=0;
    for(const name of files)if(/^[a-f0-9]{64}$/.test(name)){try{bytes+=(await stat(this.objectPath(name))).size;count++;}catch{}}
    return {bytes,count,hits:this.hits,downloads:this.downloads};
  }
  async prune(manifest){
    const keep=new Set(manifest.files.filter(f=>f.essential).map(f=>f.sha256)),rows=[];let total=0;
    for(const name of await readdir(this.objects))if(/^[a-f0-9]{64}$/.test(name)){
      const info=await stat(this.objectPath(name));total+=info.size;if(!keep.has(name)&&!this.inflight.has(name))rows.push({name,size:info.size,time:info.mtimeMs});
    }
    for(const row of rows.sort((a,b)=>a.time-b.time)){if(total<=this.budget)break;await rm(this.objectPath(row.name),{force:true});this.verified.delete(row.name);total-=row.size;}
  }
}

export function fileResponse(file,entry,request) {
  const headers={'Content-Type':entry.type,'Content-Length':String(entry.bytes),'Cache-Control':'no-store','Accept-Ranges':'bytes','ETag':'"'+entry.sha256+'"','X-Soopketmon-Resource':'disk'};
  let start=0,end=entry.bytes-1,status=200;const range=request.headers.get('range');
  if(range){
    const m=range.match(/^bytes=(\d*)-(\d*)$/);
    if(!m||(!m[1]&&!m[2]))return new Response(null,{status:416,headers:{'Content-Range':`bytes */${entry.bytes}`}});
    if(!m[1]){const n=Number(m[2]);start=Math.max(0,entry.bytes-n);}else{start=Number(m[1]);if(m[2])end=Math.min(end,Number(m[2]));}
    if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||start>=entry.bytes)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${entry.bytes}`}});
    status=206;headers['Content-Range']=`bytes ${start}-${end}/${entry.bytes}`;headers['Content-Length']=String(end-start+1);
  }
  if(request.method==='HEAD'||entry.bytes===0)return new Response(null,{status,headers});
  return new Response(Readable.toWeb(createReadStream(file,{start,end})),{status,headers});
}
