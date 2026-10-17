import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {X509Certificate,createHash} from 'node:crypto';

const root=new URL('../',import.meta.url);
const read=(path)=>readFileSync(new URL(path,root));
const json=(path)=>JSON.parse(read(path));
const twa=json('packaging/play-store/twa-manifest.json');
const info=json('packaging/play-store/registration.json');

test('Android app version uses Bubblewrap input schema, not an empty versionName',()=>{
  assert.match(twa.appVersion,/^\d+\.\d+\.\d+$/);
  assert.equal(Object.hasOwn(twa,'appVersionName'),false);
  assert.ok(Number.isSafeInteger(twa.appVersionCode)&&twa.appVersionCode>0);
  assert.equal(new URL(twa.startUrl,`https://${twa.host}`).origin,info.website.replace(/\/$/,''));
});

test('website association matches the real public signing certificate and package',()=>{
  const cert=new X509Certificate(read('packaging/play-store/upload-certificate.der'));
  const rows=json('.well-known/assetlinks.json');
  assert.equal(rows.length,1);
  assert.deepEqual(rows[0].relation,['delegate_permission/common.handle_all_urls']);
  assert.equal(rows[0].target.namespace,'android_app');
  assert.equal(rows[0].target.package_name,twa.packageId);
  assert.ok(rows[0].target.sha256_cert_fingerprints.includes(cert.fingerprint256));
  assert.ok(cert.subject.includes('CN=YAKCODE'));
  assert.ok(Date.parse(cert.validTo)>Date.now());
});

test('approved icon and corrected public contact are used',()=>{
  const iconPath=new URL(twa.iconUrl).pathname.slice(1);
  const brand=json('assets/ui/brand/reverse-call-20261016/manifest.json');
  const approvedIcon=brand.files.find(asset=>asset.file===iconPath);
  assert.ok(approvedIcon,'Android must use an approved current-brand icon');
  assert.equal(createHash('sha256').update(read(iconPath)).digest('hex'),approvedIcon.sha256);
  assert.equal(info.supportEmail,'elspe3821@gmail.com');
  for(const file of ['README.txt','store-listing.ko.txt','submission-checklist.ko.txt','data-safety-review.ko.txt']){
    const value=read(`packaging/play-store/${file}`).toString('utf8');
    assert.ok(value.includes(info.supportEmail),file);
    assert.equal(value.includes('entig5975@gmail.com'),false,file);
  }
  assert.equal(info.seasonPass,'DISCONTINUED');
  assert.equal(twa.fallbackType,'customtabs');
  assert.deepEqual(twa.features,{});
});
