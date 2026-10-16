import {mkdtemp,mkdir,readFile,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
const [build,output]=process.argv.slice(2);
if(!build||!output)throw Error('Supply the external published build and QA output directory');
await mkdir(output,{recursive:true});
const config=JSON.parse(await readFile(path.join(build,'package.json'),'utf8'));
const root=await mkdtemp(path.join(os.tmpdir(),'soop-update-feed-'));
await writeFile(path.join(root,'package.json'),JSON.stringify({name:'soop-update-feed-qa',version:config.version,main:'main.cjs'}));
const report=path.join(root,'report.json');
await writeFile(path.join(root,'main.cjs'),`
const {app}=require('electron');const fs=require('node:fs/promises');
app.setPath('userData',${JSON.stringify(path.join(root,'profile'))});
app.whenReady().then(async()=>{
  const {NsisUpdater}=require(${JSON.stringify(path.join(build,'node_modules/electron-updater'))});
  const updater=new NsisUpdater();updater.forceDevUpdateConfig=true;updater.autoDownload=false;updater.autoInstallOnAppQuit=false;updater.logger=null;
  updater.updateConfigPath=${JSON.stringify(path.join(build,'release/win-unpacked/resources/app-update.yml'))};
  try{const result=await updater.checkForUpdates();await fs.writeFile(${JSON.stringify(report)},JSON.stringify({passed:true,available:result.isUpdateAvailable,info:result.updateInfo}));app.quit();}
  catch(error){console.error(error.message);app.exit(1);}
});
`);
await new Promise((resolve,reject)=>{const p=spawn(process.env.ELECTRON_PATH||path.join(build,'node_modules/electron/dist/electron.exe'),[root],{windowsHide:true,stdio:'inherit'});p.on('error',reject);p.on('exit',code=>code===0?resolve():reject(Error('Public update feed failed: '+code)));});
const result=JSON.parse(await readFile(report,'utf8'));
assert.equal(result.passed,true);assert.equal(result.available,false);assert.equal(result.info.version,config.version);
const name=config.build.artifactName.replace('${version}',config.version).replace('${arch}','x64').replace('${ext}','exe'),file=result.info.files.find(f=>f.url===name);assert(file);
const url=`https://github.com/GoGosing1111/cnine-card/releases/download/v${config.version}/${name}`;
const response=await fetch(url,{headers:{Range:'bytes=0-63'}});assert.equal(response.status,206);
const prefix=Buffer.from(await response.arrayBuffer());assert.equal(prefix.subarray(0,2).toString(),'MZ');
const receipt=JSON.parse(await readFile(path.join(build,'installer-build/receipt.json'),'utf8'));
assert.equal(file.size,receipt.backend.bytes);assert.equal(file.sha512,createHash('sha512').update(await readFile(path.join(build,'release',name))).digest('base64'));
await writeFile(path.join(output,'public-feed.json'),JSON.stringify({...result,rangeDownload:true,installerUrl:url,checkedAt:new Date().toISOString()},null,2)+'\n');
console.log('Real Electron public GitHub provider and installer download PASS');
