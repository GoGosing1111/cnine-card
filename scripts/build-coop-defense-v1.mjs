import { build } from 'esbuild';
import { readFile, writeFile, stat, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { MERCENARIES, CARDS } from '../preview/coop-defense-v1/source/defense-model.mjs';
import {DEFENSE_ENEMIES,DEFENSE_DIFFICULTIES} from '../shared/monster-defense-v1.mjs';

const dir = 'preview/coop-defense-v1';
const roster = JSON.parse(await readFile('assets/ui/project-v/mercenaries/mercenary-system-roster-v1.json', 'utf8'));

const catalog = { schemaVersion: 2, status: 'TEST', background: '/assets/ui/project-v/battlefields/v3-siege-fortress-courtyard-v1.png', units: {}, enemies: {},difficulties:DEFENSE_DIFFICULTIES };
catalog.environment = { renderer: 'painted-sprites',
  staging: '/preview/coop-defense-v1/assets/lobby-v4/fortress-assembly-court.png',
  readyButton: '/preview/coop-defense-v1/assets/lobby-v4/ready-command-button.png',
  teleport: '/preview/coop-defense-v1/assets/teleport-v1/support-teleport.webp',
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
// Dedicated defense source art already faces left, toward the guardian stone.
for(const e of DEFENSE_ENEMIES)catalog.enemies[e.id]={...e,battleSprite:'/'+e.asset,artFacing:-1};
for(const [legacy,id]of Object.entries({NORMAL:'RIVET',RUNNER:'HOUND',ELITE:'BASTION',BOSS:'NOX',SLIME:'RIVET',FROG:'HOUND',STALKER:'RIVET',WATCHER:'VEIL',CROW:'HOUND',WRAITH:'WEAVER',OMEGA:'BASTION',WARDEN:'BASTION',SEAL_KING:'NOX',KRIEG:'NOX',FALLEN_LORD:'NOX',VAMPIRE:'NOX',ARKE:'NOX'}))catalog.enemies[legacy]=catalog.enemies[id];
catalog.workshop={modules:'/preview/defense-roguelike-v2/assets/trait-modules.png',chamber:'/preview/defense-roguelike-v2/assets/ui-v3/field-service-bay.png',button:'/preview/defense-roguelike-v2/assets/ui-v3/command-button.png',font:'/preview/defense-roguelike-v2/assets/ui-v3/SUIT-Variable.woff2',capsule:'/preview/defense-roguelike-v2/assets/supply-capsule-opening.png',reactor:'/preview/defense-roguelike-v2/assets/enhancement-reactor-cycle.png'};
catalog.uiSkin={selectionFrame:'/preview/coop-defense-v1/assets/formation-v1/selection-frame.png',nameplate:'/preview/coop-defense-v1/assets/ui-v5/squad-nameplate.png',panel:'/preview/coop-defense-v1/assets/ui-v5/guardian-panel.png',crest:'/preview/coop-defense-v1/assets/ui-v5/guardian-crest.png'};
const assetPaths = [...new Set([...Object.values(catalog.workshop),...Object.values(catalog.uiSkin),catalog.background, catalog.environment.teleport, catalog.environment.staging, catalog.environment.readyButton, catalog.environment.causeway, catalog.environment.core,
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
await writeFile(`${dir}/build-report.json`, JSON.stringify({ date: '2026-10-17', status: 'TEST',
  dependencies: Object.fromEntries(['pixi.js', 'gsap'].map(p => [p, lock.packages[`node_modules/${p}`].version])),
  bundleBytes: (await stat(`${dir}/defense.bundle.js`)).size, commonV3: inputs.filter(p => p.startsWith('preview/project-v-v3/')), assets }, null, 2) + '\n');
await mkdir('defense',{recursive:true});
const html=(await readFile(`${dir}/index.html`,'utf8')).replace('<html lang="ko">','<html lang="ko" data-defense-live="true">').replace('./defense.css','/'+dir+'/defense.css?v=20261017-defense-v3-merc1').replace('./workshop.css','/'+dir+'/workshop.css?v=20261017-defense-v3-merc1').replace('./staging.css','/'+dir+'/staging.css?v=20261017-defense-v3-merc1').replace('./image-skin.css','/'+dir+'/image-skin.css?v=defense-boss-hud-20261027-v1').replace('./formation.css','/'+dir+'/formation.css?v=20261017-defense-v3-merc1').replace('./rooms.css','/'+dir+'/rooms.css?v=20261017-defense-v3-merc1').replace('./defense.bundle.js','/'+dir+'/defense.bundle.js?v=20261018-defense-join1&generalJok=20261023-v15&prime=20261021-v1&zero=20261020-wings-live-v1&leonel=20261018-live-v1&jokro=20261018-live-v1&hudB=20261017-v1');
await writeFile('defense/index.html',html);await writeFile('defense/asset-catalog.json',JSON.stringify(catalog,null,2)+'\n');
console.log(`Built TEST defense: ${DEFENSE_DIFFICULTIES.length} difficulties, ${DEFENSE_ENEMIES.length} enemy resources, ${assets.length} original assets; one V3/PixiJS renderer.`);

await build({entryPoints:['preview/defense-roguelike-v2/preview.js'],outfile:'preview/defense-roguelike-v2/preview.bundle.js',bundle:true,minify:true,format:'iife',target:['es2022'],legalComments:'none'});
