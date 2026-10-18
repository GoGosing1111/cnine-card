import path from 'node:path';
import {fileURLToPath} from 'node:url';
const absolute=path.dirname(fileURLToPath(import.meta.url));
// Only a caller explicitly selecting this plugin receives the draft boss.
export const reviewPlugin={name:'sahyeon-isolated-review',setup(b){
 const route=(name,to)=>b.onResolve({filter:new RegExp(name.replaceAll('.','\\.')+'$')},a=>a.importer===path.join(absolute,to)?undefined:{path:path.join(absolute,to)});
 route('apocalypse-legion-v1.mjs','review-catalog.mjs');
 route('ApocalypseLegionPlayback.js','playback.mjs');
 route('ApocalypseLegionFX.js','fx-bridge.mjs');
}};
