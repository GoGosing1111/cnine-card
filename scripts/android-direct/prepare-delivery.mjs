import {readFile,writeFile,copyFile,mkdir,readdir} from 'node:fs/promises';
import {createHash,X509Certificate} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {resolve,join,dirname,relative,isAbsolute,sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const repo=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const [projectArg,outputArg,toolsArg]=process.argv.slice(2);
if(!projectArg||!outputArg||!toolsArg)throw Error('Usage: node prepare-delivery.mjs <external Android project> <external delivery> <Android tools>');
const project=resolve(projectArg),output=resolve(outputArg),tools=resolve(toolsArg);
for(const path of [project,output]){
  const rel=relative(repo,path);
  if(!(rel==='..'||rel.startsWith('..'+sep)||isAbsolute(rel)))throw Error('Keep APKs and build outputs outside the web repository.');
}
const json=async path=>JSON.parse((await readFile(path,'utf8')).replace(/^\uFEFF/,''));
const config=await json(join(repo,'packaging/android-direct/distribution.json'));
const twa=await json(join(project,'twa-manifest.json'));
const normalize=value=>value.replaceAll(':','').toLowerCase();
const sha256=data=>createHash('sha256').update(data).digest('hex');
function run(command,args){
  const result=spawnSync(command,args,{encoding:'utf8',windowsHide:true,maxBuffer:16*1024*1024});
  if(result.error||result.status!==0)throw Error(`${command} failed: ${result.error?.message||result.stderr||result.stdout}`);
  return result.stdout;
}
const sdk=join(tools,'sdk/build-tools/36.0.0');
const jdk=(await readdir(join(tools,'jdk'))).find(name=>name.startsWith('jdk-17'));
if(!jdk)throw Error('JDK 17 is required.');
const java=join(tools,'jdk',jdk,'bin/java.exe');
const apk=join(project,'app/build/outputs/apk/release/app-release.apk');
const signature=run(java,['-jar',join(sdk,'lib/apksigner.jar'),'verify','--verbose','--print-certs',apk]);
const signer=signature.match(/Signer #1 certificate SHA-256 digest: ([a-f\d]+)/i)?.[1];
if(signer!==normalize(config.certificateSha256)||!signature.includes('Number of signers: 1')||!signature.includes('Verified using v2 scheme (APK Signature Scheme v2): true'))throw Error('APK signing verification failed or signing identity changed.');
const certificate=new X509Certificate(await readFile(join(repo,'packaging/play-store/upload-certificate.der')));
if(normalize(certificate.fingerprint256)!==signer)throw Error('Public certificate mismatch.');
run(join(sdk,'zipalign.exe'),['-c','-P','16','4',apk]);
const badging=run(join(sdk,'aapt.exe'),['dump','badging',apk]);
const pkg=badging.match(/package: name='([^']+)' versionCode='([^']+)' versionName='([^']+)'/);
if(!pkg||pkg[1]!==config.packageId||Number(pkg[2])!==config.appVersionCode||pkg[3]!==config.appVersion)throw Error('APK package/version mismatch.');
if(!badging.includes(`application-label:'${config.appName}'`)||!badging.includes("sdkVersion:'24'")||!badging.includes("targetSdkVersion:'36'"))throw Error('APK label or SDK mismatch.');
if(/application-debuggable|native-code:/.test(badging))throw Error('Expected a universal, non-debuggable native client APK.');
const xml=run(join(sdk,'aapt.exe'),['dump','xmltree',apk,'AndroidManifest.xml']);
if(!/usesCleartextTraffic[^\r\n]*0x0/.test(xml)||!/allowBackup[^\r\n]*0x0/.test(xml))throw Error('Release security flags missing.');
if(!xml.includes('REQUEST_INSTALL_PACKAGES')||!xml.includes('GameActivity')||xml.includes('androidbrowserhelper'))throw Error('Native resource client/updater manifest missing, or TWA runtime remains.');
const resources=run(join(sdk,'aapt.exe'),['dump','--values','resources',apk]);
const startUrl=new URL(config.startUrl,`https://${twa.host}`).href;
if(!resources.includes(startUrl)||twa.startUrl!==config.startUrl)throw Error('APK launch URL mismatch.');
const lint=await readFile(join(project,'app/build/reports/lint-results-release.xml'),'utf8');
if(/severity="(?:Error|Fatal)"/.test(lint))throw Error('Android lint contains errors.');

// Verify the public site association and official icon bytes, without modifying the live service.
const associationUrl=`https://${twa.host}/.well-known/assetlinks.json`;
const response=await fetch(associationUrl,{redirect:'error',signal:AbortSignal.timeout(20000)});
if(!response.ok||!response.headers.get('content-type')?.includes('application/json'))throw Error('Live Digital Asset Links unavailable.');
const association=await response.json();
if(!association.some(row=>row.relation?.includes('delegate_permission/common.handle_all_urls')&&row.target?.namespace==='android_app'&&row.target.package_name===config.packageId&&row.target.sha256_cert_fingerprints?.some(fp=>normalize(fp)===signer)))throw Error('Live site does not trust the APK signing certificate.');
const brand=await json(join(repo,'assets/ui/brand/reverse-call-20261016/manifest.json'));
const checkedIcons=[];
for(const url of [twa.iconUrl,twa.maskableIconUrl]){
  const asset=brand.files.find(item=>'/'+item.file===new URL(url).pathname);
  const icon=await fetch(url,{signal:AbortSignal.timeout(20000)});
  if(!asset||!icon.ok||sha256(Buffer.from(await icon.arrayBuffer()))!==asset.sha256)throw Error('Live launcher icon differs from the approved brand.');
  checkedIcons.push({url,sha256:asset.sha256});
}
const bytes=await readFile(apk),hash=sha256(bytes);
const sourceHashes=await json(join(project,'native-source-hashes.json'));
for(const [file,expected] of Object.entries(sourceHashes))if(sha256(await readFile(join(repo,'packaging/android-direct',file)))!==expected)throw Error('APK native sources differ from the current source tree.');
const review=join(output,'review');
await mkdir(review,{recursive:true});
await copyFile(apk,join(output,config.filename));
await writeFile(join(output,'SHA256SUMS.txt'),`${hash}  ${config.filename}\n`);
await writeFile(join(review,'apk-signature.txt'),signature);
await writeFile(join(review,'apk-badging.txt'),badging);
await copyFile(join(project,'app/build/reports/lint-results-release.xml'),join(review,'lint-results-release.xml'));
await copyFile(join(repo,'packaging/play-store/upload-certificate.der'),join(review,'public-certificate.der'));
const updateFeed={schema:1,packageId:config.packageId,version:config.appVersion,versionCode:config.appVersionCode,url:`https://github.com/GoGosing1111/cnine-card/releases/download/android-v${config.appVersion}/${config.filename}`,bytes:bytes.length,sha256:hash,signerSha256:certificate.fingerprint256};
await writeFile(join(output,'android-update.json'),JSON.stringify(updateFeed,null,2)+'\n');
const record={createdAt:new Date().toISOString(),channel:config.channel,publication:config.publication,boardUrl:config.boardUrl,file:config.filename,bytes:bytes.length,sha256:hash,appName:config.appName,packageId:config.packageId,version:config.appVersion,versionCode:config.appVersionCode,minSdk:24,targetSdk:36,universal:true,debuggable:false,startUrl,signerSha256:certificate.fingerprint256,checks:{apkSignature:true,zipAlignment:true,compiledManifest:true,nativeSources:sourceHashes,lintErrors:0,lintWarnings:(lint.match(/severity="Warning"/g)||[]).length,liveDigitalAssetLinks:true,approvedLiveIcons:checkedIcons},deviceTesting:'PENDING_PHYSICAL_ANDROID_DEVICE',gameSource:config.runtime,updates:config.updates,updateFeed:config.updateFeed,resourceManifest:config.resourceManifest,resourceCacheBudgetBytes:config.resourceCacheBudgetBytes};
await writeFile(join(output,'release.json'),JSON.stringify(record,null,2)+'\n');
const values={VERSION:config.appVersion,FILENAME:config.filename,BOARD:config.boardUrl,DOWNLOAD_URL:updateFeed.url,SIZE:(bytes.length/1024/1024).toFixed(2),HASH:hash};
for(const [template,filename] of [['installation.ko.txt','설치안내.txt'],['dk-post.ko.txt','DK-게시글-본문.txt'],['operator.ko.txt','운영자-업로드안내.txt']]){
  const value=await readFile(join(repo,'packaging/android-direct',template),'utf8');
  await writeFile(join(output,filename),value.replace(/\{\{([A-Z_]+)\}\}/g,(_,key)=>values[key]??(()=>{throw Error('Unknown guide field '+key)})()));
}
console.log(JSON.stringify({output,file:config.filename,bytes:bytes.length,sha256:hash,version:config.appVersion,checks:record.checks,deviceTesting:record.deviceTesting}));
