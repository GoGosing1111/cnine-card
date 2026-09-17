import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
export const previewExtension={name:'z-dash-preview-extension',setup(bundler){
  bundler.onLoad({filter:/ZBodySwordAnimation\.js$/},async args=>{
    let source=await readFile(args.path,'utf8');
    const needle="const sequence=batch.mode==='area'?Z_SWORD.cast.sequence:Z_SWORD.attack.sequences.dash";
    if(source.split(needle).length!==2)throw Error('Production controller changed; inspect preview extension.');
    source=source.replace('export class ZBodySwordAnimation','class ZBodySwordAnimationBase').replace(needle,"const sequence=batch.mode==='area'?Z_SWORD.cast.sequence:(this.dashProfile==='legacy'?Z_SWORD.attack.sequences.dash:DASH_V2_SEQUENCE)");
    source+='\nimport {DASH_V2_SEQUENCE} from '+JSON.stringify(path.join(here,'source/DashProfile.mjs'))+';\nimport {withDashV2} from '+JSON.stringify(path.join(here,'source/withDashV2.mjs'))+';\nexport const ZBodySwordAnimation=withDashV2(ZBodySwordAnimationBase);\n';
    return{contents:source,loader:'js',resolveDir:path.dirname(args.path)};
  });
}};
