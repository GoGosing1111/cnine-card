import {mkdir,readFile,readdir,stat,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

async function treeBytes(root){let size=0;for(const entry of await readdir(root,{withFileTypes:true})){const file=path.join(root,entry.name);size+=entry.isDirectory()?await treeBytes(file):(await stat(file)).size;}return size;}
const hash=async file=>createHash('sha256').update(await readFile(file)).digest('hex');
export async function buildInstaller({source,build,qa=false}){
  const config=JSON.parse(await readFile(path.join(build,'package.json'),'utf8'));
  const version=config.version;
  const payload=path.join(build,'release',config.build.artifactName.replace('${version}',version).replace('${arch}','x64').replace('${ext}','exe'));
  const unpacked=path.join(build,'release/win-unpacked');
  const output=path.join(build,'release',qa?`Soopketmon-InstallerQA-${version}.exe`:`Soopketmon-Setup-${version}-x64.exe`);
  const require=createRequire(path.join(build,'package.json'));
  const {UUID}=require('builder-util-runtime');
  const constants={Version:version,PayloadHash:await hash(payload),AsarHash:await hash(path.join(unpacked,'resources/app.asar')),AppGuid:config.build.nsis.guid||UUID.v5(config.build.appId,UUID.parse('50e065bc-3134-11e6-9bab-38c9862bdaf3')),ClientExe:config.build.win.executableName+'.exe',DirectoryName:config.build.win.executableName};
  const payloadBytes=(await stat(payload)).size,unpackedBytes=await treeBytes(unpacked);
  const generated=path.join(build,'installer-build');await mkdir(generated,{recursive:true});
  const metadata=`using System.Reflection;\n[assembly:AssemblyTitle("숲켓몬 설치")]\n[assembly:AssemblyProduct("숲켓몬 Windows 클라이언트")]\n[assembly:AssemblyCompany("YAKCODE")]\n[assembly:AssemblyVersion("${version}.0")]\n[assembly:AssemblyFileVersion("${version}.0")]\nnamespace Soopketmon.Setup { internal static class BuildConfig {\n${Object.entries(constants).map(([key,value])=>`public const string ${key} = ${JSON.stringify(value)};`).join('\n')}\npublic const long PayloadBytes = ${payloadBytes}L;\npublic const long UnpackedBytes = ${unpackedBytes}L;\n} }\n`;
  const configFile=path.join(generated,'BuildConfig.cs');await writeFile(configFile,metadata,'utf8');
  const framework=path.join(process.env.WINDIR||'C:/Windows','Microsoft.NET/Framework64/v4.0.30319');
  const references=['System.dll','System.Core.dll','System.Xml.dll','System.Xaml.dll','System.Windows.Forms.dll'].map(name=>path.join(framework,name)).concat(['WindowsBase.dll','PresentationCore.dll','PresentationFramework.dll'].map(name=>path.join(framework,'WPF',name)));
  const resources={
    'window.xaml':path.join(source,'installer/window.xaml'),
    'art.png':path.join(source,'art/installer-gateway-v1-source.png'),
    'logo.png':path.join(source,'renderer/assets/soopketmon-logo-approved.png'),
    'icon.png':path.join(source,'renderer/assets/icon.png'),
    'license.txt':path.join(build,'build-resources/LICENSE.txt'),
    'payload.exe':payload
  };
  const args=['/nologo','/utf8output','/codepage:65001','/target:winexe','/platform:x64','/optimize+','/debug-',`/out:${output}`,`/win32icon:${path.join(build,'build-resources/icon.ico')}`,`/win32manifest:${path.join(source,'installer/app.manifest')}`,...references.map(file=>`/reference:${file}`),...Object.entries(resources).map(([name,file])=>`/resource:${file},Soop.Setup.${name}`),...(qa?['/define:INSTALLER_QA']:[]),path.join(source,'installer/Setup.cs'),configFile];
  const result=spawnSync(path.join(framework,'csc.exe'),args,{stdio:'inherit',windowsHide:true});
  if(result.error)throw result.error;if(result.status!==0)throw new Error('Custom installer compilation failed: '+result.status);
  const receipt={version,kind:'custom-wpf-installer',qa,output,bytes:(await stat(output)).size,sha256:await hash(output),backend:{path:payload,bytes:payloadBytes,sha256:constants.PayloadHash},installed:{exe:constants.ClientExe,asarSha256:constants.AsarHash,bytes:unpackedBytes},registryGuid:constants.AppGuid};
  await writeFile(path.join(generated,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');
  console.log('Custom installer created: '+output);return receipt;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await buildInstaller({source:path.resolve('packaging/windows-client'),build:path.resolve(process.argv[2]),qa:process.argv.includes('--qa')});
