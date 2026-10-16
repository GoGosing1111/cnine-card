import { build } from 'esbuild';
import { readFile, writeFile, stat, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { MERCENARIES, CARDS } from '../preview/coop-defense-v1/source/defense-model.mjs';
import {DEFENSE_ENEMIES,DEFENSE_DIFFICULTIES} from '../shared/monster-defense-v1.mjs';

const dir = 'preview/coop-defense-v1';
const roster = JSON.parse(await readFile('assets/ui/project-v/mercenaries/mercenary-system-roster-v1.json', 'utf8'));
const monsters = JSON.parse(await readFile('assets/ui/project-v/monsters/hunt-tower/manifest-v1.json', 'utf8'));
const catalog = { schemaVersion: 2, status: 'TEST', background: '/assets/ui/project-v/battlefields/v3-siege-fortress-courtyard-v1.png', units: {}, enemies: {},difficulties:DEFENSE_DIFFICULTIES };
catalog.environment = { renderer: 'painted-sprites',
  causeway: '/preview/coop-defense-v1/assets/fortress-causeway-v2.png',
  core: '/preview/coop-defense-v1/assets/guardian-crystal-v2.png' };
for (const entry of MERCENARIES) {
  const source = roster.cards.find(r => r.code === entry.code);
  if (!source?.battleSprite || !source.sourceArt) throw new Error(`Missing mercenary art: ${entry.code}`);
  catalog.units[entry.code] = { code: entry.code, name: source.name, sourceArt: `/${source.sourceArt}`, battleSprite: `/${source.battleSprite}`,
    footAnchor: source.battleSpriteFootAnchor || { x: .5, y: .98 } };
}
const cardArt = { FAKER: '/assets/cards/7777777.jpg', BONGJUN: '/assets/NEWCARD/8.jpg', TAEK: '/assets/pre/8.jpg' };
for (const entry of CARDS) catalog.units[entry.code] = { code: entry.code, name: entry.name, sourceArt: cardArt[entry.code], battleSprite: `/assets/ui/project-v/characters/${entry.sprite}` };
for(const e of DEFENSE_ENEMIES)catalog.enemies[e.id]={...e,battleSprite:'/'+e.asset};
for(const [legacy,id]of Object.entries({NORMAL:'SLIME',RUNNER:'FROG',ELITE:'OMEGA',BOSS:'KRIEG'}))catalog.enemies[legacy]=catalog.enemies[id];
const assetPaths = [...new Set([catalog.background, catalog.environment.causeway, catalog.environment.core,
  ...Object.values(catalog.units).flatMap(a => [a.sourceArt, a.battleSprite]), ...Object.values(catalog.enemies).map(a => a.battleSprite)])];
const assets = [];
for (const file of assetPaths) {
  const bytes = await readFile(file.slice(1));
  assets.push({ path: file, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
}
await writeFile(`${dir}/asset-catalog.json`, JSON.stringify(catalog, null, 2) + '\n');
const result = await build({ entryPoints: [`${dir}/source/defense-app.js`], outfile: `${dir}/defense.bundle.js`, bundle: true, minify: true,
  format: 'iife', target: ['es2022'], legalComments: 'none', metafile: true });
const inputs = Object.keys(result.metafile.inputs).map(s => s.replaceAll('\\', '/'));
for (const shared of ['BattleEngine.js', 'BattleCharacter.js', 'SkillEffectFX.js']) if (!inputs.includes(`preview/project-v-v3/source/battle/${shared}`)) throw new Error(`V3 reuse missing: ${shared}`);
if (inputs.filter(p => p.endsWith('/pixi.js/lib/index.mjs')).length !== 1) throw new Error('Expected one PixiJS renderer dependency');
const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
await writeFile(`${dir}/build-report.json`, JSON.stringify({ date: '2026-10-16', status: 'TEST',
  dependencies: Object.fromEntries(['pixi.js', 'gsap'].map(p => [p, lock.packages[`node_modules/${p}`].version])),
  bundleBytes: (await stat(`${dir}/defense.bundle.js`)).size, commonV3: inputs.filter(p => p.startsWith('preview/project-v-v3/')), assets }, null, 2) + '\n');
await mkdir('defense',{recursive:true});
const html=(await readFile(`${dir}/index.html`,'utf8')).replace('<html lang="ko">','<html lang="ko" data-defense-live="true">').replace('./defense.css','/'+dir+'/defense.css?v=20261016-test1').replace('./defense.bundle.js','/'+dir+'/defense.bundle.js?v=20261016-test1').replace('maxlength="6"','maxlength="12"').replace('6자리 코드','12자리 코드').replace('[a-fA-F0-9]{6}','[a-fA-F0-9]{12}');
await writeFile('defense/index.html',html);await writeFile('defense/asset-catalog.json',JSON.stringify(catalog,null,2)+'\n');
console.log(`Built TEST defense: ${DEFENSE_DIFFICULTIES.length} difficulties, ${DEFENSE_ENEMIES.length} enemy resources, ${assets.length} original assets; one V3/PixiJS renderer.`);
