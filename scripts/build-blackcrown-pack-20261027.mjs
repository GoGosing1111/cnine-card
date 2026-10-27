import {build} from 'esbuild';
import {readFile,writeFile} from 'node:fs/promises';
for(const entry of ['js/mercenary-blackcrown-pack-live.mjs','admin/mercenary-blackcrown-admin-v1.mjs']){
 await build({entryPoints:[entry],outfile:entry.replace('.mjs','.bundle.mjs'),bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,legalComments:'none'});
}
const css=await readFile('css/mercenary-blackcrown-pack-v2.css','utf8'),bulk=await readFile('css/mercenary-blackcrown-bulk-v1.css','utf8');
await writeFile('css/mercenary-blackcrown-pack.bundle.css',css.replace("@import url('./mercenary-blackcrown-bulk-v1.css');",bulk));
console.log('Built Black Crown opening/CMS bundles and one stylesheet.');
