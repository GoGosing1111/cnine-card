import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs/promises';
const root=fileURLToPath(new URL('.',import.meta.url));
// Pages redirects battle.html to /battle. Pixi then treats that extensionless
// URL as a directory. Root asset paths keep this standalone preview identical.
// This transformation is confined to this preview bundle; shared source stays intact.
const previewAssetRoots={name:'standalone-preview-asset-roots',setup(builder){builder.onLoad({filter:/[/\\]BattleEngine\.js$/},async args=>({contents:(await fs.readFile(args.path,'utf8')).replace(/(['"])\.\.\/\.\.\/assets\//g,'$1/assets/'),loader:'js'}));}};
await build({entryPoints:[root+'source/preview.js'],bundle:true,minify:true,format:'iife',target:['es2022'],legalComments:'none',outfile:root+'preview.bundle.js',plugins:[previewAssetRoots]});
const output=await fs.readFile(root+'preview.bundle.js','utf8');
await fs.writeFile(root+'preview.bundle.js',output.replace(/[\t ]+$/gm,'').trimEnd()+'\n');
console.log('Crimson knight preview built with the existing V3 engine and its PixiJS / GSAP dependencies.');
