import {build} from 'esbuild';

await build({
  entryPoints:['preview/project-v-v3-live-style-event-fx-v2/source/live-style-event-fx-lab.src.js'],
  bundle:true,
  minify:true,
  format:'iife',
  target:['es2020'],
  legalComments:'none',
  outfile:'preview/project-v-v3-live-style-event-fx-v2/live-style-event-fx-lab.bundle.js'
});

console.log('built preview/project-v-v3-live-style-event-fx-v2/live-style-event-fx-lab.bundle.js');
