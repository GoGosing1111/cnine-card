import test from 'node:test';
import assert from 'node:assert/strict';
import {validateHeaderValue} from 'node:http';
import {readFile} from 'node:fs/promises';
import {windowsUserAgent} from '../packaging/windows-client/lib/user-agent.mjs';

test('localized display name stays separate from an ASCII HTTP product token',async()=>{
  const config=JSON.parse(await readFile(new URL('../packaging/windows-client/package.json',import.meta.url),'utf8'));
  const agent=windowsUserAgent({chrome:'152.0.7982.233',electron:'44.7.2'});
  assert.equal(config.productName,'리버스콜');
  assert.match(agent,/^[\x20-\x7e]+$/);
  assert(agent.includes(` Reversecall/${config.version} `));
  assert(agent.includes('Chrome/152.0.7982.233 Electron/44.7.2'));
  assert.doesNotThrow(()=>validateHeaderValue('User-Agent',agent));
  assert.equal(new Headers({'User-Agent':agent}).get('User-Agent'),agent);
  assert.throws(()=>validateHeaderValue('User-Agent',`리버스콜/${config.version}`));
});

test('malformed or localized runtime versions cannot enter a header',()=>{
  for(const invalid of [undefined,'','한글','44.7.2\r\nX-Injected: yes','44.7.2 extra']) {
    assert.throws(()=>windowsUserAgent({chrome:invalid,electron:'44.7.2'}),/Invalid User-Agent/);
    assert.throws(()=>windowsUserAgent({chrome:'152.0.7982.233',electron:invalid}),/Invalid User-Agent/);
  }
});
