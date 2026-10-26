// Local measurement only: replace one combat profile in memory, never live files.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {registerHooks} from 'node:module';
const file=path.resolve('shared/mercenary-razak-v1.mjs').toLowerCase();
const candidate=JSON.parse(fs.readFileSync(process.env.RAZAK_CANDIDATE_FILE,'utf8'));
registerHooks({load(url,context,next){
 if(url.startsWith('file:')&&fileURLToPath(url).toLowerCase()===file){
  const original=fs.readFileSync(file,'utf8'),pattern=/export const RAZAK_COMBAT=Object.freeze\(\{[\s\S]*?\r?\n\}\);/;
  if(!pattern.test(original))throw Error('Profile boundary changed');
  return {format:'module',shortCircuit:true,source:original.replace(pattern,'export const RAZAK_COMBAT=Object.freeze('+JSON.stringify(candidate)+');')};
 }
 return next(url,context);
}});
