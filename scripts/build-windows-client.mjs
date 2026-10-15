import {cp,mkdir,readFile,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import sharp from 'sharp';
import {buildInstaller} from './build-windows-installer.mjs';
const target=process.argv[2];
if(!target||!path.isAbsolute(target))throw new Error('Supply an absolute external build directory containing the client npm dependencies.');
const source=path.resolve('packaging/windows-client'),build=path.resolve(target);
if(build===source||build.startsWith(path.resolve('.')+path.sep))throw new Error('Keep generated installers and dependencies outside the deployment source tree.');
await mkdir(build,{recursive:true});
for(const name of ['main.mjs','preload.cjs','lib','renderer','package.json','package-lock.json','build-resources'])await cp(path.join(source,name),path.join(build,name),{recursive:true});
await mkdir(path.join(build,'build-resources'),{recursive:true});
// NSIS detects the license file's encoding independently of the installer script.
// An explicit nsis.license bypasses electron-builder's localized-license BOM conversion.
const license=new TextDecoder('utf-8',{fatal:true}).decode(await readFile(path.join(source,'LICENSE.txt'))).replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n');
await writeFile(path.join(build,'build-resources/LICENSE.txt'),'\uFEFF'+license.replace(/\n/g,'\r\n'),'utf8');
const png=await sharp(await readFile(path.join(source,'renderer/assets/icon.png'))).resize(256,256).png().toBuffer();
const header=Buffer.alloc(22);header.writeUInt16LE(1,2);header.writeUInt16LE(1,4);header.writeUInt16LE(1,10);header.writeUInt16LE(32,12);header.writeUInt32LE(png.length,14);header.writeUInt32LE(22,18);
await writeFile(path.join(build,'build-resources/icon.ico'),Buffer.concat([header,png]));
if(!process.argv.includes('--stage-only')){
  const result=spawnSync(process.execPath,[path.join(build,'node_modules/electron-builder/out/cli/cli.js'),'--win','nsis','--x64','--publish','never'],{cwd:build,stdio:'inherit',env:{...process.env,CSC_IDENTITY_AUTO_DISCOVERY:'false'}});
  if(result.error)throw result.error;if(result.status!==0)process.exit(result.status||1);
  await buildInstaller({source,build});
}
console.log('Windows client prepared at '+build);
