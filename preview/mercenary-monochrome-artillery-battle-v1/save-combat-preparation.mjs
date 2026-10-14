import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {MONOCHROME_ARTILLERY_COMBAT_PREPARATION as plan} from './combat-preparation.mjs';
const file=p=>fileURLToPath(new URL(p,import.meta.url)),path='combat-preparation-20261015.json';
await fs.writeFile(file(path),JSON.stringify(plan,null,2)+'\n');
const manifest=JSON.parse(await fs.readFile(file('manifest.json'),'utf8'));
manifest.combatPreparation={file:path,module:'combat-preparation.mjs',status:plan.status,referenceCode:plan.referenceCode,basePower:plan.combat.basePower};
await fs.writeFile(file('manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log('Prepared Kairon parity: '+plan.combat.basePower+' power, shared combat/PVE balance; identity and runtime remain pending.');
