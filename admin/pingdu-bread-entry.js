const nav = document.getElementById('nav');
if (nav) {
  const button = document.createElement('button');
  button.type = 'button';
  button.hidden = true;
  button.textContent = '붕어빵 트럭 정산 · 보상';
  button.onclick = () => location.assign('/admin/pingdu-bread.html');
  nav.append(button);
  const sync = event => { button.hidden = (event?.detail || window.__SOOP_CMS_IDENTITY__)?.role !== 'OWNER'; };
  window.addEventListener('soop:cms-identity', sync);
  sync();
}
