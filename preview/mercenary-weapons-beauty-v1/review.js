// Read-only filters for the independent art review, including six new female firearm concepts.
(() => {
  const gallery = document.querySelector('#gallery');
  const buttons = document.querySelectorAll('button[data-filter]');
  const count = document.querySelector('#resultCount');
  buttons.forEach(button => button.addEventListener('click', () => {
    const filter = button.dataset.filter;
    let visible = 0;
    gallery.querySelectorAll('article').forEach(card => {
      card.hidden = filter === 'current' ? card.dataset.current !== 'true' : filter !== 'all' && card.dataset.family !== filter && card.dataset.gender !== filter;
      if (!card.hidden) visible++;
    });
    buttons.forEach(node => node.setAttribute('aria-pressed', String(node === button)));
    count.textContent = visible + '종 표시';
  }));
})();
