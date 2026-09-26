import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {MERCENARY_CMS_SEED as seed} from '../../../functions/_mercenary_cms_seed.js';
import {prepareBerkanCandidate} from './registration.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),project=path.resolve(root,'../..');
const manifest=JSON.parse(await fs.readFile(path.join(root,'manifest.json'),'utf8')),candidate=prepareBerkanCandidate(seed,manifest);
await fs.writeFile(path.join(root,'release/candidate.json'),JSON.stringify(candidate,null,2)+'\n');
const roster=JSON.parse(await fs.readFile(path.join(project,'assets/ui/project-v/mercenaries/mercenary-system-roster-v1.json'),'utf8'));
if(!roster.cards.some(c=>c.code===manifest.code)){roster.cards.push(candidate.registration.card);for(const key of ['total','sourceArtReady','battleSpriteReady'])roster.summary[key]++;}
await fs.writeFile(path.join(root,'release/roster.json'),JSON.stringify(roster,null,2)+'\n');
console.log(JSON.stringify({code:manifest.code,name:manifest.name,rank:manifest.rank,candidateCards:candidate.catalog.cards.length,runtimeEnabled:manifest.runtimeEnabled,proposedAssignment:candidate.registration.proposedAssignment}));
