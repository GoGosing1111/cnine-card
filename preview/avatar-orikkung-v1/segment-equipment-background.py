"""2026-09-11: user-approved background-only segmentation; RGB is never painted."""
from pathlib import Path
import hashlib
import json
import sys

root = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(root / 'tmp' / 'avatar-background-python'))
import cv2
import numpy as np
from PIL import Image

folder = Path(__file__).resolve().parent
source = folder / 'assets/avatar-orikkung-equipment-draft-v1.png'
expected = '16874949373D634EDF6EB45EDA14AA1B0A95D096ACB4968947E77D1C9854F20E'
assert hashlib.sha256(source.read_bytes()).hexdigest().upper() == expected
rgb = np.asarray(Image.open(source).convert('RGB'))
h, w = rgb.shape[:2]
spread = np.ptp(rgb.astype(np.int16), axis=2)
lum = rgb.astype(np.float32).mean(axis=2)

# Learn the actual correlated gray checker colors separately from the cyan,
# lavender-white hair, pale costume, warm skin and dark tights. Probable labels
# remain editable by graph cut; narrow confirmed strokes anchor the materials.
mask = np.full((h, w), cv2.GC_PR_BGD, np.uint8)
likely = ((spread > 6) | (lum > 230) | (lum < 112))
mask[likely] = cv2.GC_PR_FGD
strong = ((spread > 34) | (lum < 106)).astype(np.uint8)
strong[:, :265] = 0
strong[:, 795:] = 0
strong = cv2.erode(strong, np.ones((3, 3), np.uint8))
near_strong = cv2.dilate(strong, np.ones((11, 11), np.uint8)) > 0
mask[(spread <= 3) & (lum >= 125) & (lum <= 225) & ~near_strong] = cv2.GC_BGD
mask[strong > 0] = cv2.GC_FGD
mask[:, :240] = cv2.GC_BGD
mask[:, 820:] = cv2.GC_BGD
mask[-4:, :] = cv2.GC_BGD
mask[:3, :] = cv2.GC_BGD

foreground = [(479,188,6),(446,223,5),(402,261,4),(613,295,4),
              (421,333,5),(574,336,5),(450,432,7),(469,520,7),
              (338,777,3),(679,795,3),(460,252,4),
              (408,187,3),(381,204,3),(649,252,3)]
background = [(363,550,5),(452,274,2),(600,510,4),(613,570,3),
              (452,18,2),(606,53,2),(475,84,1),(430,259,1),
              (752,850,1),(584,286,2),(583,94,2),(496,1200,4)]
for x,y,r in foreground:
    cv2.circle(mask, (x,y), r, cv2.GC_FGD, -1)
for x,y,r in background:
    cv2.circle(mask, (x,y), r, cv2.GC_BGD, -1)

bg_model = np.zeros((1,65), np.float64)
fg_model = np.zeros((1,65), np.float64)
cv2.setRNGSeed(20260911)
cv2.grabCut(cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR), mask, None,
            bg_model, fg_model, 6, cv2.GC_INIT_WITH_MASK)
alpha = np.where((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD), 255, 0).astype(np.uint8)

# The generator painted tinted checker pixels inside the fine loop/hair gaps.
# These reviewed background-only apertures exclude the face, white fringe,
# ribbons, solid cyan loop masses and outfit. Preserve bright white strands.
apertures = [
    [(398,91),(405,61),(412,37),(425,21),(442,12),(461,10),(482,18),
     (498,37),(508,61),(514,93),(506,94),(499,57),(489,41),(475,32),
     (456,28),(437,32),(422,43),(413,60),(408,88)],
    [(554,95),(566,78),(589,58),(611,47),(630,47),(647,57),(662,78),
     (662,91),(651,76),(640,67),(622,61),(603,65),(580,78),(562,97)],
    [(391,69),(380,78),(370,93),(395,94),(405,76)],
    [(416,216),(429,248),(444,271),(447,288),(422,300),(437,285),(430,278),(419,256)],
    [(586,276),(606,265),(611,276),(598,293),(577,300),(571,296)],
    [(640,208),(665,219),(654,233),(633,241),(628,230)],
    [(618,315),(636,306),(641,326),(614,330)],
]
reviewed_bg = np.zeros((h,w), np.uint8)
for points in apertures:
    cv2.fillPoly(reviewed_bg, [np.array(points, np.int32)], 1)
tinted_checker = (spread <= 38) & (lum >= 100) & (lum <= 232)
alpha[(reviewed_bg > 0) & tinted_checker] = 0

# Bright checker squares in the open space above the left ribbon and inside
# the loop apertures need explicit background labels; their gray happens to
# match the white costume, so a global white-color key would be destructive.
bright_apertures = [
    [(365,42),(406,42),(398,83),(389,83),(377,79),(365,80)],
    [(556,96),(565,91),(587,83),(603,87),(609,92),(603,98),(590,95),(573,99),(562,103)],
    [(467,77),(476,77),(484,83),(484,90),(477,89)],
    [(420,219),(427,244),(434,257),(445,273),(449,289),(439,283),(431,270),(422,248)],
    [(588,277),(603,270),(604,278),(591,288),(578,295),(577,291)],
]
bright_bg = np.zeros((h,w), np.uint8)
for points in bright_apertures:
    cv2.fillPoly(bright_bg,[np.array(points,np.int32)],1)
alpha[(bright_bg>0) & (spread<=40) & (lum>=110)] = 0

# Edge-only neutral spill below the hair, with bright white garments protected.
edge = cv2.morphologyEx(alpha, cv2.MORPH_GRADIENT, np.ones((5,5), np.uint8)) > 0
edge[:325,:] = False
alpha[edge & (spread <= 9) & (lum >= 115) & (lum <= 226)] = 0

# Break the one/two-pixel bridges that attach painted checker islands to the
# head outline, without touching the filled face, costume, hands or body.
head_before = alpha[:335,:].copy()
head_open = cv2.morphologyEx(head_before, cv2.MORPH_OPEN,
                           cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(5,5)))
alpha[:335,:] = np.minimum(head_before, head_open)
# Retain the reference's genuinely fine yellow-green flower stems.
stems = (rgb[:220,:,1].astype(int) > rgb[:220,:,0].astype(int)+3) & \
        (rgb[:220,:,0].astype(int) > rgb[:220,:,2].astype(int)+8)
alpha[:220,:][stems] = head_before[:220,:][stems]

# The graph may retain small isolated gray checker islands. Keep detached
# colored hair/ribbon details; discard only neutral disconnected background.
n, labels, stats, _ = cv2.connectedComponentsWithStats(alpha, 8)
largest = 1 + np.argmax(stats[1:, cv2.CC_STAT_AREA])
removed = 0
for label in range(1, n):
    if label == largest:
        continue
    selected = labels == label
    top_dust = stats[label, cv2.CC_STAT_TOP] < 90 and stats[label, cv2.CC_STAT_AREA] < 80
    if top_dust or stats[label, cv2.CC_STAT_AREA] < 5 or np.percentile(spread[selected], 80) < 38:
        removed += int(selected.sum())
        alpha[selected] = 0

Image.fromarray(alpha).save(folder / 'assets/equipment-background-mask-v1.png')
report = {'method':'SEEDED_GRABCUT_BACKGROUND_ONLY', 'opencv':cv2.__version__,
          'numpy':np.__version__, 'sourceSha256':expected, 'foregroundSeeds':foreground,
          'backgroundSeeds':background, 'removedNeutralIslands':removed,
          'reviewedBackgroundApertures':apertures,
          'reviewedBrightBackgroundApertures':bright_apertures,
          'foregroundPixels':int((alpha > 0).sum()), 'width':w, 'height':h}
(folder / 'segmentation-qa.json').write_text(json.dumps(report, indent=2)+'\n', encoding='utf-8')
print(json.dumps(report))
