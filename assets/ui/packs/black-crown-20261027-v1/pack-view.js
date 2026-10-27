const asset = (file) => new URL(file, import.meta.url).href;

/** Display artwork only; labels stay live and accessible. */
class BlackCrownPack extends HTMLElement {
  connectedCallback() {
    if (this.shadowRoot) return;
    this.setAttribute('role', 'img');
    this.setAttribute('aria-label', '리버스콜 블랙크라운팩. 검은 왕관과 교차한 쌍권총, 흑금색 느와르 리미티드 용병팩.');
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = `
      <link rel="stylesheet" href="${asset('pack-view.css')}">
      <div class="pack" aria-hidden="true">
        <img class="art" src="${asset('pack-art-768.webp')}"
          srcset="${asset('pack-art-160.webp')} 160w,
                  ${asset('pack-art-320.webp')} 320w,
                  ${asset('pack-art-640.webp')} 640w,
                  ${asset('pack-art-768.webp')} 768w,
                  ${asset('pack-art-source.png')} 941w"
          sizes="(max-width: 480px) calc(100vw - 32px), 420px"
          width="941" height="1672" alt="" decoding="async">
        <span class="type brand">REVERSE CALL</span>
        <span class="type title">BLACK CROWN</span>
        <span class="type edition">LIMITED EDITION</span>
        <span class="type category">MERCENARY PACK</span>
        <span class="type korean" lang="ko">블랙크라운팩</span>
      </div>`;
    if (this.hasAttribute('full-resolution')) {
      const img = root.querySelector('img');
      img.removeAttribute('srcset');
      img.src = asset('pack-art-source.png');
    }
  }
}

if (!customElements.get('black-crown-pack')) {
  customElements.define('black-crown-pack', BlackCrownPack);
}
