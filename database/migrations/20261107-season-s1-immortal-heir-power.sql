-- Equipped titles use pve_power for both PVE and PVP. Upgrade the original cosmetic edition in place.
UPDATE character_titles
SET pve_power=700000
WHERE code='COMMON_S1_TITLE' AND pve_power=0;
