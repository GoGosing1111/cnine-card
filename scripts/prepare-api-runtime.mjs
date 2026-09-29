import {execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {productionHyperdriveId} from './verify-hyperdrive-cache.mjs';

const ACCOUNT = '1e7c59450a8b6e34a9d87f92ca02aeaa';
export function validateApiRuntimeConfig(pages, text) {
  const config = JSON.parse(text);
  productionHyperdriveId(pages, text);
  if (config.name !== 'cnine-card-api-runtime' || config.account_id !== ACCOUNT
      || config.placement?.region !== 'aws:ap-southeast-1'
      || config.workers_dev !== false || config.preview_urls !== false
      || (config.routes || []).length) throw Error('API runtime must remain private and pinned near the production database.');
  if (!/\[\[services\]\]\s*binding\s*=\s*"API_RUNTIME"\s*service\s*=\s*"cnine-card-api-runtime"/.test(pages)) {
    throw Error('Pages must forward to the reviewed API runtime service.');
  }
  const lock = config.durable_objects?.bindings?.find(b => b.name === 'USER_LOCK');
  if (lock?.script_name !== 'cnine-card-user-lock' || lock?.class_name !== 'UserMutationLock') {
    throw Error('API runtime must preserve the existing user mutation lock.');
  }
  const database = config.d1_databases?.filter(b => b.binding === 'DB');
  const originalDatabase = pages.match(/database_id\s*=\s*"([a-f0-9-]+)"/)?.[1];
  if (database?.length !== 1 || !originalDatabase || database[0].database_id !== originalDatabase) {
    throw Error('API runtime must preserve the existing D1 rollback database.');
  }
  return config;
}

export async function prepareApiRuntime({wrangler, env, root = process.cwd(), inspect = execFileSync, fetcher = fetch, log = console.log}) {
  const configPath = join(root, 'workers/api-runtime/wrangler.jsonc');
  const config = validateApiRuntimeConfig(readFileSync(join(root, 'wrangler.toml'), 'utf8'), readFileSync(configPath, 'utf8'));
  let token;
  try {
    const auth = JSON.parse(inspect(process.execPath, [wrangler, 'auth', 'token', '--json'],
      {encoding: 'utf8', env, stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000}));
    token = auth.token || auth.apiToken || auth.oauthToken;
    if (!token) throw Error();
  } catch { throw Error('Cannot verify the private API runtime credentials.'); }
  const get = async path => {
    const response = await fetcher(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}${path}`,
      {headers: {Authorization: `Bearer ${token}`}});
    const body = await response.json();
    if (!response.ok || !body.success) throw Error('Cannot verify the private API runtime settings.');
    return body.result;
  };
  const state = async () => {
    const [pages, worker] = await Promise.all([
      get('/pages/projects/cnine-card'), get(`/workers/scripts/${config.name}/settings`)
    ]);
    const production = pages.deployment_configs?.production || {};
    return {
      pagesKey: production.env_vars?.API_RUNTIME_KEY?.type === 'secret_text',
      workerKey: worker.bindings?.some(b => b.name === 'API_RUNTIME_KEY' && b.type === 'secret_text'),
      active: !!production.services?.API_RUNTIME
    };
  };
  const before = await state();
  if (before.pagesKey && before.workerKey) {
    log('[API RUNTIME OK] Private service credentials are present.');
    return {created: false};
  }
  // Bootstrap only while Pages still runs locally. Never silently rotate an
  // active service's transport key or expose existing Pages application secrets.
  if (before.active) throw Error('An active API runtime is missing its transport key; deployment blocked.');
  const secret = randomBytes(32).toString('base64');
  const set = args => {
    try {
      inspect(process.execPath, [wrangler, ...args], {input: secret + '\n', encoding: 'utf8', env,
        stdio: ['pipe', 'pipe', 'pipe'], timeout: 30000});
    } catch { throw Error('API runtime key initialization failed before Pages cutover; retry the deployment.'); }
  };
  set(['secret', 'put', 'API_RUNTIME_KEY', '--config', configPath]);
  set(['pages', 'secret', 'put', 'API_RUNTIME_KEY', '--project-name', 'cnine-card']);
  const after = await state();
  if (!after.pagesKey || !after.workerKey) throw Error('API runtime key initialization could not be verified.');
  log('[API RUNTIME OK] Private service key initialized; existing application secrets stay in Pages.');
  return {created: true};
}
