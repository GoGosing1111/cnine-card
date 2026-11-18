export const PVP_MINIMUM_GRADE = 'FUR';
export const PVP_ALLOWED_GRADES = Object.freeze(['FUR', 'ZENITH', 'SUPERSTAR', 'ICON']);
export const PVP_MINIMUM_GRADE_MESSAGE = 'PVP 덱에는 FUR 등급 이상만 출전할 수 있습니다. 하위 등급 카드를 교체하고 저장하세요.';
export const pvpCardGradeAllowed = card => PVP_ALLOWED_GRADES.includes(String(card?.rarity ?? card?.grade ?? '').trim().toUpperCase());
export const pvpDeckGradeAllowed = cards => Array.isArray(cards) && cards.length === 5 && cards.every(pvpCardGradeAllowed);
