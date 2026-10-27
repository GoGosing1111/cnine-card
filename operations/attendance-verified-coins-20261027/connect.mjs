import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import pg from 'pg';

export const safeError = error => ({
  error: String(error.message).replace(/postgres(?:ql)?:\/\/\S+/g, '[connection withheld]'),
  code: error.code,
});

export async function connect() {
  const raw = execFileSync(process.execPath, [
    'C:/Users/User/AppData/Local/npm-cache/_npx/74274893b9fe65d3/node_modules/neonctl/bin/cli.js',
    'connection-string', 'br-misty-hat-az5in4f4', '--project-id', 'purple-king-54735192',
    '--database-name', 'cnine', '--role-name', 'cnine_migrator', '--ssl', 'verify-full',
  ], {encoding: 'utf8', timeout: 30000, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']});
  const connectionString = raw.trim().replace(/^['"]|['"]$/g, '');
  const uri = new URL(connectionString);
  assert.ok(uri.hostname.endsWith('.neon.tech') && uri.pathname === '/cnine');
  const db = new pg.Client({connectionString, application_name: 'attendance-verified-coins-20261027', connectionTimeoutMillis: 15000});
  await db.connect();
  return db;
}
