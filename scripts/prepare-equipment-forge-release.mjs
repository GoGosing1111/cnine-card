// Offline compiler only: never connects to a database, activates a flag or deploys.
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {validateEquipmentForgeRelease} from '../functions/_equipment_forge_release.js';
import {EQUIPMENT_FORGE_RELEASE_KEY} from '../shared/equipment-forge-release-v1.mjs';
import {FORGE_RUNTIME_KEY} from '../shared/equipment-forge-policy-v1.mjs';
import {jointHash} from '../functions/_joint_transactions.js';
const [input,output]=process.argv.slice(2);
if(!input||!output)throw Error('Usage: node scripts/prepare-equipment-forge-release.mjs APPROVED_DOCUMENT.json OUTPUT.sql (offline only)');
const document=JSON.parse(readFileSync(resolve(input),'utf8'));validateEquipmentForgeRelease(document);
const envelope=JSON.stringify({document,sha256:await jointHash(document)}),quote=v=>"'"+String(v).replaceAll("'","''")+"'",policy=JSON.stringify(document.policy);
const sql=`-- Offline candidate only. Keep code gate and public execution OFF until final approval/deployment.
BEGIN;
DO $forge$
BEGIN
 PERFORM 1 FROM app_meta WHERE key IN (${quote(FORGE_RUNTIME_KEY)},'equipment_forge_public_settings_v1',${quote(EQUIPMENT_FORGE_RELEASE_KEY)}) FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM app_meta WHERE key=${quote(FORGE_RUNTIME_KEY)} AND value::jsonb=${quote(policy)}::jsonb) THEN RAISE EXCEPTION 'CMS policy changed or incomplete; recapture and reverify'; END IF;
 IF EXISTS(SELECT 1 FROM app_meta WHERE key='equipment_forge_public_settings_v1' AND value::jsonb->>'executionMode'='ON') THEN RAISE EXCEPTION 'Expected execution OFF'; END IF;
 IF EXISTS(SELECT 1 FROM app_meta WHERE key=${quote(EQUIPMENT_FORGE_RELEASE_KEY)} AND value::jsonb<>${quote(envelope)}::jsonb) THEN RAISE EXCEPTION 'Existing release document differs; never overwrite'; END IF;
 INSERT INTO app_meta(key,value,updated_at) VALUES(${quote(EQUIPMENT_FORGE_RELEASE_KEY)},${quote(envelope)},CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING;
 INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data)
 SELECT ${document.approvedBy},'EQUIPMENT_FORGE_RELEASE_PREPARE','APP_META',${quote(EQUIPMENT_FORGE_RELEASE_KEY)},NULL,${quote(envelope)}
 WHERE NOT EXISTS(SELECT 1 FROM admin_logs WHERE action_type='EQUIPMENT_FORGE_RELEASE_PREPARE' AND target_id=${quote(EQUIPMENT_FORGE_RELEASE_KEY)} AND after_data=${quote(envelope)});
END $forge$;
COMMIT;
`;
writeFileSync(resolve(output),sql);console.log('Offline SQL candidate written. No database, deployment or activation performed.');
