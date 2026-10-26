import {readFile,writeFile,mkdir,copyFile,cp,stat} from 'node:fs/promises';
import {resolve,join,dirname,relative,sep,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createWebOverrides} from './web-overrides.mjs';
const repo=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const project=resolve(process.argv[2]||''),template=resolve(process.argv[3]||'');
const rel=relative(repo,project);
if(!process.argv[2]||!process.argv[3]||!(rel==='..'||rel.startsWith('..'+sep)||isAbsolute(rel))||project===template)throw Error('Provide a separate external build directory and existing Android template.');
const config=JSON.parse(await readFile(join(repo,'packaging/onestore/distribution.json'),'utf8'));
const {overrides,hashes,source,once,hash}=await createWebOverrides(repo);
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
