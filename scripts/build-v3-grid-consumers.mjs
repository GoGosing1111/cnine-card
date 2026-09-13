import {build} from 'esbuild';
import {readFile, writeFile} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';

// Code bundles only. Never regenerate approved art, atlases, sound, or payloads.
const entry = 'preview/project-v-v3/source/project-v-pixi-battle.src.js';
const jobs = [
  [entry, 'preview/project-v-v3/project-v-pixi-battle.bundle.js'],
  [entry, 'preview/scrapyard-v3-v1/battle.bundle.js', 'preview/scrapyard-v3-v1/source/ScrapyardBattleEngine.js'],
  [entry, 'preview/cow-room-v3-v1/battle.bundle.js', 'preview/cow-room-v3-v1/source/CowBattleEngine.js'],
  [entry, 'preview/infinite-tower-v3-v1/battle.bundle.js', 'preview/infinite-tower-v3-v1/source/TowerBattleEngine.js'],
  [entry, 'pve-v3/battle.bundle.js', 'pve-v3/BattleEngine.js'],
  [entry, 'preview/v3-wide-grid-v1/battle.bundle.js', 'preview/v3-wide-grid-v1/source/WideGridBattleEngine.js'],
  ['preview/boss-resources-v2048/lab.src.js', 'preview/boss-resources-v2048/lab.bundle.js'],
  ['preview/battle-suit-skill-chip-v1/source/skill-chip-lab.src.js', 'preview/battle-suit-skill-chip-v1/skill-chip-lab.bundle.js'],
  ['preview/project-v-mercenary-system-v1/source/skills-lab.src.js', 'preview/project-v-mercenary-system-v1/skills.bundle.js']
];
const outputs = [];
const hash = value => createHash('sha256').update(value.replace(/\r\n/g, '\n')).digest('hex');
async function writeBundle(file, contents) {
  for (let attempt = 0; ; attempt++) {
    try {await writeFile(file, contents); return;}
    catch (error) {
      // Windows scanners/read-only preview streams may briefly hold a bundle.
      if (attempt >= 6 || !['EPERM', 'EBUSY', 'EACCES', 'UNKNOWN'].includes(error.code)) throw error;
      await delay(100 * (attempt + 1));
    }
  }
}
for (const [entryPoint, outfile, constructor] of jobs) {
  const result = await build({entryPoints: [entryPoint], outfile, write: false, bundle: true, minify: true, format: 'iife', target: ['es2022'], legalComments: 'none', metafile: true,
    define:{__CNINE_NATIVE_CONTINUOUS__:String(outfile==='preview/project-v-v3/project-v-pixi-battle.bundle.js')},
    plugins: constructor ? [{name: 'existing-content-extension', setup(bundler) {
      bundler.onResolve({filter: /battle\/BattleEngine\.js$/}, args => {
        if (args.importer.replaceAll('\\', '/').endsWith('/project-v-pixi-battle.src.js')) return {path: path.resolve(constructor)};
      });
    }}] : []});
  const bundle = result.outputFiles[0].text.replace(/[ \t]+$/gm, '');
  await writeBundle(outfile, bundle);
  const inputs = Object.keys(result.metafile.inputs).map(p => p.replaceAll('\\', '/'));
  if (!inputs.includes('preview/project-v-v3/source/battle/OccupiedGridLayout.js')) throw new Error(`Missing common grid: ${outfile}`);
  if (outfile.includes('skill-chip-lab.bundle')) await writeFile('preview/battle-suit-skill-chip-v1/build-report.json', JSON.stringify({engineSource: entry,
    pixiCopies: inputs.filter(p => p.endsWith('/pixi.js/lib/index.mjs')).length, inputs: inputs.filter(p => !p.includes('node_modules')), outputBytes: Buffer.byteLength(bundle)}, null, 2) + '\n');
  outputs.push({file: outfile, sha256: hash(bundle), commonGrid: true});
}
const sources = [];
const layoutClient = 'preview/v3-wide-grid-v1/app.bundle.js';
await build({entryPoints: ['preview/v3-wide-grid-v1/source/app.mjs'], outfile: layoutClient,
  bundle: true, minify: true, format: 'iife', target: ['es2022'], legalComments: 'none'});
const layoutClients = [{file: layoutClient, sha256: hash(await readFile(layoutClient, 'utf8'))}];
for (const name of ['BattleEngine.js', 'BattleCharacter.js', 'ObjectPool.js', 'OccupiedGridLayout.js', 'FormationLayout.mjs', 'ViewportLayout.mjs','MercenaryCombatPlayback.js','MercenaryRoleAttackFX.js']) {
  const file = `preview/project-v-v3/source/battle/${name}`;
  sources.push({file, sha256: hash(await readFile(file, 'utf8'))});
}
for(const name of ['MercenarySkillFX.js','RenderAuthoredSkill.js','RenderSSkill.js','MercenarySkillAudio.js','MercenaryAttachmentPoints.js']){
  const file=`preview/project-v-mercenary-system-v1/source/${name}`;
  sources.push({file,sha256:hash(await readFile(file,'utf8'))});
}
for(const file of ['preview/battle-suit-skill-chip-v1/source/SkillChipAudio.js','preview/project-v-mercenary-system-v1/skill-audio-v1.json','assets/ui/project-v/mercenaries/mercenary-attachment-points-v1.json'])sources.push({file,sha256:hash(await readFile(file,'utf8'))});
await writeFile('preview/project-v-v3/grid-build-report.json', JSON.stringify({version: 'OCCUPIED_GRID_V1', layoutVersion: 'UNIFORM_LATTICE_V2', deployment: 'HELD_BY_USER', hashEncoding: 'UTF8_LF', sources, outputs, layoutClients}, null, 2) + '\n');
console.log(`Built ${outputs.length} V3 consumers with one shared grid. No deployment performed.`);
