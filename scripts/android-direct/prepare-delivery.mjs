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
if(/application-debuggable|native-code:/.test(badging))throw Error('Expected a universal, non-debuggable TWA APK.');
const xml=run(join(sdk,'aapt.exe'),['dump','xmltree',apk,'AndroidManifest.xml']);
if(!/usesCleartextTraffic[^\r\n]*0x0/.test(xml)||!/allowBackup[^\r\n]*0x0/.test(xml))throw Error('Release security flags missing.');
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
const review=join(output,'review');
await mkdir(review,{recursive:true});
await copyFile(apk,join(output,config.filename));
await writeFile(join(output,'SHA256SUMS.txt'),`${hash}  ${config.filename}\n`);
await writeFile(join(review,'apk-signature.txt'),signature);
await writeFile(join(review,'apk-badging.txt'),badging);
await copyFile(join(project,'app/build/reports/lint-results-release.xml'),join(review,'lint-results-release.xml'));
await copyFile(join(repo,'packaging/play-store/upload-certificate.der'),join(review,'public-certificate.der'));
const record={createdAt:new Date().toISOString(),channel:config.channel,publication:config.publication,boardUrl:config.boardUrl,file:config.filename,bytes:bytes.length,sha256:hash,appName:config.appName,packageId:config.packageId,version:config.appVersion,versionCode:config.appVersionCode,minSdk:24,targetSdk:36,universal:true,debuggable:false,startUrl,signerSha256:certificate.fingerprint256,checks:{apkSignature:true,zipAlignment:true,compiledManifest:true,lintErrors:0,lintWarnings:(lint.match(/severity="Warning"/g)||[]).length,liveDigitalAssetLinks:true,approvedLiveIcons:checkedIcons},deviceTesting:'PENDING_PHYSICAL_ANDROID_DEVICE',gameSource:'LIVE_HTTPS_SERVICE',updates:config.updates};
await writeFile(join(output,'release.json'),JSON.stringify(record,null,2)+'\n');
await writeFile(join(output,'설치안내.txt'),`리버스콜 안드로이드 ${config.appVersion}\n\n배포 게시글: ${config.boardUrl}\n설치 파일: ${config.filename}\n\n1. 안드로이드 휴대폰에서 게시글에 첨부된 APK를 내려받습니다.\n2. 다운로드 목록에서 APK를 열고 설치를 선택합니다.\n3. 출처 허용 안내가 나오면 다운로드에 사용한 브라우저 또는 파일 앱에만 설치를 허용합니다. Android 7에서는 보안 설정의 출처 허용 안내를 따릅니다. 설치 후 필요 없다면 다시 끌 수 있습니다.\n4. 설치된 '리버스콜'을 실행하고 기존 게임 계정으로 로그인합니다.\n\nAndroid 7.0 이상 설치 대상이며 인터넷과 TWA를 지원하는 브라우저가 필요합니다. Chrome 업데이트를 권장하며, 브라우저 미지원/연결 검증 실패 시 주소창이 있는 브라우저 화면으로 열릴 수 있습니다.\n기존 웹 게임과 같은 서버·계정을 사용합니다. 오프라인 게임이 아니며 게임 데이터는 접속 시 불러옵니다.\n게임 콘텐츠는 웹 서비스 배포를 따릅니다. APK 자체의 새 버전은 같은 게시글에서 내려받아 기존 앱 위에 업데이트 설치합니다. 기존 준비본 1.0.0과 패키지·서명이 같습니다.\niPhone/iPad에는 APK를 설치할 수 없습니다.\n\n설치 안내 근거: https://developer.android.com/distribute/marketing-tools/alternative-distribution\n문의: elspe3821@gmail.com\n`);
await writeFile(join(output,'DK-게시글-본문.txt'),`[리버스콜] 안드로이드 APK ${config.appVersion}\n\n리버스콜을 안드로이드 앱으로 설치할 수 있습니다.\n아래 첨부파일 '${config.filename}'을 내려받아 설치해 주세요.\n\n설치 방법\nAPK 다운로드 → 다운로드 파일 열기 → 설치 → 리버스콜 실행\n출처 허용 안내가 나오면 다운로드에 사용한 브라우저/파일 앱의 설치 권한을 허용해 주세요.\n\n• Android 7.0 이상 설치 대상 / 인터넷 연결 필요\n• Chrome 최신 지원 버전 사용 권장\n• 기존 게임 계정 그대로 이용\n• 기존 APK가 있다면 삭제하지 말고 업데이트 설치\n• iPhone/iPad 설치 불가\n\n파일: ${config.filename}\n크기: ${(bytes.length/1024/1024).toFixed(2)} MiB\n버전: ${config.appVersion}\n문의: elspe3821@gmail.com\n`);
await writeFile(join(output,'운영자-업로드안내.txt'),`대상 게시글: ${config.boardUrl}\n\n1. 안드로이드 실기기에서 APK 설치, 로그인, 전투 진입/복귀, OS 뒤로가기와 앱 재실행을 확인합니다. 현재 자동 검수는 빌드/서명/정적 설정/운영 연결까지이며 실기기 확인을 대신하지 않습니다.\n2. 게시글에 ${config.filename}을 첨부하고 DK-게시글-본문.txt를 붙여 넣습니다. 게시글 기존 내용은 필요한 부분만 편집합니다.\n3. DK의 APK 첨부 허용 여부/용량 제한은 실제 업로드 때 확인해야 합니다. 차단되면 승인된 HTTPS 파일 호스팅에 동일 파일을 올리고 본문의 첨부 안내를 실제 다운로드 링크로 바꿉니다. 확장자를 바꿔 차단을 우회하지 않습니다.\n4. 휴대폰에서 게시글을 통해 다시 다운로드해 SHA256SUMS.txt와 같은 파일인지 확인합니다. 이 패키지는 DK에 자동 게시하지 않았습니다.\n\n파일 전체 SHA-256: ${hash}\n공개 인증서 SHA-256: ${certificate.fingerprint256}\n다음 APK 업데이트는 같은 패키지·원래 서명 키를 사용하고 versionCode를 ${config.appVersionCode+1} 이상으로 올립니다. 키/암호는 전달 폴더에 포함하지 않았습니다. Google Play 등록/자동 업데이트 피드 발행은 하지 않습니다. Windows 최신 릴리스도 변경하지 않습니다.\n`);
console.log(JSON.stringify({output,file:config.filename,bytes:bytes.length,sha256:hash,version:config.appVersion,checks:record.checks,deviceTesting:record.deviceTesting}));
