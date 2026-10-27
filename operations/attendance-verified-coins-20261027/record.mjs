import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';

// Records this operation on a separate branch without switching the shared checkout.
const directory = path.resolve(process.argv[2]);
const scope = 'operations/attendance-verified-coins-20261027';
const branch = 'codex/attendance-verified-coins-20261027';
const run = (args, options = {}) => execFileSync('git', args, {encoding: 'utf8', windowsHide: true, ...options}).trim();
const base = run(['rev-parse', 'origin/main']);
const files = fs.readdirSync(scope).filter(name => fs.statSync(path.join(scope, name)).isFile()).map(name => scope + '/' + name).sort();
const indexPath = path.join(directory, 'scoped-git-v2.index');
assert.equal(fs.existsSync(indexPath), false, 'Do not overwrite the previous recording index');
const env = {...process.env, GIT_INDEX_FILE: indexPath};
run(['read-tree', base], {env});
run(['add', '--', ...files], {env});
const changed = run(['diff', '--cached', '--name-only', base], {env}).split(/\r?\n/).filter(Boolean).sort();
assert.deepEqual(changed, files, 'Only this operation may enter the record commit');
run(['diff', '--cached', '--check', base], {env});
const tree = run(['write-tree'], {env});
const commit = run(['commit-tree', tree, '-p', base], {input: 'ops: deliver verified attendance tier coin messages [CF-Pages-Skip]\n'});
run(['update-ref', 'refs/heads/' + branch, commit, '0000000000000000000000000000000000000000']);
const hashes = Object.fromEntries(files.map(file => [file, createHash('sha256').update(fs.readFileSync(file)).digest('hex')]));
fs.writeFileSync(path.join(directory, 'source-record.json'), JSON.stringify({base, branch, commit, files: hashes, recordedAt: new Date().toISOString()}, null, 2) + '\n', {flag: 'wx'});
console.log(JSON.stringify({base, branch, commit, files: changed}));
