import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const previewRoot=path.dirname(fileURLToPath(import.meta.url));

await build({
  entryPoints:[path.join(previewRoot,'source','advancement-fx-preview.src.js')],
  outfile:path.join(previewRoot,'advancement-fx-preview.bundle.js'),
  bundle:true,
  minify:true,
  format:'iife',
  platform:'browser',
  target:['chrome110','safari16'],
  legalComments:'none',
  sourcemap:false
});

console.log('built preview/project-v-advancement-fx-v1/advancement-fx-preview.bundle.js');
