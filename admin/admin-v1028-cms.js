/* v1028 CMS navigation cleanup: reuse existing battle API and fields. */
(() => {
  const monsterMount = document.querySelector('#monsterManagementMount');
  const dropMount = document.querySelector('#dropManagementMount');
  if (!monsterMount || !dropMount) return;

  const monsterForm = document.querySelector('#monsterName')?.closest('.panel');
  const monsterList = document.querySelector('#monsterAdminList');
  if (monsterForm) monsterMount.appendChild(monsterForm);
  if (monsterList) monsterMount.appendChild(monsterList);

  const dropGrid = document.querySelector('#battleCardDropEnabled')?.closest('.formgrid');
  const rates = document.querySelector('#battleCardDropGradeRates');
  const rateTitle = rates?.previousElementSibling;
  const total = document.querySelector('#battleCardDropRateTotal');
  const dropPanel = document.createElement('div');
  dropPanel.className = 'panel dropManagementPanel';
  dropPanel.innerHTML = '<div class="maintenanceHead"><div><h2>카드 드랍 설정</h2><p>몬스터 전투 승리 시 적용되는 공통 카드 드랍 확률입니다.</p></div></div>';
  if (dropGrid) dropPanel.appendChild(dropGrid);
  if (rateTitle) dropPanel.appendChild(rateTitle);
  if (rates) dropPanel.appendChild(rates);
  if (total) dropPanel.appendChild(total);
  dropPanel.insertAdjacentHTML('beforeend', '<button type="button" id="saveDropSettingsBtn">드랍 설정 저장</button>');
  dropMount.appendChild(dropPanel);

  const battleSave = document.querySelector('#saveBattleSettingsBtn');
  if (battleSave) battleSave.textContent = '전투력 설정 저장';
  document.querySelector('#saveDropSettingsBtn')?.addEventListener('click', saveBattleAdminSettings);
})();
