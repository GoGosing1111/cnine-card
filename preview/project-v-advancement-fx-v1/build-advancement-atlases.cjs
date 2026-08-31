'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const sharpModuleRoot = process.env.CODEX_NODE_MODULES;
const sharp = sharpModuleRoot
  ? require(path.join(sharpModuleRoot, 'sharp'))
  : require('sharp');

const previewRoot = __dirname;
const sourceRoot = path.join(previewRoot, 'assets', 'source');
const outputRoot = path.join(previewRoot, 'assets', 'atlases');

const columns = 4;
const rows = 3;
const frameCount = columns * rows;
const sourceCell = { width: 384, height: 341 };
const sourceCrop = {
  width: sourceCell.width * columns,
  height: sourceCell.height * rows,
};
const outputCell = { width: 512, height: 455 };
const atlasSize = {
  width: outputCell.width * columns,
  height: outputCell.height * rows,
};

const effects = {
  shatter: {
    version: 3,
    role: 'attack',
    concept: 'awakening-dragon',
    source: 'shatter-awakening-dragon-sheet-black-v3.png',
    sourceId: 'exec-1e4393c7-91b0-4f60-b845-146ab82fe33e',
    expectedSourceSha256: '98EB875D163E03C2B26B557127602673C56D589D3111D47AB2CC047046805958',
    fps: 24,
    collisionFrame: 6,
    anchors: { x: 0.5, y: 0.52 },
  },
  riposte: {
    version: 1,
    role: 'counter',
    concept: 'counter-guard',
    source: 'riposte-counter-guard-sheet-black-v1.png',
    sourceId: 'exec-d1575f25-bf09-4eca-ab77-983365d360f8',
    expectedSourceSha256: 'F142262F84FD5CBF6A89A7D9767776A8A6684EDDFF5E9B90B7D234651C791B47',
    expectedImageSha256: '3D70439BA3063509C71D276FBA0EDB59538532497F4F30FA22D45B5679B56E2C',
    expectedJsonSha256: '093A5CD203C2424EEA75F6F59A8AB2A08B88385B105F8BC9E1043DA47831E333',
    preserveOutput: true,
    fps: 20,
    collisionFrame: 7,
    guardContactFrame: 3,
    anchors: { x: 0.5, y: 0.53 },
  },
  afterimage: {
    version: 3,
    role: 'speed',
    concept: 'awakening-chrono-falcon',
    source: 'afterimage-awakening-chrono-falcon-sheet-black-v3.png',
    sourceId: 'exec-11b4ddf1-f888-4125-b87c-195690c8c245',
    expectedSourceSha256: '6BAA0F5207B93A35F37FDDC49512D519A5CC9478DC5138FF904FE513C7CF4198',
    fps: 28,
    collisionFrame: 6,
    anchors: { x: 0.52, y: 0.52 },
  },
  immortal: {
    version: 3,
    role: 'heal',
    concept: 'awakening-world-tree',
    source: 'immortal-awakening-world-tree-sheet-black-v3.png',
    sourceId: 'exec-ea504bc5-479c-4d19-8408-93984ba65182',
    expectedSourceSha256: '58111C400582EDF9805D2F9A4AC5C59A3F767D2507B334F7F56E8481BDBDCB99',
    fps: 18,
    collisionFrame: 8,
    coreFrame: 6,
    anchors: { x: 0.5, y: 0.58 },
  },
};

function round(value, digits = 6) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex').toUpperCase();
}

function unmatteBlack(rgb, width, height) {
  const rgba = Buffer.allocUnsafe(width * height * 4);

  for (
    let pixel = 0, source = 0, target = 0;
    pixel < width * height;
    pixel += 1, source += 3, target += 4
  ) {
    const red = rgb[source];
    const green = rgb[source + 1];
    const blue = rgb[source + 2];
    const peak = Math.max(red, green, blue);

    if (peak <= 2) {
      rgba[target] = 0;
      rgba[target + 1] = 0;
      rgba[target + 2] = 0;
      rgba[target + 3] = 0;
      continue;
    }

    const alpha = Math.min(255, Math.round(Math.pow(peak / 255, 0.86) * 255));
    const restore = 255 / peak;
    rgba[target] = Math.min(255, Math.round(red * restore));
    rgba[target + 1] = Math.min(255, Math.round(green * restore));
    rgba[target + 2] = Math.min(255, Math.round(blue * restore));
    rgba[target + 3] = alpha;
  }

  return rgba;
}

function frameStats(rgba, width, height) {
  const pixelCount = width * height;
  let visiblePixels = 0;
  let opaquePixels = 0;
  let alphaSum = 0;
  let visibleAlphaSum = 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let pixel = 0, offset = 0; pixel < pixelCount; pixel += 1, offset += 4) {
    const alpha = rgba[offset + 3];
    alphaSum += alpha;
    if (alpha > 2) {
      visiblePixels += 1;
      visibleAlphaSum += alpha;
      const x = pixel % width;
      const y = Math.floor(pixel / width);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
    if (alpha >= 250) {
      opaquePixels += 1;
    }
  }

  return {
    visibleCoverage: round(visiblePixels / pixelCount),
    opaqueCoverage: round(opaquePixels / pixelCount),
    meanAlpha: round(alphaSum / pixelCount / 255),
    meanVisibleAlpha: visiblePixels ? round(visibleAlphaSum / visiblePixels / 255) : 0,
    bounds: maxX >= 0
      ? {
          x: minX,
          y: minY,
          width: maxX - minX + 1,
          height: maxY - minY + 1,
        }
      : null,
  };
}

function continuity(previous, current, width, height) {
  const pixelCount = width * height;
  let intersection = 0;
  let union = 0;
  let alphaDelta = 0;

  for (let pixel = 0, offset = 3; pixel < pixelCount; pixel += 1, offset += 4) {
    const previousAlpha = previous[offset];
    const currentAlpha = current[offset];
    const previousVisible = previousAlpha > 12;
    const currentVisible = currentAlpha > 12;
    if (previousVisible || currentVisible) union += 1;
    if (previousVisible && currentVisible) intersection += 1;
    alphaDelta += Math.abs(previousAlpha - currentAlpha);
  }

  return {
    alphaMaskIoU: union ? round(intersection / union) : 1,
    meanAlphaDelta: round(alphaDelta / pixelCount / 255),
  };
}

async function buildEffect(effect, config) {
  const sourcePath = path.join(sourceRoot, config.source);
  const sourceFile = await fs.readFile(sourcePath);
  const sourceSha256 = sha256(sourceFile);
  const sourceMetadata = await sharp(sourceFile).metadata();

  if (config.expectedSourceSha256 && sourceSha256 !== config.expectedSourceSha256) {
    throw new Error(
      `${config.source}: expected SHA-256 ${config.expectedSourceSha256}, got ${sourceSha256}`,
    );
  }

  if (sourceMetadata.width !== 1536 || sourceMetadata.height !== 1024) {
    throw new Error(
      `${config.source}: expected 1536x1024, got ${sourceMetadata.width}x${sourceMetadata.height}`,
    );
  }

  const { data, info } = await sharp(sourceFile)
    .removeAlpha()
    .extract({ left: 0, top: 0, width: sourceCrop.width, height: sourceCrop.height })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const keyed = unmatteBlack(data, info.width, info.height);
  const frameBuffers = [];
  const frameRawBuffers = [];
  const frames = {};
  const frameQa = [];

  for (let index = 0; index < frameCount; index += 1) {
    const sourceX = (index % columns) * sourceCell.width;
    const sourceY = Math.floor(index / columns) * sourceCell.height;
    const frameName = `${effect}_${String(index).padStart(2, '0')}`;
    const { data: frameRaw, info: frameInfo } = await sharp(keyed, {
      raw: { width: info.width, height: info.height, channels: 4 },
    })
      .extract({
        left: sourceX,
        top: sourceY,
        width: sourceCell.width,
        height: sourceCell.height,
      })
      .resize(outputCell.width, outputCell.height, {
        fit: 'fill',
        kernel: sharp.kernel.lanczos3,
      })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const framePng = await sharp(frameRaw, {
      raw: {
        width: frameInfo.width,
        height: frameInfo.height,
        channels: frameInfo.channels,
      },
    })
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toBuffer();

    frameRawBuffers.push(frameRaw);
    frameBuffers.push({
      input: framePng,
      left: (index % columns) * outputCell.width,
      top: Math.floor(index / columns) * outputCell.height,
    });
    frameQa.push({
      frame: index,
      ...frameStats(frameRaw, frameInfo.width, frameInfo.height),
    });
    frames[frameName] = {
      frame: {
        x: (index % columns) * outputCell.width,
        y: Math.floor(index / columns) * outputCell.height,
        w: outputCell.width,
        h: outputCell.height,
      },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: outputCell.width, h: outputCell.height },
      sourceSize: { w: outputCell.width, h: outputCell.height },
      duration: Math.round(1000 / config.fps),
    };
  }

  const continuityQa = [];
  for (let index = 1; index < frameRawBuffers.length; index += 1) {
    continuityQa.push({
      from: index - 1,
      to: index,
      ...continuity(frameRawBuffers[index - 1], frameRawBuffers[index], outputCell.width, outputCell.height),
    });
  }

  const assetVersion = Number(config.version);
  if (!Number.isInteger(assetVersion) || assetVersion < 1) {
    throw new Error(`${effect}: invalid asset version ${config.version}`);
  }
  const imageName = `${effect}-advancement-atlas-v${assetVersion}.png`;
  const jsonName = `${effect}-advancement-atlas-v${assetVersion}.json`;
  const imagePath = path.join(outputRoot, imageName);
  const jsonPath = path.join(outputRoot, jsonName);

  const frameNames = Object.keys(frames);
  const atlas = {
    frames,
    animations: {
      impact: frameNames,
      advancement: frameNames,
    },
    meta: {
      app: 'PROJECT V ADVANCEMENT FX PREVIEW ATLAS BUILDER',
      version: `${assetVersion}.0.0`,
      assetVersion,
      image: imageName,
      format: 'RGBA8888',
      size: { w: atlasSize.width, h: atlasSize.height },
      scale: '1',
      effect,
      role: config.role,
      concept: config.concept,
      fps: config.fps,
      collisionFrame: config.collisionFrame,
      ...(Number.isInteger(config.guardContactFrame)
        ? { guardContactFrame: config.guardContactFrame }
        : {}),
      ...(Number.isInteger(config.coreFrame) ? { coreFrame: config.coreFrame } : {}),
      anchors: config.anchors,
      source: config.source,
      sourceId: config.sourceId,
      matteRemoval: {
        background: 'black',
        transparentPeakThreshold: 2,
        alphaExponent: 0.86,
      },
    },
  };

  if (!config.preserveOutput) {
    await sharp({
      create: {
        width: atlasSize.width,
        height: atlasSize.height,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite(frameBuffers)
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toFile(imagePath);
    await fs.writeFile(jsonPath, `${JSON.stringify(atlas, null, 2)}\n`, 'utf8');
  }

  const outputFile = await fs.readFile(imagePath);
  const outputJsonFile = await fs.readFile(jsonPath);
  const outputImageSha256 = sha256(outputFile);
  const outputJsonSha256 = sha256(outputJsonFile);
  if (config.expectedImageSha256 && outputImageSha256 !== config.expectedImageSha256) {
    throw new Error(
      `${imageName}: preserved RIPOSTE V1 image changed (${outputImageSha256})`,
    );
  }
  if (config.expectedJsonSha256 && outputJsonSha256 !== config.expectedJsonSha256) {
    throw new Error(
      `${jsonName}: preserved RIPOSTE V1 metadata changed (${outputJsonSha256})`,
    );
  }

  return {
    effect,
    role: config.role,
    concept: config.concept,
    assetVersion,
    source: {
      file: `assets/source/${config.source}`,
      sourceId: config.sourceId,
      sha256: sourceSha256,
      size: { width: sourceMetadata.width, height: sourceMetadata.height },
      channels: sourceMetadata.channels,
      croppedBottomRows: sourceMetadata.height - sourceCrop.height,
    },
    output: {
      image: `assets/atlases/${imageName}`,
      json: `assets/atlases/${jsonName}`,
      imageSha256: outputImageSha256,
      jsonSha256: outputJsonSha256,
      preservedExisting: Boolean(config.preserveOutput),
      format: 'RGBA8888',
      size: atlasSize,
      frameSize: outputCell,
      frames: frameCount,
      fps: config.fps,
      collisionFrame: config.collisionFrame,
      ...(Number.isInteger(config.guardContactFrame)
        ? { guardContactFrame: config.guardContactFrame }
        : {}),
      ...(Number.isInteger(config.coreFrame) ? { coreFrame: config.coreFrame } : {}),
      anchors: config.anchors,
    },
    qa: {
      frames: frameQa,
      continuity: continuityQa,
      summary: {
        minVisibleCoverage: round(Math.min(...frameQa.map((frame) => frame.visibleCoverage))),
        maxVisibleCoverage: round(Math.max(...frameQa.map((frame) => frame.visibleCoverage))),
        minOpaqueCoverage: round(Math.min(...frameQa.map((frame) => frame.opaqueCoverage))),
        maxOpaqueCoverage: round(Math.max(...frameQa.map((frame) => frame.opaqueCoverage))),
        meanAlphaMaskIoU: round(
          continuityQa.reduce((sum, item) => sum + item.alphaMaskIoU, 0) / continuityQa.length,
        ),
        meanFrameAlphaDelta: round(
          continuityQa.reduce((sum, item) => sum + item.meanAlphaDelta, 0) / continuityQa.length,
        ),
      },
    },
  };
}

function provenanceMarkdown(results) {
  const lines = [
    '# PROJECT V advancement visual FX provenance',
    '',
    '이 문서는 독립 검수 프리뷰가 현재 선택한 전직 시각 이펙트의 원본과 변환 결과를 고정한다. 라이브 PROJECT V V3에는 연결하지 않는다.',
    '',
    '- SHATTER, AFTERIMAGE, IMMORTAL은 역할별로 새로 제작한 각성급 V3 원본이다.',
    '- RIPOSTE는 사용자 승인 상태의 V1 원본·아틀라스를 바이트 단위로 보존하며 빌더가 재기록하지 않는다.',
    '- 중단된 V2 시안은 현재 프리뷰 선택 및 런타임 경로에서 사용하지 않는다.',
    '- 오디오는 `assets/audio/PROVENANCE.md`의 녹음·폴리 V1을 그대로 유지한다.',
    '',
    '| Effect | Role / concept | Selected source | Source ID | Source SHA-256 | Selected atlas | Atlas PNG SHA-256 | Atlas JSON SHA-256 |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...results.map((result) => (
      `| ${result.effect.toUpperCase()} | ${result.role} / ${result.concept} | `
      + `\`${result.source.file}\` | \`${result.source.sourceId}\` | \`${result.source.sha256}\` | `
      + `\`${result.output.image}\` | \`${result.output.imageSha256}\` | \`${result.output.jsonSha256}\` |`
    )),
    '',
    '## 변환 계약',
    '',
    '- 입력: 1536×1024 RGB PNG, 4×3 그리드. 마지막 1px 행을 제외한 1536×1023을 384×341 셀로 분리한다.',
    '- 검정 무광 제거: RGB 최대값 2 이하는 완전 투명, 알파 지수 0.86으로 색을 복원한다.',
    '- 출력: 프레임당 512×455, 12프레임, 2048×1365 RGBA8888 PNG.',
    '- 타이밍·충돌 프레임·앵커는 기존 전직별 계약을 유지한다.',
    '',
  ];
  return `${lines.join('\n')}\n`;
}

(async () => {
  await fs.mkdir(outputRoot, { recursive: true });
  const results = [];
  for (const [effect, config] of Object.entries(effects)) {
    results.push(await buildEffect(effect, config));
  }

  const manifest = {
    schemaVersion: 3,
    scope: 'preview/project-v-advancement-fx-v1 only',
    runtimeConnected: false,
    releaseSelection: {
      shatter: 'v3',
      riposte: 'v1',
      afterimage: 'v3',
      immortal: 'v3',
    },
    priorV1AssetsRetained: true,
    priorV2AssetsRetainedButUnselected: true,
    riposteV1Preserved: true,
    generatedWith: {
      method: 'preview-local adaptation of PROJECT V V3 role impact atlas pipeline',
      sourceGrid: { columns, rows, cell: sourceCell, crop: sourceCrop },
      outputGrid: { columns, rows, cell: outputCell, atlas: atlasSize },
      resizeKernel: 'lanczos3',
      matteRemoval: {
        background: 'black',
        transparentPeakThreshold: 2,
        alphaExponent: 0.86,
      },
      outputFormat: 'RGBA8888 PNG',
    },
    effects: Object.fromEntries(results.map((result) => [result.effect, {
      role: result.role,
      concept: result.concept,
      assetVersion: result.assetVersion,
      source: result.source,
      output: result.output,
    }])),
  };

  const qa = {
    schemaVersion: 3,
    releaseSelection: manifest.releaseSelection,
    methodology: {
      visibleCoverage: 'alpha > 2 / frame pixels',
      opaqueCoverage: 'alpha >= 250 / frame pixels',
      alphaMaskIoU: 'intersection-over-union of consecutive alpha > 12 masks',
      meanAlphaDelta: 'mean absolute consecutive alpha delta normalized to 0..1',
    },
    effects: Object.fromEntries(results.map((result) => [result.effect, {
      assetVersion: result.assetVersion,
      source: {
        file: result.source.file,
        sourceId: result.source.sourceId,
        sha256: result.source.sha256,
      },
      output: {
        image: result.output.image,
        json: result.output.json,
        imageSha256: result.output.imageSha256,
        jsonSha256: result.output.jsonSha256,
      },
      ...result.qa,
    }])),
  };

  await fs.writeFile(
    path.join(outputRoot, 'advancement-fx-atlas-manifest-v3.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );
  await fs.writeFile(
    path.join(outputRoot, 'advancement-fx-atlas-qa-v3.json'),
    `${JSON.stringify(qa, null, 2)}\n`,
    'utf8',
  );
  await fs.writeFile(
    path.join(sourceRoot, 'PROVENANCE.md'),
    provenanceMarkdown(results),
    'utf8',
  );

  process.stdout.write(`${JSON.stringify(results.map(({ qa, ...result }) => ({
    ...result,
    qa: qa.summary,
  })), null, 2)}\n`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
