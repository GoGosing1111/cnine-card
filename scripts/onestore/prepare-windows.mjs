import {readFile,writeFile,mkdir,copyFile,cp,readdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve,join,dirname,relative,sep,isAbsolute} from 'node:path';
import {createWebOverrides} from './web-overrides.mjs';

const repo=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const build=resolve(process.argv[2]||''),rel=relative(repo,build);
if(!process.argv[2]||!(rel==='..'||rel.startsWith('..'+sep)||isAbsolute(rel)))throw Error('Provide the existing external Windows build directory');
const config=JSON.parse(await readFile(join(repo,'packaging/onestore/windows/distribution.json'),'utf8'));
const {overrides,hashes,source,once,hash}=await createWebOverrides(repo);
const staged=spawnSync(process.execPath,[join(repo,'scripts/build-windows-client.mjs'),build,'--stage-only'],{cwd:repo,stdio:'inherit',windowsHide:true});
if(staged.status!==0)throw Error('Windows client staging failed');
const input=async file=>(await readFile(join(build,file),'utf8')).replace(/\r\n/g,'\n');
const put=async(file,value)=>{await mkdir(dirname(join(build,file)),{recursive:true});await writeFile(join(build,file),value);};

let main=await source('packaging/windows-client/main.mjs');
main=once(main,'manifestEntry,allowedNavigation}', 'manifestEntry,allowedNavigation as baseAllowedNavigation}','navigation import');
main=once(main,"import {ClientUpdater} from './lib/client-updater.mjs';", "import {createStoreDistribution,blockedRequest} from './lib/store-distribution.mjs';\nconst allowedNavigation=url=>baseAllowedNavigation(url)&&!blockedRequest(url);",'store policy import');
main=once(main,'app.userAgentFallback=windowsUserAgent(process.versions);','app.userAgentFallback=windowsUserAgent(process.versions)+'+JSON.stringify(' ReverseCallStore/onestore/'+config.appVersion)+';','store User-Agent');
main=once(main,"GAME_ORIGIN+'/?source=windows-client'",'GAME_ORIGIN+'+JSON.stringify(config.startUrl),'start URL');
main=once(main,"store=new ResourceStore({root:path.join(app.getPath('userData'),'resources-v1'),fetcher});await store.initialize();", "const distribution=await createStoreDistribution({bundleRoot:path.join(here,'onestore'),fetcher});\n  store=new ResourceStore({root:path.join(app.getPath('userData'),'resources-v1'),fetcher:distribution.fetch});await store.initialize();",'bundled download transport');
main=once(main,"session.fromPartition('persist:soopketmon-game-v1')",'session.fromPartition('+JSON.stringify(config.sessionPartition)+')','isolated session');
main=once(main,'    const url=new URL(request.url);','    const url=new URL(request.url);\n    if(blockedRequest(request.url))return new Response(JSON.stringify({error:"이 앱에서 제공하지 않는 기능입니다.",code:"STORE_CONTENT_UNAVAILABLE"}),{status:403,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});','native request block');
main=once(main,'gameManifest&&manifestEntry(gameManifest,request.url,request.method)','gameManifest&&distribution.entry(gameManifest,request.url,request.method)','verified local aliases');
main=once(main,"    if(command==='website')return shell.openExternal(GAME_ORIGIN);", "    if(command==='website')return;",'no unrestricted website launch');
main=once(main,"    if(command==='restart-client')return clientUpdater?.install();",'', 'no direct client installation');
const updater=/  if\(app\.isPackaged\)\{\n    const \{default:electronUpdater\}[^]*?\n  \}\n(?=  void check\(\);)/g;
if([...main.matchAll(updater)].length!==1)throw Error('Source changed: Windows automatic updater');
main=main.replace(updater,'');
if(/electron-updater|new ClientUpdater|shell\.openExternal/.test(main))throw Error('Direct release connection remains');
await put('main.mjs',main);
await put('lib/app-identity.mjs',`export const APP_ID=${JSON.stringify(config.appId)};\nexport const LEGACY_PROFILE_DIRECTORY=${JSON.stringify(config.profileDirectory)};\nexport const APP_NAME=${JSON.stringify(config.productName)};\n`);
await put('lib/policy.mjs',(await input('lib/policy.mjs')).replace(/export const CLIENT_VERSION = '[^']+';/,`export const CLIENT_VERSION = '${config.appVersion}';`));
await put('lib/store-policy.mjs',await source('packaging/onestore/web/policy.mjs'));
await put('lib/store-distribution.mjs',(await source('packaging/onestore/windows/distribution.mjs')).replace("'../../windows-client/lib/policy.mjs'","'./policy.mjs'").replace("'../web/policy.mjs'","'./store-policy.mjs'"));

let html=await input('renderer/index.html');
html=once(html,'WINDOWS CLIENT','ONE STORE · WINDOWS','launcher channel');
html=once(html,'REVERSE CALL · PC EDITION','REVERSE CALL · ONE STORE','hero channel');
html=html.replace(/<button class="text-button web-button"[^]*?<\/button>/,'');
if(/data-command="website"/.test(html))throw Error('Unrestricted website button remains');
html=html.replace(/(<b id="clientVersion">)[^<]+/,`$1${config.appVersion}`);
html=once(html,'런처는 재시작으로 갱신합니다.','앱 업데이트는 원스토어에서 제공됩니다.','update help');
html=once(html,'안드로이드 · iOS 추후 지원 예정','원스토어 Windows 전용 배포판','platform help');
await put('renderer/index.html',html);

const pkg=JSON.parse(await input('package.json'));
pkg.name=config.packageName;pkg.productName=config.productName;pkg.version=config.appVersion;
pkg.description='리버스콜 원스토어 전용 Windows 게임 클라이언트';pkg.dependencies={};
pkg.build.appId=config.appId;pkg.build.productName=config.productName;
pkg.build.artifactName='ReverseCall-ONEstore-Windows-Engine-${version}-${arch}.${ext}';
pkg.build.win.executableName=config.executableName;
pkg.build.nsis.shortcutName=config.productName;delete pkg.build.nsis.guid;
delete pkg.build.publish;
pkg.build.files.push('onestore/**','distribution.json');
await put('package.json',JSON.stringify(pkg,null,2)+'\n');
const lock=JSON.parse(await input('package-lock.json'));lock.name=pkg.name;lock.version=pkg.version;lock.packages[''].name=pkg.name;lock.packages[''].version=pkg.version;lock.packages[''].dependencies={};
await put('package-lock.json',JSON.stringify(lock,null,2)+'\n');
await put('distribution.json',JSON.stringify(config,null,2)+'\n');

// Reuse the approved installer art and implementation; only the store label differs.
await cp(join(repo,'packaging/windows-client/installer'),join(build,'installer'),{recursive:true});
await mkdir(join(build,'art'),{recursive:true});
await copyFile(join(repo,'packaging/windows-client/art/installer-gateway-v1-source.png'),join(build,'art/installer-gateway-v1-source.png'));
await put('installer/window.xaml',(await input('installer/window.xaml')).replaceAll('리버스콜 설치','리버스콜 ONE store 설치'));
const files=[];
for(const [path,value] of overrides){await put('onestore'+path,value);files.push({path,sha256:hash(Buffer.from(value)),bytes:Buffer.byteLength(value),essential:true});}
await put('onestore/manifest.json',JSON.stringify({schema:1,channel:config.channel,files},null,2)+'\n');
const stagedHashes={};
async function collect(dir){for(const item of await readdir(join(build,dir),{withFileTypes:true})){const file=dir+'/'+item.name;if(item.isDirectory())await collect(file);else stagedHashes[file]=hash(await readFile(join(build,file)));}}
for(const dir of ['lib','renderer','onestore'])await collect(dir);
for(const file of ['main.mjs','preload.cjs','game-preload.cjs','package.json','distribution.json'])stagedHashes[file]=hash(await readFile(join(build,file)));
await put('onestore-windows-build-inputs.json',JSON.stringify({configuration:config,sourceHashes:hashes,bundledFiles:files,stagedHashes,websiteModified:false,existingClientsModified:false},null,2)+'\n');
console.log(JSON.stringify({build,version:config.appVersion,appId:config.appId,files:files.length,bundledBytes:files.reduce((n,f)=>n+f.bytes,0),updater:'ONE_STORE_ONLY'}));
