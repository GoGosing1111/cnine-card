import {ICON_EXPANSION_CARDS} from '../shared/icon-expansion-v1.mjs';
import {formatIconAmount} from '../shared/icon-fusion-policy-v1.mjs';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function upcomingIconSectionHtml(){
 return '<section class="if-upcoming" aria-label="신규 아이콘 출시 준비"><header class="if-section-title"><b>신규 아이콘</b><span>준비 중 · 제작 OFF</span></header><div class="if-upcoming-list">'+ICON_EXPANSION_CARDS.map(card=>
  '<article data-upcoming-icon="'+card.code+'"><a class="if-upcoming-art" href="'+card.preview+'" target="_blank" rel="noopener" aria-label="'+esc(card.name)+' SD와 스킬 미리보기"><img class="if-upcoming-photo" src="/'+card.sourceArt+'" alt="'+esc(card.name)+' 카드 원본"><img class="if-upcoming-frame" src="/assets/ui/card-frames/icon-streamer-frame-v1.png" alt=""></a><div><small>ICON · 준비 중</small><h3>'+esc(card.name)+'</h3><p>'+esc(card.techniqueName)+'</p><dl><div><dt>제작 코인</dt><dd>'+formatIconAmount(card.recipe.coinCost)+'</dd></div><div><dt>마스터의 별</dt><dd>'+formatIconAmount(card.recipe.masterStarCost)+'개</dd></div><div><dt>성공 확률</dt><dd>'+card.recipe.successRate+'%</dd></div></dl><p class="if-upcoming-rule">SUPERSTAR +13 · FUR +13 각 1장<br>기존 아이콘보다 상위 성능으로 준비</p><a href="'+card.preview+'" target="_blank" rel="noopener">SD · 스킬 미리보기 ↗</a><p class="if-upcoming-off">제작·획득·편성 OFF</p></div></article>'
 ).join('')+'</div><p>현재 제작할 수 없습니다. 기존 아이콘 제작 조건과 덱 최대 2장 제한은 유지됩니다.</p></section>';
}
