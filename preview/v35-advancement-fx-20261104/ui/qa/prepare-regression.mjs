import fs from 'node:fs/promises';
const source=new URL('../../painted-v2/qa/verify.mjs',import.meta.url);
let code=await fs.readFile(source,'utf8');code=code.replace('verification.json','burst-regression.json');
await fs.writeFile(new URL('burst-regression.mjs',import.meta.url),'// Reuses the prior 16-burst regression suite; outputs are isolated in ui/qa.\n'+code);
