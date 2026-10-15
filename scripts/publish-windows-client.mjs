import {readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import path from 'node:path';

const build=process.argv[2],publish=process.argv.includes('--publish');
if(!build||!path.isAbsolute(build))throw Error('Supply the absolute external finished Windows build directory; add --publish to release.');
const repo='GoGosing1111/cnine-card',source=path.resolve('packaging/windows-client'),release=path.join(build,'release');
const config=JSON.parse(await readFile(path.join(source,'package.json'),'utf8')),version=config.version,tag='v'+version;
if(!/^\d+\.\d+\.\d+$/.test(version))throw Error('Only stable launcher versions may be published.');
const require=createRequire(path.join(build,'package.json')),{load}=require('js-yaml'),asar=require('@electron/asar');
const metadata=load(await readFile(path.join(release,'latest.yml'),'utf8'));
const receipt=JSON.parse(await readFile(path.join(build,'installer-build/receipt.json'),'utf8'));
if(config.build.appId!=='kr.yakcode.soopketmon'||receipt.registryGuid!=='c69fcbf2-955f-5c48-8ff1-55c03889cb40'||receipt.installed.exe!=='Soopketmon.exe')throw Error('The existing installation identity must be preserved.');
const engine=`Soopketmon-Engine-${version}-x64.exe`,setup=`Soopketmon-Setup-${version}-x64.exe`;
const bytes=await readFile(path.join(release,engine));
const digest=(data,algorithm='sha256',encoding='hex')=>createHash(algorithm).update(data).digest(encoding);
if(metadata.version!==version||metadata.files.length!==1||metadata.files[0].url!==engine||metadata.files[0].size!==bytes.length||metadata.files[0].sha512!==digest(bytes,'sha512','base64'))throw Error('Update metadata does not match the built NSIS installer.');
if(receipt.qa||receipt.version!==version||receipt.backend.sha256!==digest(bytes)||receipt.sha256!==digest(await readFile(path.join(release,setup))))throw Error('Custom installer receipt does not match this release.');
const packaged=path.join(release,'win-unpacked/resources/app.asar');
if(receipt.installed.asarSha256!==digest(await readFile(packaged)))throw Error('Packaged application does not match installer receipt.');
async function verifyTree(relative){
  for(const entry of await readdir(path.join(source,relative),{withFileTypes:true})){
    const file=path.join(relative,entry.name);if(entry.isDirectory())await verifyTree(file);else verifyFile(file,await readFile(path.join(source,file)));
  }
}
function verifyFile(file,expected){if(!asar.extractFile(packaged,file).equals(expected))throw Error('Packaged source differs: '+file);}
for(const file of ['main.mjs','preload.cjs','game-preload.cjs'])verifyFile(file,await readFile(path.join(source,file)));
for(const directory of ['lib','renderer'])await verifyTree(directory);
const packedConfig=JSON.parse(asar.extractFile(packaged,'package.json'));
if(packedConfig.name!==config.name||packedConfig.version!==version||packedConfig.dependencies['electron-updater']!==config.dependencies['electron-updater'])throw Error('Packaged version/dependencies differ.');
const feed=load(await readFile(path.join(release,'win-unpacked/resources/app-update.yml'),'utf8'));
if(feed.provider!=='github'||feed.owner!=='GoGosing1111'||feed.repo!=='cnine-card'||feed.token||feed.private)throw Error('Unexpected or credentialed public update feed.');
const names=[engine,engine+'.blockmap',setup,'latest.yml'];
const artifacts=[];
for(const name of names){const data=await readFile(path.join(release,name));artifacts.push({name,bytes:data.length,sha256:digest(data)});}
await writeFile(path.join(release,'SHA256SUMS.txt'),artifacts.map(a=>`${a.sha256}  ${a.name}`).join('\n')+'\n');
const sums=await readFile(path.join(release,'SHA256SUMS.txt'));artifacts.push({name:'SHA256SUMS.txt',bytes:sums.length,sha256:digest(sums)});
console.log(JSON.stringify({validated:true,version,artifacts},null,2));
if(!publish)process.exit(0);

const git=args=>execFileSync('git',args,{encoding:'utf8',stdio:['pipe','pipe','pipe'],windowsHide:true}).trim();
if(git(['status','--porcelain']))throw Error('Commit the scoped changes before publishing.');
const commit=git(['rev-parse','HEAD']);git(['merge-base','--is-ancestor',commit,'origin/main']);
let token=process.env.GH_TOKEN||process.env.GITHUB_TOKEN;
if(!token){
  const credential=execFileSync('git',['credential','fill'],{input:'protocol=https\nhost=github.com\n\n',encoding:'utf8',stdio:['pipe','pipe','ignore'],windowsHide:true,env:{...process.env,GIT_TERMINAL_PROMPT:'0'}});
  token=credential.split('\n').find(line=>line.startsWith('password='))?.slice(9).trim();
}
if(!token)throw Error('GitHub release credentials are unavailable.');
async function request(route,{method='GET',body,upload=false,contentType='application/json'}={}){
  const response=await fetch(`https://${upload?'uploads':'api'}.github.com/repos/${repo}/${route}`,{method,headers:{Authorization:'Bearer '+token,'User-Agent':'soopketmon-windows-release','X-GitHub-Api-Version':'2022-11-28','Content-Type':contentType},body:body==null?undefined:upload?body:JSON.stringify(body)});
  if(response.status===404&&method==='GET')return null;
  if(!response.ok)throw Error(`GitHub ${method} ${route.split('?')[0]} failed (${response.status}).`);
  return response.json();
}
const remoteCommit=await request('commits/'+commit);if(remoteCommit?.sha!==commit)throw Error('Push the release commit before publishing.');
let published=await request('releases/tags/'+tag);
if(published&&published.target_commitish!==commit)throw Error('Existing version is attached to another commit; publish a new version.');
if(!published)published=await request('releases',{method:'POST',body:{tag_name:tag,target_commitish:commit,name:`숲켓몬 Windows ${version}`,draft:true,prerelease:false,body:`숲켓몬 Windows 런처 ${version}\n\n설치 파일: **${setup}**\n\n기존 0.1.4 이하 사용자는 게임과 런처를 종료하고 이번 버전을 한 번 설치해 주세요. 이후에는 런처가 새 버전을 자동으로 내려받고, ‘업데이트 후 다시 시작’을 누르면 적용됩니다. 게임 진행 중에는 설치하지 않습니다.\n\n기존 설치 경로·로그인 정보·화면 크기·게임 리소스를 유지합니다. Ctrl + 휠, Ctrl + ＋/－, Ctrl + 0을 지원합니다.\n\nEngine 파일과 latest.yml은 자동 업데이트용입니다.`}});
for(const artifact of artifacts){
  const existing=published.assets.find(a=>a.name===artifact.name);
  if(existing){if(existing.size!==artifact.bytes||existing.digest!=='sha256:'+artifact.sha256)throw Error('Existing release asset differs: '+artifact.name);continue;}
  if(!published.draft)throw Error('A published version is immutable; build a new version.');
  const uploaded=await request(`releases/${published.id}/assets?name=${encodeURIComponent(artifact.name)}`,{method:'POST',upload:true,contentType:'application/octet-stream',body:await readFile(path.join(release,artifact.name))});
  if(uploaded.size!==artifact.bytes||uploaded.digest!=='sha256:'+artifact.sha256)throw Error('Uploaded artifact verification failed: '+artifact.name);
  console.log('Uploaded and verified '+artifact.name);
}
if(published.draft)published=await request('releases/'+published.id,{method:'PATCH',body:{draft:false,make_latest:'true'}});
const result={published:true,version,commit,url:published.html_url,installer:`https://github.com/${repo}/releases/download/${tag}/${setup}`,artifacts};
await writeFile(path.join(release,'publish-receipt.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
