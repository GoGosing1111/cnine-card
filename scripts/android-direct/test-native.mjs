import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const repo=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const tools=process.env.PLAY_TOOLS_ROOT,output=process.argv[2];
if(!tools||!output)throw Error('PLAY_TOOLS_ROOT and external test output directory required.');
const tests=resolve(output),classes=join(tests,'classes');await mkdir(classes,{recursive:true});
const jar=join(tests,'json-20240303.jar'),url='https://repo.maven.apache.org/maven2/org/json/json/20240303/json-20240303.jar';
let bytes;try{bytes=await readFile(jar);}catch{const r=await fetch(url);if(!r.ok)throw Error('Test JSON dependency unavailable');bytes=Buffer.from(await r.arrayBuffer());}
const checksum=(await(await fetch(url+'.sha1')).text()).trim().split(/\s/)[0];
if(createHash('sha1').update(bytes).digest('hex')!==checksum)throw Error('Maven test dependency checksum mismatch');await writeFile(jar,bytes);
const jdk=join(tools,'jdk/jdk-17.0.20.1+1/bin');
const logs=[];
async function run(command,args){await new Promise((ok,fail)=>{const child=spawn(command,args,{cwd:repo,windowsHide:true});child.stdout.on('data',b=>{process.stdout.write(b);logs.push(b.toString());});child.stderr.on('data',b=>{process.stderr.write(b);logs.push(b.toString());});child.on('error',fail);child.on('exit',code=>code===0?ok():fail(Error('Native test exited '+code)));});}
const native=join(repo,'packaging/android-direct/native');
await run(join(jdk,'javac.exe'),['-encoding','UTF-8','-source','8','-target','8','-cp',jar,'-d',classes,...['ClientPolicy.java','ClientHttp.java','ResourceStore.java'].map(f=>join(native,f)),join(repo,'tests/android-native/ClientCoreTest.java')]);
try{await run(join(jdk,'java.exe'),['-Dfile.encoding=UTF-8','-cp',classes+';'+jar,'dev.pages.cnine_card.twa.ClientCoreTest',join(tests,'cache'),...(process.argv.includes('--live')?['--live']:[])]);}finally{await writeFile(join(tests,'test.log'),logs.join(''));}
