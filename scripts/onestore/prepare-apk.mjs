import {readFile,writeFile,mkdir,copyFile,cp,stat} from 'node:fs/promises';
import {resolve,join,dirname,relative,sep,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {excludedAsset} from '../../packaging/onestore/web/policy.mjs';
const repo=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const project=resolve(process.argv[2]||''),template=resolve(process.argv[3]||'');
const rel=relative(repo,project);
if(!process.argv[2]||!process.argv[3]||!(rel==='..'||rel.startsWith('..'+sep)||isAbsolute(rel))||project===template)throw Error('Provide a separate external build directory and existing Android template.');
const config=JSON.parse(await readFile(join(repo,'packaging/onestore/distribution.json'),'utf8'));
const hashes={},overrides=new Map();
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function source(file){const bytes=await readFile(join(repo,file));hashes[file]=hash(bytes);return bytes.toString('utf8').replace(/\r\n/g,'\n');}
function once(text,from,to,label){const index=text.indexOf(from);if(index<0||text.indexOf(from,index+from.length)>=0)throw Error('Source changed: '+label);return text.slice(0,index)+to+text.slice(index+from.length);}
// A strict patch applies in memory; the live website and direct clients are
// never edited, generated, deployed, or copied as a whole by this build.
const patch=JSON.parse(await source('packaging/onestore/web/client-patch.json')).patch;
for(const section of patch.split(/(?=^diff --git )/m).filter(Boolean)){
  const file=/^diff --git a\/(.+) b\/(.+)$/m.exec(section)?.[2];if(!file)throw Error('Invalid client patch');
  let lines=(await source(file)).split('\n'),offset=0;
  for(const hunk of section.split(/(?=^@@ )/m).slice(1)){
    const header=/^@@ -(\d+)(?:,\d+)? \+\d+(?:,\d+)? @@[^\n]*\n/.exec(hunk);if(!header)throw Error('Invalid patch hunk');
    const body=hunk.slice(header[0].length).split('\n').filter(line=>line.startsWith(' ')||line.startsWith('+')||line.startsWith('-'));
    const before=body.filter(l=>!l.startsWith('+')).map(l=>l.slice(1)),after=body.filter(l=>!l.startsWith('-')).map(l=>l.slice(1));
    const at=Number(header[1])-1+offset;
    if(lines.slice(at,at+before.length).join('\n')!==before.join('\n'))throw Error('Patch does not match '+file);
    lines.splice(at,before.length,...after);offset+=after.length-before.length;
  }
  overrides.set('/'+file,lines.join('\n'));
}
let html=overrides.get('/index.html');
html=html.replace(/<(?:script\b[^>]*\bsrc|link\b[^>]*\bhref)=["']([^"']+)["'][^>]*>(?:<\/script>)?/g,(tag,url)=>excludedAsset(new URL(url,'https://cnine-card.pages.dev').pathname)?'':tag);
overrides.set('/index.html',html);
let lobby=await source('js/adventure-lobby-v2107.js');
lobby=once(lobby,"      void import('/js/server-support-v1.mjs?v=20261020-package2-pass-sales-start-v1').then(({mountServerSupportNavigation})=>{\n        if(!supportSignal.aborted)this.supportNavigation=mountServerSupportNavigation({root,getUser,signal:supportSignal,onOpenMessages:()=>settings.navigate?settings.navigate('messages'):global.SoopketmonV21ExactShell.navigate('messages'),onSeasonPassVisibilityChange:visible=>{this.seasonPassVisible=visible;this.controls?.refreshMenus();}});\n      }).catch(()=>{});",'', 'support navigation');
lobby=once(lobby,"  entries.push({id:'seasonPass',title:'시즌패스',category:'rewards',description:'후원 적용일부터 30일 · 당일 보상 수령'});",'', 'pass menu');
lobby=once(lobby,"        isSeasonPassVisible:()=>this.seasonPassVisible===true,","        isRouteVisible:id=>window.CNineStorePolicy.allowsRoute(id)&&(settings.isRouteVisible?settings.isRouteVisible(id):['world','equipmentForge','mercenaryEquipment'].includes(id)||global.SoopketmonV21ExactShell?.isRouteVisible(id)!==false),\n        isSeasonPassVisible:()=>false,",'lobby route policy');
overrides.set('/js/adventure-lobby-v2107.js',lobby);
let pet=await source('js/pet-equipment-window-v1.mjs');
pet=once(pet,'  async function loadSupport(){','  async function loadSupport(){\n    support=null;pendingSupport=null;supportError="";return;','pet support request');
overrides.set('/js/pet-equipment-window-v1.mjs',pet);
let app=overrides.get('/js/app.js');
app=app.replace(/<button class="message-cleanup-all"[^]*?<\/small>/,'');
app=once(app,"m.message_type==='SUPPORT_BANK_ACCOUNT'?'후원 신청 · 계좌 안내':escapeHtml(m.message_type)","escapeHtml(m.message_type)",'message labels');
// Never bulk-delete hidden records from the shared account.
app=once(app,'async function deleteCompletedMessages(){','async function deleteCompletedMessages(){\n  return;','bulk message cleanup');
overrides.set('/js/app.js',app);
const compiled=await build({entryPoints:[join(repo,'packaging/onestore/web/bootstrap.mjs')],bundle:true,write:false,format:'iife',target:'es2020',minify:true});
overrides.set('/js/store-distribution-v1.js',compiled.outputFiles[0].text);
await mkdir(project,{recursive:true});
// Reuse installed JDK/SDK/Gradle cache; copy only the small build skeleton/icons.
for(const file of ['build.gradle','settings.gradle','gradle.properties','gradlew.bat','gradlew','gradle/wrapper/gradle-wrapper.jar','gradle/wrapper/gradle-wrapper.properties']){
  const to=join(project,file);await mkdir(dirname(to),{recursive:true});await copyFile(join(template,file),to);
}
await cp(join(template,'app/src/main/res'),join(project,'app/src/main/res'),{recursive:true});
const java=join(project,'app/src/main/java/dev/pages/cnine_card/twa');await mkdir(java,{recursive:true});
for(const name of ['ClientPolicy.java','ClientHttp.java','ResourceStore.java','LauncherUi.java','GameActivity.java']){
  let value=await source('packaging/android-direct/native/'+name);
  if(name==='GameActivity.java'){
    value=once(value,'String url=request.getUrl().toString();\n        if(ClientPolicy.gameUrl(url)','String url=request.getUrl().toString();\n        if(DistributionPolicy.blocked(url))return error(403,"Unavailable in this distribution.");\n        if(ClientPolicy.gameUrl(url)','native interception');
    value=once(value,'String url=request.getUrl().toString();if(ClientPolicy.gameUrl(url)','String url=request.getUrl().toString();if(DistributionPolicy.blocked(url))return true;if(ClientPolicy.gameUrl(url)','native navigation');
    value=once(value,'+" ReverseCallAndroid/"+NativeConfig.VERSION_NAME','+" ReverseCallAndroid/"+NativeConfig.VERSION_NAME+" ReverseCallStore/onestore/"+NativeConfig.VERSION_NAME','store user agent');
    value=value.replace(/        web\.setDownloadListener\([^\n]+\);\n/,'');
  }
  if(name==='LauncherUi.java')value=value.replace('"ANDROID  ·  "','"ONE STORE  ·  "');
  if(name==='ClientPolicy.java')value=value.replace('"dev.pages.cnine_card.twa"',JSON.stringify(config.packageId));
  await writeFile(join(java,name),value);
}
for(const name of ['Application.java','DistributionPolicy.java','LauncherActivity.java'])await writeFile(join(java,name),await source('packaging/onestore/native/'+name));
await writeFile(join(java,'NativeConfig.java'),`package dev.pages.cnine_card.twa; public final class NativeConfig { public static final int VERSION_CODE=${config.appVersionCode}; public static final String VERSION_NAME=${JSON.stringify(config.appVersion)}; }\n`);
let manifest=await source('packaging/android-direct/native/AndroidManifest.xml');
manifest=manifest.replace(/    <uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES"\/>\n/,'').replace(/        <provider\b[^]*?<\/application>/,'    </application>');
manifest=manifest.replace(/            <intent-filter android:autoVerify="true">[^]*?<\/intent-filter>\n/,'');
await writeFile(join(project,'app/src/main/AndroidManifest.xml'),manifest);
let gradle=await readFile(join(template,'app/build.gradle'),'utf8');
gradle=gradle.replace(/applicationId: '[^']+'/g,`applicationId: '${config.packageId}'`).replace(/applicationId "[^"]+"/g,`applicationId "${config.packageId}"`).replace(/versionCode\s+\d+/,`versionCode ${config.appVersionCode}`).replace(/versionName "[^"]+"/,`versionName "${config.appVersion}"`).replace(/resValue "string", "nativeStartUrl", "[^"]+"/,`resValue "string", "nativeStartUrl", "https://cnine-card.pages.dev${config.startUrl}"`).replace(/launchUrl: '[^']+'/g,`launchUrl: '${config.startUrl}'`);
await writeFile(join(project,'app/build.gradle'),gradle);
const assets=join(project,'app/src/main/assets');await mkdir(join(assets,'launcher'),{recursive:true});
for(const name of ['background.webp','button.webp'])await copyFile(join(repo,'packaging/android-direct/art',name),join(assets,'launcher',name));
await copyFile(join(repo,'packaging/android-direct/web/game-back.js'),join(assets,'game-back.js'));
const files=[];
for(const [path,value] of overrides){const to=join(assets,'onestore',path.slice(1));await mkdir(dirname(to),{recursive:true});await writeFile(to,value);const bytes=Buffer.from(value);files.push({path,sha256:hash(bytes),bytes:bytes.length,essential:true});}
await writeFile(join(assets,'onestore/manifest.json'),JSON.stringify({schema:1,channel:config.channel,files},null,2)+'\n');
await writeFile(join(project,'onestore-build-inputs.json'),JSON.stringify({configuration:config,sourceHashes:hashes,bundledFiles:files,websiteModified:false,existingClientsModified:false},null,2)+'\n');
console.log(JSON.stringify({project,packageId:config.packageId,version:config.appVersion,files:files.length,bundledBytes:files.reduce((n,f)=>n+f.bytes,0)}));
