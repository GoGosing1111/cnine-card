import {registerHooks} from 'node:module';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const files=['functions/_battle_v2_preview.js','functions/_mercenary_combat.js','shared/mercenary-combat-link-v2103.mjs','shared/mercenary-razak-v1.mjs'];
const sources=new Map(files.map(f=>[path.resolve(f).toLowerCase(),execFileSync('git',['show','c301ad690:'+f],{encoding:'utf8',windowsHide:true,maxBuffer:4e6})]));
registerHooks({load(url,context,next){if(url.startsWith('file:')){const source=sources.get(fileURLToPath(url).toLowerCase());if(source)return {format:'module',source,shortCircuit:true};}return next(url,context);}});
