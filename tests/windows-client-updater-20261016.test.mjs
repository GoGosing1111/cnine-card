import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {ClientUpdater} from '../packaging/windows-client/lib/client-updater.mjs';

function fixture({version='0.1.6',available=true}={}){
  const updater=new EventEmitter(),states=[];let checks=0,downloads=0,installs=0,cancelled=false,blocked=false;
  updater.checkForUpdates=async()=>{checks++;return {isUpdateAvailable:available,updateInfo:{version},cancellationToken:{cancel(){cancelled=true;}}};};
  updater.downloadUpdate=async()=>{downloads++;updater.emit('download-progress',{transferred:5,total:10});return ['verified-installer.exe'];};
  updater.quitAndInstall=(silent,restart)=>{assert.equal(silent,true);assert.equal(restart,true);installs++;};
  const client=new ClientUpdater({updater,version:'0.1.5',onState:s=>states.push(s),canInstall:()=>!blocked});
  return {client,updater,states,counts:()=>({checks,downloads,installs,cancelled}),block:()=>{blocked=true;}};
}
test('downloads once, waits for explicit restart, and rejects duplicate installation',async()=>{
  const f=fixture();await Promise.all([f.client.check(),f.client.check()]);
  assert.equal(f.updater.autoDownload,false);assert.equal(f.updater.autoInstallOnAppQuit,false);
  assert.equal(f.updater.allowDowngrade,false);assert.equal(f.updater.allowPrerelease,false);assert.equal(f.updater.disableWebInstaller,true);
  assert.deepEqual(f.states.map(s=>s.status),['checking','downloading','downloading','ready']);
  assert.deepEqual(f.states[2].progress,{bytes:5,total:10});
  await f.client.check();assert.deepEqual(f.counts(),{checks:1,downloads:1,installs:0,cancelled:false});
  f.client.install();assert.equal(f.counts().installs,1);assert.equal(f.client.state.status,'installing');
  assert.throws(()=>f.client.install(),/먼저 준비/);
});
for(const [name,options] of Object.entries({same:{version:'0.1.5'},older:{version:'0.1.4'},prerelease:{version:'0.1.6-beta.1'},unavailable:{available:false},invalid:{version:'not-a-version'}})){
  test(`does not download ${name} releases`,async()=>{const f=fixture(options);await f.client.check();assert.equal(f.client.state.status,'current');assert.equal(f.counts().downloads,0);assert.throws(()=>f.client.install());});
}
test('game windows or resource operations prevent installation even after download',async()=>{
  const f=fixture();await f.client.check();f.block();assert.throws(()=>f.client.install(),/게임 창을 모두 닫고/);
  assert.equal(f.counts().installs,0);assert.equal(f.client.state.status,'ready');
});
test('failed checks and rejected downloads can retry without an installer handoff',async()=>{
  const f=fixture();const check=f.updater.checkForUpdates;
  f.updater.checkForUpdates=async()=>{throw Error('offline');};await f.client.check();assert.equal(f.client.state.status,'error');
  f.updater.checkForUpdates=check;const download=f.updater.downloadUpdate;
  f.updater.downloadUpdate=async()=>{f.updater.emit('error',Error('SHA512 mismatch'));throw Error('invalid file');};
  await f.client.check();assert.equal(f.client.state.status,'error');assert.throws(()=>f.client.install());assert.equal(f.counts().installs,0);
  f.updater.downloadUpdate=download;await f.client.check();assert.equal(f.client.state.status,'ready');
});
test('app exit cancels download and ignores late completion',async()=>{
  const f=fixture();let complete;f.updater.downloadUpdate=()=>new Promise(resolve=>{complete=resolve;});
  const pending=f.client.check();await new Promise(resolve=>setImmediate(resolve));f.client.stop();
  const count=f.states.length;complete(['late.exe']);await pending;
  assert.equal(f.counts().cancelled,true);assert.equal(f.states.length,count);assert.throws(()=>f.client.install());
});
test('installer startup failure restores the retryable error state',async()=>{
  const f=fixture();await f.client.check();f.updater.quitAndInstall=()=>f.updater.emit('error',Error('spawn failed'));
  f.client.install();assert.equal(f.client.state.status,'error');await f.client.check();assert.equal(f.client.state.status,'ready');
});
