'use strict';
const equipmentStage = document.getElementById('equipment-stage');
const backgroundButtons = [...document.querySelectorAll('button[data-background]')];
for (const button of backgroundButtons) {
  button.addEventListener('click', () => {
    equipmentStage.dataset.background = button.dataset.background;
    for (const option of backgroundButtons) option.setAttribute('aria-pressed', String(option === button));
  });
}
