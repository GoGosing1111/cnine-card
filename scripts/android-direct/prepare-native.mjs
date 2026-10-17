import {readFile,writeFile,mkdir,copyFile,readdir} from 'node:fs/promises';
import {resolve,join,dirname,relative,sep,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const repo=resolve(dirname(fileURLToPath(import.meta.url)),'../..'),project=resolve(process.argv[2]||'');
const rel=relative(repo,project);if(!process.argv[2]||!(rel==='..'||rel.startsWith('..'+sep)||isAbsolute(rel)))throw Error('Provide an external generated Android project.');
const config=JSON.parse(await readFile(join(repo,'packaging/android-direct/distribution.json'),'utf8'));
const source=join(repo,'packaging/android-direct/native'),java=join(project,'app/src/main/java/dev/pages/cnine_card/twa');
await mkdir(java,{recursive:true});const sourceHashes={};
for(const file of await readdir(source)){
 const data=await readFile(join(source,file));sourceHashes['native/'+file]=createHash('sha256').update(data).digest('hex');
 await copyFile(join(source,file),file.endsWith('.java')?join(java,file):join(project,'app/src/main',file));
}
// The generator is used only for official launcher icon variants and Gradle setup.
// No TWA or browser-helper component is linked into this native runtime.
await writeFile(join(java,'DelegationService.java'),'package dev.pages.cnine_card.twa; final class DelegationService {}\n');
await writeFile(join(java,'NativeConfig.java'),`package dev.pages.cnine_card.twa; public final class NativeConfig { public static final int VERSION_CODE=${config.appVersionCode}; public static final String VERSION_NAME="${config.appVersion}"; }\n`);
const gradle=join(project,'app/build.gradle');let app=await readFile(gradle,'utf8');
app=app.replace(/\s*implementation 'com\.google\.androidbrowserhelper:androidbrowserhelper:[^']+'/,'');
app=app.replace(/\s*resValue "string", "nativeStartUrl", "[^"]+"/g,'');
app=app.replace(/versionName "[^"]+"/,`versionName "${config.appVersion}"\n        resValue "string", "nativeStartUrl", "https://cnine-card.pages.dev${config.startUrl}"`);
if(!app.includes("options.encoding = 'UTF-8'"))app+="\ntasks.withType(JavaCompile).configureEach { options.encoding = 'UTF-8' }\n";
await writeFile(gradle,app);
await writeFile(join(project,'app/src/main/res/values/native-theme.xml'),`<resources><style name="NativeTheme" parent="android:style/Theme.Material.NoActionBar"><item name="android:fontFamily">sans</item><item name="android:windowLightStatusBar">false</item><item name="android:windowActionModeOverlay">true</item><item name="android:colorAccent">#bb8cfa</item><item name="android:statusBarColor">#080c17</item><item name="android:navigationBarColor">#080c17</item><item name="android:windowBackground">#080c17</item></style></resources>\n`);
const assets=join(project,'app/src/main/assets/launcher');await mkdir(assets,{recursive:true});
for(const name of ['background.webp','button.webp']){const file=join(repo,'packaging/android-direct/art',name);const data=await readFile(file);sourceHashes['art/'+name]=createHash('sha256').update(data).digest('hex');await copyFile(file,join(assets,name));}
await writeFile(join(project,'native-source-hashes.json'),JSON.stringify(sourceHashes,null,2)+'\n');
console.log(JSON.stringify({native:true,version:config.appVersion,sourceFiles:Object.keys(sourceHashes).length}));
