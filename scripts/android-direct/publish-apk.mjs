import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {resolve,join,dirname,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..'),output=process.argv[2],publish=process.argv.includes('--publish');
if(!output||!isAbsolute(output))throw Error('Supply an absolute verified delivery folder; add --publish to publish the Android channel.');
const json=async file=>JSON.parse(await readFile(file,'utf8')),digest=data=>createHash('sha256').update(data).digest('hex');
const config=await json(join(root,'packaging/android-direct/distribution.json')),record=await json(join(output,'release.json')),feed=await json(join(output,'android-update.json'));
const apk=await readFile(join(output,config.filename));
if(record.sha256!==digest(apk)||record.bytes!==apk.length||record.versionCode!==config.appVersionCode||record.version!==config.appVersion||record.gameSource!==config.runtime||!record.checks.apkSignature||record.checks.lintErrors!==0)throw Error('Build verification does not match the APK.');
if(feed.packageId!==config.packageId||feed.sha256!==record.sha256||feed.bytes!==apk.length||feed.versionCode!==config.appVersionCode||feed.signerSha256!==config.certificateSha256)throw Error('Update feed does not match verified APK.');
for(const [file,expected] of Object.entries(record.checks.nativeSources))if(digest(await readFile(join(root,'packaging/android-direct',file)))!==expected)throw Error('Rebuild the APK from current native sources: '+file);
const names=[config.filename,'SHA256SUMS.txt','android-update.json'],artifacts=[];
for(const name of names){const bytes=await readFile(join(output,name));artifacts.push({name,bytes:bytes.length,sha256:digest(bytes)});}
console.log(JSON.stringify({validated:true,version:config.appVersion,artifacts}));if(!publish)process.exit(0);
const git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['pipe','pipe','pipe'],windowsHide:true}).trim();
if(git(['status','--porcelain']))throw Error('Commit scoped changes before publishing.');
const commit=git(['rev-parse','HEAD']);git(['merge-base','--is-ancestor',commit,'origin/main']);
let token=process.env.GH_TOKEN||process.env.GITHUB_TOKEN;
if(!token){const value=execFileSync('git',['credential','fill'],{cwd:root,input:'protocol=https\nhost=github.com\n\n',encoding:'utf8',stdio:['pipe','pipe','ignore'],windowsHide:true,env:{...process.env,GIT_TERMINAL_PROMPT:'0'}});token=value.split('\n').find(l=>l.startsWith('password='))?.slice(9).trim();}
if(!token)throw Error('Release credentials unavailable.');
const repository='GoGosing1111/cnine-card';
async function api(route,{method='GET',body,upload=false}={}){
 const response=await fetch(`https://${upload?'uploads':'api'}.github.com/repos/${repository}/${route}`,{method,headers:{Authorization:'Bearer '+token,'User-Agent':'reverse-call-android-release','X-GitHub-Api-Version':'2022-11-28','Content-Type':upload?'application/octet-stream':'application/json'},body:body===undefined?undefined:upload?body:JSON.stringify(body),signal:AbortSignal.timeout(60000)});
 if(response.status===404&&method==='GET')return null;if(!response.ok)throw Error(`GitHub ${method} ${route.split('?')[0]} failed (${response.status})`);return response.json();
}
if((await api('commits/'+commit))?.sha!==commit)throw Error('Push the source commit first.');
const windowsBefore=await api('releases/latest'),tag='android-v'+config.appVersion;
let release=await api('releases/tags/'+tag);
if(release&&(release.target_commitish!==commit||!release.prerelease))throw Error('Existing Android tag belongs to another build; never overwrite published versions.');
if(!release)release=await api('releases',{method:'POST',body:{tag_name:tag,target_commitish:commit,name:`리버스콜 Android ${config.appVersion}`,draft:true,prerelease:true,make_latest:'false',body:`리버스콜 Android 전용 클라이언트 ${config.appVersion}\n\n앱 전용 리소스 저장·SHA-256 검증·변경 파일 다운로드와 APK 자동 확인·다운로드를 제공합니다. 설치는 Android 확인 화면에서 진행합니다. 이전 1.0.1 이용자는 이번 APK를 한 번 직접 설치해야 합니다.\n\n빌드·서명·저장소 회귀 및 실제 운영 리소스 검사를 완료했습니다. Android 실기기 설치·전투·OS 복귀·업데이트 설치 검수는 별도로 필요합니다. 이 릴리스는 Windows 자동 업데이트 채널과 분리됩니다.`}});
for(const artifact of artifacts){const existing=release.assets.find(a=>a.name===artifact.name);if(existing){if(existing.size!==artifact.bytes||existing.digest!=='sha256:'+artifact.sha256)throw Error('Existing artifact differs: '+artifact.name);continue;}if(!release.draft)throw Error('Published artifacts are immutable.');const asset=await api(`releases/${release.id}/assets?name=${encodeURIComponent(artifact.name)}`,{method:'POST',upload:true,body:await readFile(join(output,artifact.name))});if(asset.size!==artifact.bytes||asset.digest!=='sha256:'+artifact.sha256)throw Error('Uploaded artifact verification failed.');console.log('Verified '+artifact.name);}
if(release.draft)release=await api('releases/'+release.id,{method:'PATCH',body:{draft:false,prerelease:true,make_latest:'false'}});
const windowsAfter=await api('releases/latest');if(windowsBefore?.id!==windowsAfter?.id)throw Error('Latest Windows release changed; inspect before advancing the Android feed.');
const response=await fetch(feed.url,{signal:AbortSignal.timeout(30000)});if(!response.ok||digest(Buffer.from(await response.arrayBuffer()))!==record.sha256)throw Error('Public APK verification failed; update feed has not been advanced.');
// Publish the immutable binary first; only then prepare the separately committed pointer.
await writeFile(join(root,'packaging/android-direct/latest.json'),JSON.stringify(feed,null,2)+'\n');
const receipt={publishedAt:new Date().toISOString(),commit,version:config.appVersion,tag,url:release.html_url,downloadUrl:feed.url,sha256:record.sha256,windowsLatestUnchanged:windowsAfter?.tag_name,feed:'COMMIT_AND_PUSH_PREPARED_LATEST_JSON',artifacts};
await writeFile(join(output,'publish-receipt.json'),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
