(() => {
  const shell = document.getElementById('previewShell');
  const motionButton = document.getElementById('toggleMotion');
  const enhanceButton = document.getElementById('toggleEnhance');
  const compactButton = document.getElementById('toggleCompact');

  const bindToggle = (button, className, activeLabel, inactiveLabel) => {
    button.addEventListener('click', () => {
      const active = shell.classList.toggle(className);
      button.setAttribute('aria-pressed', String(active));
      button.textContent = active ? activeLabel : inactiveLabel;
    });
  };

  bindToggle(motionButton, 'motion-paused', '애니메이션 재생', '애니메이션 정지');
  bindToggle(enhanceButton, 'show-enhance', '+13 강화 숨기기', '+13 강화 겹침');
  bindToggle(compactButton, 'is-compact', '전체 폭 보기', '모바일 폭 보기');

  if (window.matchMedia('(pointer:fine)').matches) {
    document.querySelectorAll('[data-tilt]').forEach((card) => {
      let frame = 0;
      card.addEventListener('pointermove', (event) => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
          const rect = card.getBoundingClientRect();
          const x = (event.clientX - rect.left) / rect.width - 0.5;
          const y = (event.clientY - rect.top) / rect.height - 0.5;
          card.style.transform = `rotateX(${(-y * 8).toFixed(2)}deg) rotateY(${(x * 10).toFixed(2)}deg) translateY(-5px)`;
        });
      });
      card.addEventListener('pointerleave', () => {
        cancelAnimationFrame(frame);
        card.style.transform = '';
      });
    });
  }
})();
