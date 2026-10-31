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
jobs.push(['preview/coop-defense-v1/source/defense-app.js','preview/coop-defense-v1/defense.bundle.js']);
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
  // Rotate the delivery object after the first Omega Scrapyard blob timed out
  // on both production and its immutable Pages URL. Runtime bytes stay intact.
  const deliveryFooter = outfile === 'preview/scrapyard-v3-v1/battle.bundle.js' ? '\n/* delivery: awakened-omega-20261024-v1 */\n'
    : outfile === 'preview/project-v-mercenary-system-v1/skills.bundle.js' ? '\n/* delivery: mercenary-three-power-20261025-v1 */\n' : '';
  const bundle = result.outputFiles[0].text.replace(/[ \t]+$/gm, '') + deliveryFooter;
  await writeBundle(outfile, bundle);
  const inputs = Object.keys(result.metafile.inputs).map(p => p.replaceAll('\\', '/'));
  if (!inputs.includes('preview/project-v-v3/source/battle/OccupiedGridLayout.js')) throw new Error(`Missing common grid: ${outfile}`);
  if (outfile.includes('skill-chip-lab.bundle')) await writeFile('preview/battle-suit-skill-chip-v1/build-report.json', JSON.stringify({engineSource: entry,
    pixiCopies: inputs.filter(p => p.endsWith('/pixi.js/lib/index.mjs')).length, inputs: inputs.filter(p => !p.includes('node_modules')), outputBytes: Buffer.byteLength(bundle)}, null, 2) + '\n');
  outputs.push({file: outfile, sha256: hash(bundle), commonGrid: true,...(outfile==='preview/coop-defense-v1/defense.bundle.js'?{standaloneEngine:true}:{})});
}
// The live hunt uses twelve enemy slots. Keep its extension at the same runtime
// version as the common loader, which otherwise replaces it with the generic engine.
await import('./build-sustained-hunt-v2.mjs');
const huntBundle = 'preview/sustained-hunt-v2/battle.bundle.js';
outputs.push({file: huntBundle, sha256: hash(await readFile(huntBundle, 'utf8')), commonGrid: true});
const primeSources=['shared/mercenary-prime-requiem-v1.mjs','preview/project-v-v3/source/battle/PrimeRequiemCombatPlayback.js',...['PrimeRequiemFX.js','PrimeNeonRim.js','PrimeIdleAura.js','SkillPlan.mjs','MotionAtlas.mjs'].map(n=>'preview/prime-requiem-blood-skills-20261021-v1/source/'+n)];
const zeroSources=['shared/mercenary-zero-v1.mjs','preview/project-v-v3/source/battle/ZeroCombatPlayback.js','preview/mercenary-cyan-knight-battle-20261020-v1/source/KnightFX.js','preview/mercenary-cyan-knight-battle-20261020-v1/source/BodyMotion.mjs','preview/mercenary-cyan-knight-battle-20261020-v1/source/ZeroBladeWings.js','preview/mercenary-cyan-knight-battle-20261020-v1/motion.mjs','preview/mercenary-cyan-knight-battle-20261020-v1/array-motion-v4.mjs'];
const sources = [...await Promise.all([...primeSources,...zeroSources].map(async file=>({file,sha256:hash(await readFile(file,'utf8'))}))),{file:'preview/project-v-v3/source/battle/SkillEffectFX.js',sha256:hash(await readFile('preview/project-v-v3/source/battle/SkillEffectFX.js','utf8'))}];
for(const file of ['shared/mercenary-bathory-v1.mjs','preview/project-v-v3/source/battle/BathoryCombatPlayback.js','preview/mercenary-bathory-halloween-20261019-v1/source/BathoryFX.js','preview/mercenary-bathory-halloween-20261019-v1/motion.mjs'])sources.push({file,sha256:hash(await readFile(file,'utf8'))});
for(const file of ['shared/z-body-area-skill.mjs','shared/overlord-suit-v1.mjs'])sources.push({file,sha256:hash(await readFile(file,'utf8'))});
for(const file of ['preview/project-v-v3/source/battle/MercenaryDialogueProfiles.js','preview/project-v-v3/source/battle/JinmuDialogue.js','preview/project-v-v3/source/battle/KaironCombatPlayback.js','shared/mercenary-kairon-v1.mjs','preview/mercenary-black-uniform-dual-uzi-v1/source/UziBarrageFX.js','preview/mercenary-black-uniform-dual-uzi-v1/skill.mjs','preview/mercenary-black-uniform-dual-uzi-v1/bullet-flight.mjs','preview/mercenary-black-uniform-dual-uzi-v1/missile-flight.mjs','preview/mercenary-black-uniform-dual-uzi-v1/aura-registration.mjs','preview/project-v-v3/source/battle/JinmuCombatPlayback.js','shared/mercenary-jinmu-v1.mjs','preview/mercenary-golden-dragon-battle-v1/source/GoldenDragonFX.js','preview/mercenary-golden-dragon-battle-v1/skill.mjs','preview/project-v-v3/source/battle/HeliosSurroundingAura.js','preview/project-v-v3/source/battle/HeliosCombatPlayback.js','shared/mercenary-helios-v1.mjs','preview/mercenary-limited-solar-sword-20261009-v1/source/SolarFX.js','preview/mercenary-limited-solar-sword-20261009-v1/motion.mjs'])sources.push({file,sha256:hash(await readFile(file,'utf8'))});
for(const file of ['shared/mercenary-kangyun-v1.mjs','preview/project-v-v3/source/battle/KangyunCombatPlayback.js','preview/mercenary-imperial-archer-sss-v1/source/ImperialArcherFX.js','preview/mercenary-imperial-archer-sss-v1/skill.mjs'])sources.push({file,sha256:hash(await readFile(file,'utf8'))});
for(const file of ['shared/mercenary-azant-v1.mjs','preview/project-v-v3/source/battle/AzantCombatPlayback.js','preview/mercenary-sapphire-archmage-battle-v1/source/SapphireFX.js','preview/mercenary-sapphire-archmage-battle-v1/skill.mjs'])sources.push({file,sha256:hash(await readFile(file,'utf8'))});
sources.push({file:'preview/project-v-v3/source/battle/SXSuitCamera.js',sha256:hash(await readFile('preview/project-v-v3/source/battle/SXSuitCamera.js','utf8'))});
for(const file of ['preview/project-v-v3/source/battle/BerkanCombatPlayback.js','preview/mercenary-berkan-sss-v1/source/BerkanFX.js','preview/mercenary-berkan-sss-v1/skill.mjs','shared/mercenary-berkan-v1.mjs','preview/mercenary-berkan-area-v1/source/BerkanAreaFX.js','preview/mercenary-berkan-area-v1/skill.mjs'])sources.push({file,sha256:hash(await readFile(file,'utf8'))});
for(const file of ['preview/project-v-v3/source/battle/CryvernCombatPlayback.js','preview/mercenary-ice-crystal-dual-sword-v1/source/IceDualSwordFX.js','preview/mercenary-ice-crystal-dual-sword-v1/skill.mjs','shared/mercenary-cryvern-v1.mjs'])sources.push({file,sha256:hash(await readFile(file,'utf8'))});
for(const file of ['preview/project-v-v3/source/battle/NurseHealCombatPlayback.js','preview/mercenary-nurse-healers-ss-v1/source/NurseHealFX.js','preview/mercenary-nurse-healers-ss-v1/skill.mjs','shared/mercenary-nurse-healers-v1.mjs'])sources.push({file,sha256:hash(await readFile(file,'utf8'))});
for(const file of ['shared/mercenary-limited-visuals-v1.mjs','shared/mercenary-limited-visual-catalog-v1.mjs','shared/mercenary-limited-duo-20261008.mjs','shared/mercenary-limited-duo-assets-20261008.mjs','preview/project-v-v3/source/battle/LimitedDuoCombatPlayback.js','preview/mercenary-limited-ayoon-heeya-v3-20261008/skill.mjs'])sources.push({file,sha256:hash(await readFile(file,'utf8'))});
for(const file of ['preview/project-v-v3/source/battle/IconRolePlayback.js','preview/project-v-v3/source/battle/IconTechniquePlayback.js','shared/icon-roles-v1.mjs','shared/icon-role-visuals-v1.mjs'])sources.push({file,sha256:hash(await readFile(file,'utf8'))});
for(const file of ['shared/mercenary-shiranui-v1.mjs','preview/project-v-v3/source/battle/ShiranuiCombatPlayback.js','preview/project-v-v3/source/battle/ShiranuiSilverBallistics.js','preview/project-v-v3/source/battle/ShiranuiDialogueStyle.js','preview/mercenary-monochrome-artillery-battle-v1/source/BallisticArtilleryFX.js','preview/mercenary-monochrome-artillery-battle-v1/skill.mjs'])sources.push({file,sha256:hash(await readFile(file,'utf8'))});
for(const file of ['shared/mercenary-jokro-v1.mjs','preview/project-v-v3/source/battle/JokroCombatPlayback.js','preview/mercenary-jokro-iaido-20261017-v1/source/JokroFX.js','preview/mercenary-jokro-iaido-20261017-v1/source/JokroAwakeningFX.js','preview/mercenary-jokro-iaido-20261017-v1/source/JokroNeonRim.js','preview/mercenary-jokro-iaido-20261017-v1/skill.mjs'])sources.push({file,sha256:hash(await readFile(file,'utf8'))});
for(const file of ['shared/mercenary-leonel-v1.mjs','preview/project-v-v3/source/battle/LeonelCombatPlayback.js','preview/project-v-v3/source/battle/LeonelDialogueStyle.js','preview/mercenary-leonel-sss-limited-20261018-v2/source/LeonelFX.js','preview/mercenary-leonel-sss-limited-20261018-v2/source/LeonelWhiteRig.js','preview/mercenary-leonel-sss-limited-20261018-v2/motion.mjs'])sources.push({file,sha256:hash(await readFile(file,'utf8'))});
for(const file of ["shared/mercenary-general-jok-v1.mjs", "preview/project-v-v3/source/battle/GeneralJokCombatPlayback.js", "preview/mercenary-general-jok-battle-20261022-v1/skill.mjs", "preview/mercenary-general-jok-battle-20261022-v1/source/GeneralJokFX.js", "preview/mercenary-general-jok-battle-20261022-v1/source/GeneralJokArtillery.js", "preview/mercenary-general-jok-battle-20261022-v1/source/GeneralJokNaval.js", "preview/mercenary-general-jok-battle-20261022-v1/source/GeneralJokCritical.js", "preview/mercenary-general-jok-battle-20261022-v1/source/BombardmentVisuals.js", "preview/mercenary-general-jok-battle-20261022-v1/source/C9AuraFlag.js", "preview/mercenary-general-jok-battle-20261022-v1/source/GoldenRimFilter.js"])sources.push({file,sha256:hash(await readFile(file,'utf8'))});
for(const file of ['shared/mercenary-eunseol-v1.mjs','preview/project-v-v3/source/battle/EunseolCombatPlayback.js','preview/project-v-v3/source/battle/eunseol/SeolhwiFX.js','preview/project-v-v3/source/battle/eunseol/skills.mjs'])sources.push({file,sha256:hash(await readFile(file,'utf8'))});
for(const file of ['shared/mercenary-bloodmoon-combat-v1.mjs','preview/project-v-v3/source/battle/BloodmoonCombatPlayback.js','preview/mercenary-bloodmoon-battle-20261023-v1/source/BloodmoonFX.js','preview/mercenary-bloodmoon-battle-20261023-v1/source/PlaybackPlan.mjs','assets/ui/project-v/mercenaries/bloodmoon-live-20261025/manifest.json'])sources.push({file,sha256:hash(await readFile(file,'utf8'))});
for(const file of ['shared/mercenary-bloodmoon-namsudaeng-v1.mjs','preview/project-v-v3/source/battle/BloodmoonNamsudaengPlayback.js','preview/project-v-v3/source/battle/bloodmoon-namsudaeng/BloodmoonFX.js','preview/project-v-v3/source/battle/bloodmoon-namsudaeng/skills.mjs'])sources.push({file,sha256:hash(await readFile(file,'utf8'))});
for(const file of ['shared/mercenary-razak-v1.mjs','preview/project-v-v3/source/battle/RazakCombatPlayback.js','preview/project-v-v3/source/battle/razak/AssassinFX.js','preview/project-v-v3/source/battle/razak/skills.mjs'])sources.push({file,sha256:hash(await readFile(file,'utf8'))});
for(const file of ['shared/mercenary-awakened-omega-v1.mjs','preview/project-v-v3/source/battle/AwakenedOmegaCombatPlayback.js','preview/project-v-v3/source/battle/awakened-omega/OmegaEvolvedFX.js','preview/project-v-v3/source/battle/awakened-omega/skills.mjs','preview/project-v-v3/source/battle/awakened-omega/motion.mjs'])sources.push({file,sha256:hash(await readFile(file,'utf8'))});
for(const file of ['shared/mercenary-revan-v1.mjs','preview/project-v-v3/source/battle/RevanCombatPlayback.js','preview/project-v-v3/source/battle/revan/RevanFX.js','preview/project-v-v3/source/battle/revan/AtlasEdgeFilter.js','preview/project-v-v3/source/battle/revan/skill.mjs','assets/ui/project-v/mercenaries/revan-20261027/motion-manifest.json'])sources.push({file,sha256:hash(await readFile(file,'utf8'))});
const layoutClient = 'preview/v3-wide-grid-v1/app.bundle.js';
const layoutBuild=await build({entryPoints: ['preview/v3-wide-grid-v1/source/app.mjs'], outfile: layoutClient,write:false,
  bundle: true, minify: true, format: 'iife', target: ['es2022'], legalComments: 'none'});
await writeBundle(layoutClient,layoutBuild.outputFiles[0].text);
const layoutClients = [{file: layoutClient, sha256: hash(await readFile(layoutClient, 'utf8'))}];
sources.push({file:'shared/equipment-set-visual-v1.mjs',sha256:hash(await readFile('shared/equipment-set-visual-v1.mjs','utf8'))});
for (const name of ['EquipmentSetFX.js','BattleHud.js','BattleGroundStyle.mjs','BattleGroundSigil.js','PetSupportPresentation.mjs','PetSupportHud.js','PetOpeningFX.js','PetSupportLayout.mjs','PetSupportPlayback.js','CooperativeEncounter.js','CooperativeArkePlayback.js','ApocalypseLegionFX.js','ApocalypseLegionPlayback.js','BattleEngine.js', 'BattleCharacter.js', 'AccountBattleUnit.js','ZBodySwordAnimation.js','ZBodySwordModel.mjs','XBodySwordAnimation.js','XBodySwordModel.mjs','OverlordSuitModel.mjs','OverlordSuitAnimation.js','SXSuitAnimation.js','SXSuitModel.mjs','ZBodyDashProfile.mjs','ZBodyDashFX.mjs','ObjectPool.js', 'DamageCriticalFont.mjs', 'OccupiedGridLayout.js', 'FormationLayout.mjs', 'ViewportLayout.mjs','MercenaryCombatPlayback.js','LimitedMercenaryPlayback.js','MercenaryRoleAttackFX.js','ProjectileTrail.mjs']) {
  const file = `preview/project-v-v3/source/battle/${name}`;
  sources.push({file, sha256: hash(await readFile(file, 'utf8'))});
}
for(const name of ['MercenarySkillFX.js','RenderAuthoredSkill.js','RenderSSkill.js','MercenarySkillAudio.js','MercenaryAttachmentPoints.js']){
  const file=`preview/project-v-mercenary-system-v1/source/${name}`;
  sources.push({file,sha256:hash(await readFile(file,'utf8'))});
}
for(const file of ['preview/project-v-v3/source/battle/SniperOrikkungCombatPlayback.js','preview/mercenary-sniper-orikkung-v1/source/SniperOrikkungSkillFX.js','shared/mercenary-sniper-orikkung-v1.mjs','preview/project-v-v3/source/battle/HeukwolCombatPlayback.js','preview/mercenary-black-moon-swordsman-ss-v1/source/BlackMoonFX.js','preview/mercenary-black-moon-swordsman-ss-v1/skill.mjs','shared/mercenary-heukwol-v1.mjs','preview/project-v-mercenary-system-v1/source/MercenarySpriteSequence.js','preview/project-v-v3/source/battle/BikiniJoeunCombatPlayback.js','preview/mercenary-bikini-joeun-v1/source/BikiniJoeunSkillFX.js','shared/mercenary-bikini-joeun-v1.mjs','preview/project-v-v3/source/battle/RagnielCombatPlayback.js','preview/mercenary-ragniel-v1/source/RagnielSkillFX.js','preview/mercenary-ragniel-v1/skill.mjs','shared/mercenary-ragniel-v1.mjs','preview/project-v-v3/source/battle/MangisaCombatPlayback.js','preview/mercenary-mangisa-v1/source/MangisaSkillFX.js','preview/battle-suit-skill-chip-v1/source/SkillChipAudio.js','preview/project-v-mercenary-system-v1/skill-audio-v1.json','assets/ui/project-v/mercenaries/mercenary-attachment-points-v1.json'])sources.push({file,sha256:hash(await readFile(file,'utf8'))});
for(const file of ['shared/sx-suit-v1.mjs','preview/battle-suit-sx-v1/source/SXBodyFX.js','preview/battle-suit-sx-v1/source/SXTitle.js','preview/battle-suit-sx-v1/motion.mjs','preview/battle-suit-sx-v1/ultimate-v3/source/SXUltimateFX.js','preview/battle-suit-sx-v1/ultimate-v3/motion.mjs','shared/x-body-area-skill.mjs','preview/battle-suit-x-v1/source/XBodyFX.js','preview/battle-suit-x-v1/motion.mjs','preview/battle-suit-x-dragon-v1/source/DragonFX.js','preview/battle-suit-x-dragon-v1/motion.mjs','shared/battle-suit-skill-chips.mjs','preview/project-v-v3/source/battle/BattleSuitSkillChipPlayback.js',...['sequence.mjs','OctaSeekerFX.js','OctaSeekerAudio.js'].map(name=>'preview/battle-suit-octaseeker-v1/source/'+name)])sources.push({file,sha256:hash(await readFile(file,'utf8'))});
sources.push({file:'preview/project-v-v3/source/battle/BattleAssetMemory.mjs',sha256:hash(await readFile('preview/project-v-v3/source/battle/BattleAssetMemory.mjs','utf8'))});
for(const name of ['BattleDevicePolicy.mjs','BattleTextureLifecycle.mjs','SkillTimeline.js']){const file='preview/project-v-v3/source/battle/'+name;sources.push({file,sha256:hash(await readFile(file,'utf8'))});}
sources.push({file:'shared/battle-damage-font.mjs',sha256:hash(await readFile('shared/battle-damage-font.mjs','utf8'))});
for(const file of ['shared/mercenary-blackcrown-combat-v1.mjs','preview/project-v-v3/source/battle/BlackCrownCombatPlayback.js','preview/project-v-v3/source/battle/blackcrown/BlackCrownFX.js','preview/project-v-v3/source/battle/blackcrown/skills.mjs','assets/ui/project-v/mercenaries/black-crown-battle-20261027-v2/motion-manifest.json'])sources.push({file,sha256:hash(await readFile(file,'utf8'))});
for(const file of ['shared/mercenary-area-cutins-v1.mjs','preview/project-v-v3/source/battle/MercenaryAreaCutinPlayback.js','preview/project-v-v3/source/battle/MercenaryAreaDialogueStyle.js','preview/project-v-v3/source/battle/JinmuDialogue.js'])sources.push({file,sha256:hash(await readFile(file,'utf8'))});
for(const file of ['shared/mercenary-heukmu-v1.mjs','preview/project-v-v3/source/battle/HeukmuCombatPlayback.js',...['HeukmuFX.js','NeonPurpleRim.js','DragonAuraTint.js','AreaSkillFX.js','skills.mjs','spec.json'].map(n=>'preview/project-v-v3/source/battle/heukmu/'+n)])sources.push({file,sha256:hash(await readFile(file,'utf8'))});
await writeFile('preview/project-v-v3/grid-build-report.json', JSON.stringify({version: 'OCCUPIED_GRID_V1', layoutVersion: 'UNIFORM_LATTICE_V2', deployment: 'HELD_BY_USER', hashEncoding: 'UTF8_LF', sources, outputs, layoutClients}, null, 2) + '\n');
console.log(`Built ${outputs.length} V3 consumers with one shared grid. No deployment performed.`);
