import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');

// The reviewed preview remains the layout source. Only publication copy and
// navigation change; CSS, interactions and canonical roster stay shared.
export function publicCodexHtml(template) {
  const replacements = [
    ['<html lang="ko">', '<html lang="ko" data-codex-mode="public">'],
    ['용병도감 · 숲켓몬 검수 프리뷰', '용병도감 · 숲켓몬'],
    ['./codex.css?v=1.4', '../preview/mercenary-codex-v1/codex.css?v=1.4'],
    ['./codex.js?v=2061.3-zoom-race', '../preview/mercenary-codex-v1/codex.js?v=2061.3-zoom-race'],
    ['../../js/soopketmon-v21-exact-shell-adapter.js', '../js/soopketmon-v21-exact-shell-adapter.js'],
    ['class="brand" href="?view=menu" data-menu', 'class="brand" href="/?screen=home" aria-label="숲켓몬 로비로 돌아가기"'],
    ['class="lobby-return" href="/?screen=home" hidden', 'class="lobby-return" href="/?screen=home"'],
    ['검수용 프리뷰 <span>· 유저 미공개</span>', '도감 공개 중 <span>· 정보 열람 전용</span>'],
    ['기존 메뉴에 용병도감을 추가한 배치입니다.', '카드 수집부터 용병 정보까지 한곳에서 살펴보세요.'],
    ['이번 프리뷰에서는 용병도감만 열 수 있습니다. 기존 메뉴와 계정 데이터는 변경하지 않습니다.', '용병도감은 정보 열람 전용입니다. 용병 획득·편성 기능은 준비 중입니다.'],
    ['현재 용병 정보 · 검수 현황', '용병 정보 · 공개 안내'],
    ['읽기 전용 프리뷰 · 계정 / 뽑기 / 전투 API 미연결', '용병 정보 선공개 · 획득 / 편성 / 전투 기능 준비 중']
  ];
  let html = template.replaceAll('\r\n', '\n');
  for (const [from, to] of replacements) {
    if (html.split(from).length !== 2) throw new Error(`Public codex template marker changed: ${from}`);
    html = html.replace(from, to);
  }
  return html;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const html = publicCodexHtml(fs.readFileSync(path.join(root, 'preview/mercenary-codex-v1/index.html'), 'utf8'));
  const target = path.join(root, 'mercenary-codex/index.html');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, html);
  console.log('Built mercenary-codex/index.html (read-only public catalog)');
}
