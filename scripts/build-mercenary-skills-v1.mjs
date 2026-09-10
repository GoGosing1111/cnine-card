import {build} from 'esbuild';
await build({entryPoints:['preview/project-v-mercenary-system-v1/source/skills-lab.src.js'],bundle:true,minify:true,format:'iife',target:['es2022'],legalComments:'none',outfile:'preview/project-v-mercenary-system-v1/skills.bundle.js'});
console.log('Mercenary skills preview built with the shared V3 engine. Live bundle unchanged.');
