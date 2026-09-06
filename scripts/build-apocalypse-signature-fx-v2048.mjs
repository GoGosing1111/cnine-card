// Pack authored RGBA sheets with the existing V3 atlas pipeline. No generated
// geometry, recoloring, background removal or substitute effect artwork.
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildEffect} from './build-v3-live-style-event-fx-v2.mjs';
import {APOCALYPSE_SIGNATURE_SKILLS} from '../shared/apocalypse-boss-skills-v2048.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const outputRoot=path.join(root,'assets/ui/project-v/fx/apocalypse-signature-v2048');
for(const skill of Object.values(APOCALYPSE_SIGNATURE_SKILLS)){
  const result=await buildEffect({id:skill.asset,label:skill.code,labelKo:skill.name,fps:18,collisionFrame:6,anchors:{x:.5,y:.72}},{sourceRoot:outputRoot,outputRoot,generatedAt:'2026-09-06'});
  console.log(JSON.stringify(result));
}
