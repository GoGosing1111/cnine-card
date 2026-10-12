import {readFile, writeFile, mkdir, readdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve, dirname, relative, join, sep, isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';

const repo=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const output=process.argv[2]&&resolve(process.argv[2]);
if(!output||!process.env.PLAY_TOOLS_ROOT)throw Error('Usage: PLAY_TOOLS_ROOT=<external npm prefix> node scripts/play-store/generate-android.mjs <external output>');
const rel=relative(repo,output);
if(!(rel==='..'||rel.startsWith('..'+sep)||isAbsolute(rel)))throw Error('Keep Android build outputs outside the web deployment directory.');
await mkdir(output,{recursive:true});
if((await readdir(output)).length)throw Error('Output directory must be empty; existing Android projects are never overwritten.');
const require=createRequire(join(resolve(process.env.PLAY_TOOLS_ROOT),'package.json'));
const {TwaManifest,TwaGenerator,ConsoleLog}=require('@bubblewrap/core');
if(require('@bubblewrap/core/package.json').version!=='1.27.0')throw Error('Install @bubblewrap/cli@1.27.0 in PLAY_TOOLS_ROOT.');
const config=JSON.parse(await readFile(join(repo,'packaging/play-store/twa-manifest.json'),'utf8'));
if(!/^\d+\.\d+\.\d+$/.test(config.appVersion||''))throw Error('appVersion is required by Bubblewrap; appVersionName is not a manifest input.');
const manifest=new TwaManifest(config);
await new TwaGenerator().createTwaProject(output,manifest,new ConsoleLog('soopketmon-play'));
await manifest.saveToFile(join(output,'twa-manifest.json'));
const appFile=join(output,'app/build.gradle');
let app=await readFile(appFile,'utf8');
if(!/targetSdkVersion 36/.test(app)||!/compileSdkVersion 36/.test(app))throw Error('The generated application must target and compile API 36.');
if(!app.includes(`versionName "${config.appVersion}"`))throw Error('Generated Android version name is missing.');
app=app.replace('checkReleaseBuilds false','checkReleaseBuilds true');
app+=`
// Secrets remain outside source control and outside the generated project.
def uploadKeyPath = System.getenv('SOOP_UPLOAD_KEYSTORE')
if (uploadKeyPath != null) {
    def storePass = System.getenv('SOOP_STORE_PASSWORD')
    def keyPass = System.getenv('SOOP_KEY_PASSWORD')
    if (!storePass || !keyPass) throw new GradleException('Missing upload signing environment')
    android.signingConfigs {
        upload {
            storeFile file(uploadKeyPath)
            storePassword storePass
            keyAlias 'soopketmon-upload'
            keyPassword keyPass
        }
    }
    android.buildTypes.release.signingConfig = android.signingConfigs.upload
}
`;
await writeFile(appFile,app);
const buildFile=join(output,'build.gradle');
await writeFile(buildFile,(await readFile(buildFile,'utf8')).replaceAll('jcenter()','mavenCentral()'));
const androidManifest=join(output,'app/src/main/AndroidManifest.xml');
await writeFile(androidManifest,(await readFile(androidManifest,'utf8')).replace('android:allowBackup="true"','android:allowBackup="false"\n        android:usesCleartextTraffic="false"'));
await writeFile(join(output,'gradle.properties'),(await readFile(join(output,'gradle.properties'),'utf8'))+'\norg.gradle.jvmargs=-Xmx2048m -Dfile.encoding=UTF-8\n');
console.log(JSON.stringify({output,packageId:config.packageId,versionCode:config.appVersionCode,targetSdk:36}));
