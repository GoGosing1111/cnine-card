import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

test('installer staging preserves Korean as BOM-marked UTF-8 across repeated builds',async t=>{
  const root=fileURLToPath(new URL('../',import.meta.url));
  const build=await mkdtemp(path.join(os.tmpdir(),'soop-installer-encoding-'));
  t.after(()=>rm(build,{recursive:true,force:true}));
  const source=await readFile(path.join(root,'packaging/windows-client/LICENSE.txt'));
  const expected=new TextDecoder('utf-8',{fatal:true}).decode(source).replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n');
  for(let pass=0;pass<2;pass++){
    const staged=spawnSync(process.execPath,['scripts/build-windows-client.mjs',build,'--stage-only'],{cwd:root,encoding:'utf8'});
    assert.equal(staged.status,0,staged.stderr||staged.stdout);
    const config=JSON.parse(await readFile(path.join(build,'package.json'),'utf8'));
    const bytes=await readFile(path.join(build,config.build.nsis.license));
    assert.equal(bytes.subarray(0,3).toString('hex'),'efbbbf');
    const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes).replace(/\r\n/g,'\n');
    assert.equal(text,expected);
    assert.ok(text.startsWith('리버스콜 Windows 클라이언트'));
    assert.ok(text.includes('인터넷 연결과 기존 리버스콜 계정'));
    assert.ok(!text.includes('\uFFFD'));
    assert.equal((await readFile(path.join(build,config.build.nsis.include))).length>0,true);
  }
  assert.deepEqual(await readFile(path.join(root,'packaging/windows-client/LICENSE.txt')),source);
});
