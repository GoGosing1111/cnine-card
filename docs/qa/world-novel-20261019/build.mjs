import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import esbuild from 'esbuild';
const root=new URL('../../../',import.meta.url),source=new URL('./source/',import.meta.url);
const read=url=>fs.readFileSync(url,'utf8').replace(/\r\n/g,'\n');
const result=await esbuild.build({entryPoints:[fileURLToPath(new URL('reader.js',source))],bundle:true,format:'esm',platform:'browser',target:['es2022'],write:false,legalComments:'none'});
// Match the normal file-output build's stable source comments.
const script=result.outputFiles[0].text;
const html=read(new URL('reader.html',source)).replace('<!-- WORLD_STYLES -->',()=>'<style>\n'+read(new URL('reader.css',source))+'\n</style>');
if(process.argv.includes('--check')){
 if(script!==read(new URL('world/world.js',root))||html!==read(new URL('world/index.html',root)))throw Error('World runtime differs from authoring sources');
 console.log('World story source and runtime match');
}else{
 fs.writeFileSync(new URL('world/world.js',root),script);fs.writeFileSync(new URL('world/index.html',root),html);
 console.log('World story runtime built');
}
