// Baseline source revision pinned for reproducible existing-failure evidence.
import {registerHooks} from 'node:module';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=process.cwd(),files=new Set(['functions/_battle_v2_preview.js','functions/_mercenary_combat.js','functions/_mercenary_account.js','functions/_mercenary_equipment.js','shared/mercenary-combat-link-v2103.mjs']);
registerHooks({load(url,context,nextLoad){
 if(url.startsWith('file:')){const relative=path.relative(root,fileURLToPath(url)).replaceAll('\\','/');
  if(files.has(relative))return {format:'module',source:execFileSync('git',['show','8f6c207745ff260c45d1e4ee63ab39016fcc27f5:'+relative],{cwd:root,encoding:'utf8',maxBuffer:16*1024*1024}),shortCircuit:true};
 }
 return nextLoad(url,context);
}});
