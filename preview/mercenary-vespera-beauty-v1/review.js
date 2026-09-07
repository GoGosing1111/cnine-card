// Independent art review. No account calls, catalog writes, storage or audio.
(() => {
  const gallery = document.querySelector('#gallery');
  const dialog = document.querySelector('#zoom');
  const zoomImage = document.querySelector('#zoomImage');
  let returnFocus = null;
  document.querySelectorAll('[data-size]').forEach(button => {
    if (button.tagName !== 'BUTTON') return;
    button.addEventListener('click', () => {
      gallery.dataset.size = button.dataset.size;
      document.querySelectorAll('button[data-size]').forEach(node => node.setAttribute('aria-pressed', String(node === button)));
    });
  });
  document.querySelector('#showFrame').addEventListener('change', event => {
    gallery.classList.toggle('show-frame', event.target.checked);
    document.querySelectorAll('.frame').forEach(image => { image.hidden = !event.target.checked; });
  });
  document.querySelectorAll('.art-button').forEach(button => {
    button.addEventListener('click', () => {
      returnFocus = button;
      const image = button.querySelector('.art');
      document.querySelector('#zoomTitle').textContent = button.dataset.title;
      zoomImage.src = image.src;
      zoomImage.alt = image.alt;
      dialog.showModal();
    });
  });
  document.querySelector('#closeZoom').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    zoomImage.removeAttribute('src');
    returnFocus?.focus({ preventScroll: true });
  });
})();
