(() => {
  'use strict';
  const root = 'assets/black-uniform-dual-uzi-';
  const poses = {
    ready: { file: root + 'battle-v3-longhair.png', foot: { x: 530, y: 1478 }, bodyHeight: 1404, caption: '장발 · 투명 전신', alt: '장발의 검은 제복 캐릭터가 서서 양손 우지를 조준하는 투명 전신 이미지' },
    fire: { file: root + 'battle-v3-longhair.png', foot: { x: 530, y: 1478 }, bodyHeight: 1404, caption: '전투 전신 · 스코프 아우라', alt: '장발의 검은 제복 캐릭터와 별도 계층의 스코프·탄환 아우라' }
  };
  const stage = document.querySelector('.stage');
  const actor = document.querySelector('#actor');
  let currentPose = 'fire';
  function layout() {
    const pose = poses[currentPose];
    const scale = Math.min((stage.clientHeight - 150) / pose.bodyHeight, (stage.clientWidth - 24) / 1024);
    actor.style.width = `${1024 * scale}px`;
    actor.style.height = `${1536 * scale}px`;
    actor.style.left = `${stage.clientWidth / 2 - pose.foot.x * scale}px`;
    actor.style.top = `${stage.clientHeight - 62 - pose.foot.y * scale}px`;
    const aura = document.querySelector('.portrait-aura');
    const size = pose.bodyHeight * scale * 1.55;
    // The first atlas cell's scope center is (204,208), not the cell center (181,181).
    Object.assign(aura.style,{width:`${size}px`,height:`${size}px`,left:`${stage.clientWidth/2-12-size*204/362}px`,top:`${stage.clientHeight-62-pose.bodyHeight*scale*.61-size*208/362}px`,display:currentPose==='fire'?'block':'none'});
  }
  document.querySelectorAll('[data-pose]').forEach(button => button.addEventListener('click', () => {
    currentPose = button.dataset.pose;
    const pose = poses[currentPose];
    actor.src = pose.file;
    actor.alt = pose.alt;
    document.querySelector('#stage-caption').textContent = pose.caption;
    document.querySelector('#pose-note').textContent = currentPose === 'fire' ? '캐릭터와 아우라를 별도 계층으로 표시' : '배경·이펙트가 없는 투명 전신';
    document.querySelector('#battle-download').href = pose.file;
    document.querySelectorAll('[data-pose]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    layout();
  }));
  document.querySelectorAll('button[data-background]').forEach(button => button.addEventListener('click', () => {
    stage.dataset.background = button.dataset.background;
    document.querySelectorAll('button[data-background]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
  }));
  new ResizeObserver(layout).observe(stage);
  actor.addEventListener('load', layout);
  layout();
})();
