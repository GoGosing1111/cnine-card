// Historical draft/TEST-mode contracts still matter for rollback. Exercise
// them in a held in-memory bundle; production defaults and full ON behavior
// are tested directly by equipment-forge-release/readiness-20260922.
import {build} from 'esbuild';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const result=await build({stdin:{contents:`
 export * from './functions/_equipment_forge_transactions.js';
 export * from './functions/_equipment_forge_routes.js';
 export * from './functions/_equipment_forge_cms.js';
 export * from './functions/_forge_tower_protection.js';
 export * from './functions/_equipment_forge_release.js';
 export * from './functions/_forge_protection_drop.js';
`,resolveDir:fileURLToPath(new URL('../../',import.meta.url))},bundle:true,write:false,format:'esm',platform:'node',
 plugins:[{name:'isolated-held-forge',setup(b){b.onLoad({filter:/equipment-forge-release-v1\.mjs$/},args=>({contents:readFileSync(args.path,'utf8').replace('EQUIPMENT_FORGE_RELEASE_ENABLED=true','EQUIPMENT_FORGE_RELEASE_ENABLED=false'),loader:'js'}));}}]});
const runtime=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
export const {forgeQuote,executeForge,forgeReceipt,forgeEquipmentBonus,forgeEquipmentBonuses,forgeAccountState,saveForgeRuntime,readForgeRuntime,handleForgeRuntime,handleForgeRuntimeReady,forgeAdminState,prepareTowerForgeProtectionClear,readReleasedForgePolicy,planForgeProtectionDrop}=runtime;
