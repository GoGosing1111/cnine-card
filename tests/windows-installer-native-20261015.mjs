import {cp,mkdir,mkdtemp,readFile,writeFile,rename,symlink,stat,readdir} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {spawn,spawnSync} from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {buildInstaller} from '../scripts/build-windows-installer.mjs';

const [sourceBuild,output]=process.argv.slice(2);
if(!sourceBuild||!output)throw Error('Supply an external finished build and QA output directory');
await mkdir(output,{recursive:true});
const qaRoot=await mkdtemp(path.join(os.tmpdir(),'soop-installer-native-'));
function inside(file){const absolute=path.resolve(file);assert(absolute.startsWith(path.resolve(qaRoot)+path.sep),'QA operations must stay inside the fresh isolated directory');return absolute;}
async function run(file,args,cwd=qaRoot){await new Promise((resolve,reject)=>{const child=spawn(file,args,{cwd,windowsHide:true,stdio:'inherit'});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error(file+' exit '+code)));});}
const config=JSON.parse(await readFile(path.join(sourceBuild,'package.json'),'utf8'));
const productionReceipt=JSON.parse(await readFile(path.join(sourceBuild,'installer-build/receipt.json'),'utf8'));
function registry(guid){return spawnSync('reg.exe',['query','HKCU\\Software\\'+guid],{windowsHide:true,encoding:'utf8'});}
const productionBefore=registry(productionReceipt.registryGuid);
config.name='soopketmon-installer-qa';config.productName='Soopketmon Installer QA';
config.build.appId='kr.yakcode.soopketmon.installerqa.'+randomUUID();config.build.productName='Soopketmon Installer QA';
config.build.win.executableName='SoopketmonInstallerQA';
config.build.nsis={...config.build.nsis,guid:randomUUID(),shortcutName:'Soopketmon Installer QA',createDesktopShortcut:false,createStartMenuShortcut:false};
await writeFile(inside(path.join(qaRoot,'package.json')),JSON.stringify(config,null,2));
await cp(path.join(sourceBuild,'build-resources'),inside(path.join(qaRoot,'build-resources')),{recursive:true});
await symlink(path.join(sourceBuild,'node_modules'),inside(path.join(qaRoot,'node_modules')),'junction');
const unpacked=inside(path.join(qaRoot,'release/win-unpacked'));
await cp(path.join(sourceBuild,'release/win-unpacked'),unpacked,{recursive:true});
await rename(inside(path.join(unpacked,'Soopketmon.exe')),inside(path.join(unpacked,'SoopketmonInstallerQA.exe')));
await run(process.execPath,[path.join(sourceBuild,'node_modules/electron-builder/out/cli/cli.js'),'--win','nsis','--x64','--publish','never','--prepackaged',unpacked]);
const receipt=await buildInstaller({source:path.resolve('packaging/windows-client'),build:qaRoot,qa:true});
const target=inside(path.join(qaRoot,'한글 설치 폴더','SoopketmonInstallerQA'));
await mkdir(path.dirname(target),{recursive:true});

// Exercise the compiled validator used by the UI, including drive-relative paths.
const consoleSource=inside(path.join(qaRoot,'ValidatePaths.cs'));
await writeFile(consoleSource,`using System;using System.IO;using System.Reflection;
class PathQA {
 static MethodInfo method;
 static bool Rejected(string p) {try{method.Invoke(null,new object[]{p,null});return false;}catch(TargetInvocationException e){return e.InnerException is IOException;}}
 static int Main(string[] a){method=Assembly.LoadFrom(a[0]).GetType("Soopketmon.Setup.Installer").GetMethod("ValidateTarget",BindingFlags.Static|BindingFlags.NonPublic);
 foreach(string p in new[]{"C:","C:relative",@"\\relative",@"\\\\server\\share",@"C:\\",Environment.GetFolderPath(Environment.SpecialFolder.Windows),Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),a[1]})if(!Rejected(p))throw new Exception("Accepted unsafe path: "+p);
 var actual=(string)method.Invoke(null,new object[]{a[2],null});if(actual!=a[2])throw new Exception("Unicode path changed");
 Console.WriteLine("Compiled installer path validation PASS");return 0;}}
`);
const occupied=inside(path.join(qaRoot,'occupied'));await mkdir(occupied);await writeFile(path.join(occupied,'keep.txt'),'untouched');
const validator=inside(path.join(qaRoot,'ValidatePaths.exe'));
await run(path.join(process.env.WINDIR,'Microsoft.NET/Framework64/v4.0.30319/csc.exe'),['/nologo','/target:exe','/codepage:65001','/out:'+validator,consoleSource]);
await run(validator,[receipt.output,occupied,target]);
await run(receipt.output,['--qa-install='+target]);
assert.equal(await readFile(path.join(path.dirname(target),'installer-qa-result.txt'),'utf8'),'PASS');
assert((await stat(path.join(target,'SoopketmonInstallerQA.exe'))).size>1000000);
const installedHash=createHash('sha256').update(await readFile(path.join(target,'resources/app.asar'))).digest('hex');
assert.equal(installedHash,productionReceipt.installed.asarSha256);
assert.equal(registry(receipt.registryGuid).status,0);
const uninstall=(await readdir(target)).find(name=>/^Uninstall.*\.exe$/i.test(name));assert(uninstall,'registered installer creates an uninstaller');
await run(inside(path.join(target,uninstall)),['/S','--currentuser']);
for(let i=0;i<100&&registry(receipt.registryGuid).status===0;i++)await new Promise(resolve=>setTimeout(resolve,200));
assert.notEqual(registry(receipt.registryGuid).status,0,'QA registration removed');
const productionAfter=registry(productionReceipt.registryGuid);
assert.equal(productionAfter.status,productionBefore.status);assert.equal(productionAfter.stdout,productionBefore.stdout,'existing game registration unchanged');
assert.equal(await readFile(path.join(occupied,'keep.txt'),'utf8'),'untouched');
await writeFile(path.join(output,'report.json'),JSON.stringify({passed:true,version:config.version,qaRoot,unicodeAndSpacesInstallPath:target,installedAsarSha256:installedHash,silentInstall:true,silentUninstall:true,currentUserOnly:true,productionRegistrationUnchanged:true,pathValidation:true},null,2)+'\n');
console.log('Custom installer actual install/uninstall PASS');
