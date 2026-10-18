
import {build} from 'esbuild';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {IMPERIAL_ARCHER_COMBAT,IMPERIAL_ARCHER_SKILLS} from './balance.mjs';
const root=fileURLToPath(new URL('.',import.meta.url));
const manifest=JSON.parse(await fs.readFile(root+'manifest.json','utf8'));
manifest.balance={...IMPERIAL_ARCHER_COMBAT,policyFile:'balance.mjs',skills:IMPERIAL_ARCHER_SKILLS,comparison:'qa/arrow-v2/balance-report.json'};
await fs.writeFile(root+'manifest.json',JSON.stringify(manifest,null,2)+'\n');
await build({entryPoints:[root+'source/preview.js'],bundle:true,minify:true,format:'iife',target:['es2022'],legalComments:'none',outfile:root+'preview.bundle.js'});
console.log('Imperial archer: existing V3 / PixiJS / GSAP bundle ready');
