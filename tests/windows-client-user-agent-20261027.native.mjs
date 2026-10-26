import {createServer as httpServer} from 'node:http';
import {createServer as httpsServer} from 'node:https';
import {mkdir,mkdtemp,readFile,writeFile,access} from 'node:fs/promises';
import {createHash,X509Certificate} from 'node:crypto';
import {spawn,spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const [build,output]=process.argv.slice(2);
if(!build||!output)throw Error('Supply the external Windows build and QA output directories');
await mkdir(output,{recursive:true});
const root=await mkdtemp(path.join(path.resolve(output),'native-'));
const config=JSON.parse(await readFile(path.join(build,'package.json'),'utf8'));
const origin='https://cnine-card.pages.dev',requests=[];
const digest=value=>createHash('sha256').update(value).digest('hex');
const body=Buffer.from('<!doctype html><meta charset="utf-8"><title>Isolated game</title><body>Game</body>');
const files=[{path:'/index.html',sha256:digest(body),bytes:body.length,essential:true}];
const manifest={schema:1,origin,minimumClientVersion:'0.1.0',releaseId:digest(JSON.stringify(files)),files};
const certPath=path.join(root,'fixture.crt'),keyPath=path.join(root,'fixture.key');
const generated=spawnSync(process.env.OPENSSL_PATH||'C:/Program Files/Git/usr/bin/openssl.exe',[
  'req','-x509','-newkey','rsa:2048','-nodes','-keyout',keyPath,'-out',certPath,'-days','1','-subj','/CN=www.playdk.kr',
  '-addext','subjectAltName=DNS:www.playdk.kr,DNS:playdk.kr'
],{windowsHide:true,encoding:'utf8'});
assert.equal(generated.status,0,generated.stderr);
const cert=await readFile(certPath);
const spki=createHash('sha256').update(new X509Certificate(cert).publicKey.export({type:'spki',format:'der'})).digest('base64');
async function handler(req,res){
  const parts=[];for await(const part of req)parts.push(part);
  const record={host:req.headers.host,path:req.url,method:req.method,userAgent:req.headers['user-agent'],origin:req.headers.origin,authorization:req.headers.authorization,cookie:req.headers.cookie,body:Buffer.concat(parts).toString()};
  requests.push(record);
  console.log('Native header fixture: '+record.method+' '+record.host+record.path);
  // Simulate the DK operator's ASCII header validation at the wire boundary.
  if(!/^[\x20-\x7e]+$/.test(record.userAgent||'')){res.writeHead(400);return res.end('Invalid User-Agent');}
  if(req.headers.origin===origin){
    res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Access-Control-Allow-Credentials','true');
    res.setHeader('Access-Control-Allow-Headers','authorization,content-type');res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');
  }
  if(req.method==='OPTIONS'){res.writeHead(204);return res.end();}
  if(req.url==='/client/windows/manifest.json'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(manifest));}
  if(req.url.startsWith('/index.html'))return res.end(body);
  if(req.url==='/redirect'){res.writeHead(302,{Location:'https://playdk.kr/landing'});return res.end();}
  if(req.url==='/landing'||req.url==='/frame'){
    res.setHeader('Content-Type','text/html; charset=utf-8');
    return res.end('<!doctype html><meta charset="utf-8"><title>Isolated DK</title><body>DK'+(req.url==='/landing'?'<iframe src="https://www.playdk.kr/frame"></iframe>':'')+'</body>');
  }
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify(record));
}
const resources=httpServer(handler),dk=httpsServer({cert,key:await readFile(keyPath)},handler);
await Promise.all([new Promise(r=>resources.listen(0,'127.0.0.1',r)),new Promise(r=>dk.listen(0,'127.0.0.1',r))]);
const reportFile=path.join(root,'report.json');
const exceptionFile=path.join(root,'uncaught-error.txt');
await writeFile(path.join(root,'package.json'),JSON.stringify({name:config.name,productName:config.productName,version:config.version,main:'main.mjs',type:'module'}));
await writeFile(path.join(root,'main.mjs'),`
import {app,BrowserWindow,session} from 'electron';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {writeFileSync} from 'node:fs';
// Fail QA without Electron displaying an error dialog on the user's desktop.
process.on('uncaughtException',error=>{writeFileSync(${JSON.stringify(exceptionFile)},String(error.stack||error));app.exit(1);});
const legacyUserAgent=app.userAgentFallback;
async function waitFor(fn){for(let i=0;i<300;i++){const v=await fn();if(v)return v;await new Promise(r=>setTimeout(r,100));}throw Error('Native fixture timed out');}
void(async()=>{
try{
  await import(${JSON.stringify(pathToFileURL(path.join(build,'main.mjs')).href)});
  await app.whenReady();
  const launcher=await waitFor(()=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/renderer/index.html')));
  await waitFor(()=>launcher.webContents.executeJavaScript('window.soopLauncher?.getState().then(s=>s.phase==="available")'));
  await launcher.webContents.executeJavaScript('window.soopLauncher.command("install")');
  await launcher.webContents.executeJavaScript('window.soopLauncher.command("play")');
  const game=await waitFor(()=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().startsWith(${JSON.stringify(origin)})));
  const expected=app.userAgentFallback;
  assert.match(expected,/^[\\x20-\\x7e]+$/);assert(expected.includes(' Reversecall/'+app.getVersion()+' '));
  assert.equal(app.getName(),'리버스콜');assert.equal(session.defaultSession.getUserAgent(),expected);
  assert.equal(game.webContents.getUserAgent(),expected);assert.equal(game.webContents.session.getUserAgent(),expected);
  assert.equal(await game.webContents.executeJavaScript('navigator.userAgent'),expected);
  const gameEcho=await game.webContents.executeJavaScript('(async()=>{document.cookie="qa=preserved; Secure; SameSite=Lax";const r=await fetch("/api/echo",{method:"POST",headers:{authorization:"Bearer isolated-qa","content-type":"application/json"},body:JSON.stringify({isolated:true})});return {status:r.status,body:await r.json()};})()');
  assert.equal(gameEcho.status,200);assert.equal(gameEcho.body.userAgent,expected);assert.equal(gameEcho.body.origin,${JSON.stringify(origin)});
  assert.equal(gameEcho.body.authorization,'Bearer isolated-qa');assert.equal(gameEcho.body.body,'{"isolated":true}');
  assert.match(await game.webContents.executeJavaScript('document.cookie'),/qa=preserved/);
  await game.webContents.executeJavaScript('window.open("https://www.playdk.kr/redirect","dk-qa");void 0');
  const popup=await waitFor(()=>BrowserWindow.getAllWindows().find(w=>['https://www.playdk.kr/','https://playdk.kr/'].some(prefix=>w.webContents.getURL().startsWith(prefix))));
  await waitFor(()=>popup.webContents.executeJavaScript('document.title==="Isolated DK" && document.readyState==="complete"'));
  assert.equal(popup.webContents.getUserAgent(),expected);assert.equal(await popup.webContents.executeJavaScript('navigator.userAgent'),expected);
  const popupEcho=await popup.webContents.executeJavaScript('(async()=>{document.cookie="dkqa=preserved; Secure; SameSite=Lax";const r=await fetch("/echo",{method:"POST",headers:{authorization:"Bearer isolated-dk"},body:"dk-body"});return {status:r.status,body:await r.json()};})()');
  assert.equal(popupEcho.status,200);assert.equal(popupEcho.body.userAgent,expected);assert.match(popupEcho.body.cookie,/dkqa=preserved/);
  assert.equal(popupEcho.body.authorization,'Bearer isolated-dk');assert.equal(popupEcho.body.body,'dk-body');
  const fresh=session.fromPartition('qa-fresh-session');
  const freshResponse=await fresh.fetch('https://www.playdk.kr/fresh');assert.equal(freshResponse.status,200);
  assert.equal((await freshResponse.json()).userAgent,expected);
  const old=session.fromPartition('qa-legacy-session');old.setUserAgent(legacyUserAgent);
  let before;try{const response=await old.fetch('https://www.playdk.kr/before');before={status:response.status};}catch(error){before={error:error.message};}
  assert(before.error||before.status===400,'localized legacy user agent must fail the ASCII boundary');
  assert.equal(launcher.isVisible(),false);assert.equal(popup.isVisible(),false);
  popup.close();game.close();
  await waitFor(()=>launcher.webContents.executeJavaScript('window.soopLauncher.getState().then(s=>s.ready)'));
  assert.equal(launcher.isDestroyed(),false);assert.equal(launcher.isVisible(),false);
  await launcher.webContents.executeJavaScript('window.soopLauncher.command("play")');
  const reopened=await waitFor(()=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().startsWith(${JSON.stringify(origin)})));
  // Reproduce the reported destruction order without touching the installed app.
  launcher.destroy();reopened.destroy();
  const result={passed:true,appName:app.getName(),version:app.getVersion(),legacyUserAgent,userAgent:expected,before,gameEcho,popupEcho,defaultSession:true,newSession:true,popup:true,redirect:true,iframe:true,normalCloseAndReopen:true,destroyedLauncherGuard:true,productionRequests:0};
  await writeFile(${JSON.stringify(reportFile)},JSON.stringify(result,null,2)+'\\n');app.exit(0);
}catch(error){console.error(error);app.exit(1);}
})();
`);
try{
  const code=await new Promise((resolve,reject)=>{
    const child=spawn(path.join(build,'node_modules/electron/dist/electron.exe'),[root,
      `--host-resolver-rules=MAP www.playdk.kr 127.0.0.1:${dk.address().port},MAP playdk.kr 127.0.0.1:${dk.address().port}`,
      '--no-proxy-server',`--ignore-certificate-errors-spki-list=${spki}`
    ],{windowsHide:true,stdio:'inherit',env:{...process.env,SOOPKETMON_QA:'1',SOOPKETMON_QA_ROOT:path.join(root,'profile'),SOOPKETMON_QA_SERVER:`http://127.0.0.1:${resources.address().port}`}});
    const timeout=setTimeout(()=>{child.kill();reject(Error('Native User-Agent QA timed out'));},90000);
    child.once('error',error=>{clearTimeout(timeout);reject(error);});child.once('exit',exitCode=>{clearTimeout(timeout);resolve(exitCode);});
  });
  assert.equal(code,0);
  assert.equal(await access(exceptionFile).then(()=>true,()=>false),false,'native shutdown must not raise an uncaught exception');
  const report=JSON.parse(await readFile(reportFile,'utf8'));
  for(const expected of ['/redirect','/landing','/frame','/echo','/fresh'])assert(requests.some(r=>r.path===expected&&r.userAgent===report.userAgent),expected);
  assert(requests.every(r=>r.path==='/before'||/^[\x20-\x7e]+$/.test(r.userAgent||'')));
  await writeFile(path.join(output,'native-report.json'),JSON.stringify({...report,requests},null,2)+'\n');
  console.log(JSON.stringify({passed:true,before:report.before,userAgent:report.userAgent,requests:requests.length,productionRequests:0}));
}finally{
  for(const server of [resources,dk])server.closeAllConnections();
  await Promise.all([new Promise(r=>resources.close(r)),new Promise(r=>dk.close(r))]);
}
