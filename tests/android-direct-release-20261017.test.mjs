import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {X509Certificate} from 'node:crypto';
const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root));
const json=path=>JSON.parse(read(path));
const direct=json('packaging/android-direct/distribution.json');
const previous=json('packaging/play-store/twa-manifest.json');

test('DK APK upgrades the existing Android identity without requiring an uninstall',()=>{
  assert.equal(direct.packageId,previous.packageId);
  assert.ok(Number.isSafeInteger(direct.appVersionCode)&&direct.appVersionCode>previous.appVersionCode);
  assert.match(direct.appVersion,/^\d+\.\d+\.\d+$/);
  const certificate=new X509Certificate(read('packaging/play-store/upload-certificate.der'));
  assert.equal(direct.certificateSha256,certificate.fingerprint256);
  assert.ok(json('.well-known/assetlinks.json').some(row=>row.target.package_name===direct.packageId&&row.target.sha256_cert_fingerprints.includes(direct.certificateSha256)));
});

test('APK opens the existing HTTPS game and keeps the supplied DK post as its distribution destination',()=>{
  const launch=new URL(direct.startUrl,`https://${previous.host}`);
  assert.equal(launch.origin,'https://cnine-card.pages.dev');
  assert.equal(launch.searchParams.get('source'),'android');
  assert.equal(launch.searchParams.get('distribution'),'dk');
  assert.equal(direct.boardUrl,'https://www.playdk.kr/board/skm/1336497');
  assert.equal(direct.appName,json('manifest.webmanifest').short_name);
  assert.equal(direct.publication,'PREPARED_FOR_OPERATOR_UPLOAD');
  assert.equal(direct.filename,`ReverseCall-Android-${direct.appVersion}.apk`);
});
