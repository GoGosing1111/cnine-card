import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const generatedRoot = 'C:/Users/User/.codex/generated_images/01a11cc1-7cc4-7c03-bfb4-adcdd3f402dd';
const sources = {
  'V-990': ['exec-99847ed7-5bbd-406e-80a1-56515c319ba2.png'],
  'V-991': ['exec-dd4342a8-3bf8-4b37-b4c1-4d8d807c3a65.png', 'exec-f90c4b2b-5bd3-4728-9e17-ad3ac7efb59d.png'],
  'V-998': ['exec-e514ec58-4afc-4d90-b6ae-5f0c3fa13476.png'],
  'V-993': ['exec-3e244745-0dfd-47d6-ba07-c1eb3f0b5587.png'],
  'V-994': ['exec-a0c2c033-54b5-4916-bb90-de6962fc0112.png', 'exec-92456744-5d3a-4bb8-9f9f-e2005d6dc15e.png'],
  'V-997': ['exec-56a2d052-f7a6-46a8-afb8-937f29e3d7ce.png'],
};
const names = { 'V-990': '나무늘봉순', 'V-991': '조은', 'V-998': '하이희야', 'V-993': '오리꿍', 'V-994': '디임', 'V-997': '아윤' };
const approvedCodes = ['V-990', 'V-998', 'V-993', 'V-997'];
const prompts = JSON.parse(await fs.readFile(path.join(root, 'prompts.json'), 'utf8'));
const digest = buffer => crypto.createHash('sha256').update(buffer).digest('hex').toUpperCase();
function inspectPng(buffer) {
  if (!buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw new Error('Not a PNG');
  const width = buffer.readUInt32BE(16), height = buffer.readUInt32BE(20), depth = buffer[24], type = buffer[25];
  if (width !== 1024 || height !== 1536 || depth !== 8 || type !== 2) throw new Error(`Unexpected PNG format: ${width}x${height} / depth ${depth} / color ${type}`);
  const idat = [];
  let iend = false;
  for (let offset = 8; offset + 12 <= buffer.length;) {
    const length = buffer.readUInt32BE(offset), chunk = buffer.toString('ascii', offset + 4, offset + 8);
    if (offset + 12 + length > buffer.length) throw new Error('Truncated PNG');
    if (chunk === 'IDAT') idat.push(buffer.subarray(offset + 8, offset + 8 + length));
    if (chunk === 'IEND') iend = true;
    offset += length + 12;
  }
  if (!iend || inflateSync(Buffer.concat(idat)).length !== height * (width * 3 + 1)) throw new Error('Unexpected PNG pixel stream');
  return { format: 'PNG', width, height, mode: 'RGB', bitDepth: depth, bytes: buffer.length, sha256: digest(buffer) };
}
const characters = [];
for (const character of prompts.characters) {
  const approved = approvedCodes.includes(character.code);
  const preserved = [];
  for (const [index, filename] of sources[character.code].entries()) {
    const version = index + 1;
    const source = path.join(generatedRoot, filename);
    const relative = approved ? character.output : `history/${character.slug}-halloween-source-art-v${version}.png`;
    const destination = path.join(root, relative);
    const sourceBytes = await fs.readFile(source);
    const info = inspectPng(sourceBytes);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    try {
      const existing = await fs.readFile(destination);
      if (digest(existing) !== info.sha256) throw new Error(`Refusing to replace ${relative}`);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await fs.copyFile(source, destination, 1);
    }
    if (digest(await fs.readFile(destination)) !== info.sha256) throw new Error(`Copy mismatch ${relative}`);
    preserved.push({ version, path: relative, originalGeneratedPath: source.replaceAll('\\', '/'), ...info, copyMethod: 'byte-identical fs.copyFile', status: approved ? 'APPROVED_SOURCE_ART' : 'REJECTED_SUPERSEDED_NEW_POSE_REQUESTED' });
  }
  characters.push({
    code: character.code, name: names[character.code], slug: character.slug, rank: 'SS', limited: true,
    concept: character.concept,
    status: approved ? 'APPROVED_SOURCE_ART' : 'NEW_POSE_V3_PENDING',
    sourceArt: approved ? preserved[0].path : null,
    sourceArtVersion: approved ? 1 : null,
    sourceArtSha256: approved ? preserved[0].sha256 : null,
    referenceArt: path.relative(root, character.reference).replaceAll('\\', '/'),
    history: approved ? [] : preserved,
    preserved: approved ? preserved : [],
  });
}
const framePath = '../../assets/ui/project-v/mercenaries/limited-20261002/frame-valter-slim-v3.png';
const frameHash = digest(await fs.readFile(path.resolve(root, framePath)));
if (frameHash !== 'F5F636CAC672A485F19CE4ED484ECB2798217D365A4D31B2C6C7FABB878189EA') throw new Error('Approved frame mismatch');
const manifest = {
  version: 1, date: '2026-10-11', title: 'SS 리미티드 · 할로윈 컬렉션',
  scope: 'Source illustration review only; no runtime, catalog, skill, acquisition or SD changes',
  runtimeEnabled: false,
  approvalRecord: 'approval-20261011.json',
  frame: { path: framePath, sha256: frameHash, artInset: { leftPercent: 5.95703125, topPercent: 5.79427083, widthPercent: 88.0859375, heightPercent: 88.0859375 } },
  characters,
};
const approval = {
  version: 1, date: '2026-10-11',
  userInstruction: '조은,디임 제외 나머지 승인 조은디임 포즈 새로 만들것 총 제대로 들고있게하고 칼도 잡는 포즈 바꾸고 일직선 유지',
  scope: 'Halloween source illustrations only',
  approved: characters.filter(c => approvedCodes.includes(c.code)).map(c => ({ code: c.code, name: c.name, ...c.preserved[0] })),
  excluded: characters.filter(c => !approvedCodes.includes(c.code)).map(c => ({ code: c.code, name: c.name, status: 'NEW_POSE_V3_PENDING', reason: '사용자 지시: 새 포즈, 올바른 파지, 총/칼 일직선 유지. V1과 무기 보정 V2는 승인 아님.', history: c.history })),
  preservation: 'All eight generated originals were copied byte for byte. No resampling, image editing, recompression or replacement of approved existing character art.',
  notApprovedByThisRecord: ['Joeun and Diim V1/V2/V3', 'new SD', 'skills', 'runtime catalog replacement', 'acquisition or combat activation'],
};
for (const [filename, content] of [['manifest.json', manifest], ['approval-20261011.json', approval]]) {
  await fs.writeFile(path.join(root, filename), JSON.stringify(content, null, 2) + '\n', { flag: 'wx' });
}
console.log(JSON.stringify({ copiedOriginals: characters.reduce((n, c) => n + c.preserved.length + c.history.length, 0), approved: approvedCodes, allOriginals: '1024x1536 RGB PNG, byte-identical SHA256 verified', frameSha256: frameHash }, null, 2));
