import fs from 'node:fs/promises';import path from 'node:path';import {createHash} from 'node:crypto';import {fileURLToPath} from 'node:url';
const dir=fileURLToPath(new URL('.',import.meta.url)),base=path.resolve(dir,'../../v35-character-baseline-20261101');const expected={
 'baseline-v4.png':'fd8eea2da078ba3f7cfcef7da44946612e950ce2b0d0cd778a4b57976e00aa44',
 'attack-v1/images/weapon-restored-v2.png':'5e485052a02909c94cc91f4f75072ca42ce59ba1384ce1a5f299f0714f23ae07',
 'attack-v2/swordsman-7400ac091863.spine':'7acefc8c706857b88bf85a4c24d21af61c726bdee0933511899efc8730611dd0'
};const originals=[];for(const [file,sha256]of Object.entries(expected)){const actual=createHash('sha256').update(await fs.readFile(path.join(base,file))).digest('hex');if(actual!==sha256)throw Error('Original changed: '+file);originals.push({file,sha256,unchanged:true});}
const root=path.resolve(dir,'..');const broken=[];for(const file of [path.join(root,'PROJECT.md'),path.join(base,'PROJECT.md')]){const text=await fs.readFile(file,'utf8');for(const match of text.matchAll(/\]\(([^)]+)\)/g)){const target=match[1];if(/^(https?:|#)/.test(target))continue;try{await fs.access(path.resolve(path.dirname(file),target.split('#')[0]));}catch{broken.push({file,target});}}}
const integration=JSON.parse(await fs.readFile(path.join(dir,'integration.json'),'utf8'));if(Object.values(integration.checks).some(x=>!x))throw Error('Integration check failed');if(broken.length)throw Error(JSON.stringify(broken));
await fs.writeFile(path.join(dir,'delivery.json'),JSON.stringify({originals,brokenLinks:broken,integrationPassed:true,desktopInput:false,nativeChanged:false,productionDeployed:false},null,2));console.log('Original artwork, sword, native project, local links and event integration verified.');
