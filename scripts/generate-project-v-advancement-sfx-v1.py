#!/usr/bin/env python3
"""Build four preview-only advancement SFX from licensed recorded material.

This generator follows the live V3 editorial pipeline (trim, align, layer, EQ,
compress, limit, two-pass loudness normalization) without reusing any final
live role MP3. It contains no oscillators, generated noise, synthesized tones,
or browser/runtime synthesis.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import tempfile
import urllib.request
import wave
from pathlib import Path


RATE = 48_000
ROOT = Path(__file__).resolve().parents[1]
PREVIEW_ROOT = ROOT / "preview" / "project-v-advancement-fx-v1"
OUT_DIR = PREVIEW_ROOT / "assets" / "audio"
CACHE_DIR = Path(
    os.environ.get(
        "CNINE_ADVANCEMENT_SFX_CACHE",
        Path(tempfile.gettempdir()) / "cnine-advancement-sfx-sources-v1",
    )
)
MIXKIT_LICENSE = "https://mixkit.co/license/#sfxFree"


SOURCES = {
    781: {
        "name": "Cinematic impact waves",
        "page": "https://mixkit.co/free-sound-effects/impact/",
        "extension": "wav",
        "sha256": "1dd7d383688ce07544322279ef43ccc0adec94ed65a51abb437863bcd67070cd",
    },
    874: {
        "name": "Spell waves",
        "page": "https://mixkit.co/free-sound-effects/spell/",
        "extension": "wav",
        "sha256": "9f62b33ffe1690e266ec60416c702d3390f05361ab44b407609ef15354210479",
    },
    877: {
        "name": "Healing water spell with deep hit",
        "page": "https://mixkit.co/free-sound-effects/spell/",
        "extension": "wav",
        "sha256": "ce0da16d048dad829c5ed19f9c710e8406b71b1b1675ab3c17bec0846b02e5f2",
    },
    878: {
        "name": "Heal soft water spell",
        "page": "https://mixkit.co/free-sound-effects/spell/",
        "extension": "wav",
        "sha256": "27f574f4a35c633c3f26016b62e4cfe8d53b2523e47b9045b164e7dff946c032",
    },
    1487: {
        "name": "Dagger woosh",
        "page": "https://mixkit.co/free-sound-effects/sword/",
        "extension": "wav",
        "sha256": "f8483970bec9e69ed7234545da9ee59a733c5310c8becbd3db8b6a63064c3049",
    },
    1508: {
        "name": "Lightning whip",
        "page": "https://mixkit.co/free-sound-effects/lightning/",
        "extension": "wav",
        "sha256": "6326cfd06e64e0b9b1a0da07327950c5a1325cf9e77bcca43b6b244528de3de2",
    },
    2152: {
        "name": "Quick knife slice cutting",
        "page": "https://mixkit.co/free-sound-effects/download/2152/",
        "extension": "mp3",
        "sha256": "a57a2611ad4484d1934d71b7a7a911cace8a0a91d1792f645f9d8199d65d507d",
    },
    2160: {
        "name": "Metallic sword strike",
        "page": "https://mixkit.co/free-sound-effects/sword/",
        "extension": "wav",
        "sha256": "2717a659587f7962dbfdfc59b2716894620834b9d24836794560d86bf10b4c30",
    },
    2655: {
        "name": "Fast impact blow",
        "page": "https://mixkit.co/free-sound-effects/impact/",
        "extension": "wav",
        "sha256": "1addc9a7e2d2e1780c2a48d78a79857e39d0287220c695104b1f2a6df7f57633",
    },
    2792: {
        "name": "Fast sword whoosh",
        "page": "https://mixkit.co/free-sound-effects/sword/",
        "extension": "wav",
        "sha256": "e1de4e011ee6369aed772202a979590f03261e3607147bd2f04eda58ba5746eb",
    },
    2793: {
        "name": "Quick magic sword slice",
        "page": "https://mixkit.co/free-sound-effects/sword/",
        "extension": "wav",
        "sha256": "785c10dd107c35db6dec78ccf123b7badb93215a8a243b05a73c3ae565d3b997",
    },
}


SPECS = {
    "SHATTER": {
        "basename": "shatter-advancement-v1",
        "label": "SHATTER · 파쇄자",
        "duration": 1.10,
        "sync": 0.250,
        "lufs": -16.3,
        "truePeak": -1.0,
        "finalLowpass": 9_500,
        "design": "검풍 예고, 칼날 물림, 250 ms 저역 파쇄 충돌, 억제된 압력파 잔향",
        "palette": ["#ff496c", "#ffb65a"],
        "layers": [
            {"role": "movement", "id": 2793, "gain": -6.0, "highpass": 115, "lowpass": 11_000, "eq": [[4_800, 1.0, -3.5]]},
            {"role": "bite", "id": 2152, "delay": 0.095, "gain": -8.0, "highpass": 190, "lowpass": 12_000},
            {"role": "impact", "id": 2655, "trim": 0.069, "delay": 0.250, "gain": -2.5, "highpass": 45, "lowpass": 7_500},
            {"role": "tail", "id": 781, "trim": 0.292, "fadeIn": 0.240, "delay": 0.260, "gain": -14.0, "highpass": 35, "lowpass": 4_200},
        ],
    },
    "RIPOSTE": {
        "basename": "riposte-advancement-v1",
        "label": "RIPOSTE · 반격자",
        "duration": 1.25,
        "sync": 0.300,
        "lufs": -16.8,
        "truePeak": -1.0,
        "finalLowpass": 10_000,
        "design": "넓은 방벽 압력, 마력 편향, 역방향 검풍, 300 ms 반격 충돌과 금속 물성",
        "palette": ["#45ddff", "#ffc170"],
        "layers": [
            {"role": "guard", "id": 781, "gain": -8.0, "highpass": 35, "lowpass": 7_000},
            {"role": "deflection", "id": 874, "delay": 0.048, "gain": -10.0, "highpass": 95, "lowpass": 12_000},
            {"role": "counter-movement", "id": 2793, "delay": 0.145, "gain": -7.0, "highpass": 130, "lowpass": 11_000},
            {"role": "counter-impact", "id": 2655, "trim": 0.069, "delay": 0.300, "gain": -3.0, "highpass": 45, "lowpass": 7_500},
            {"role": "metal-body", "id": 2160, "delay": 0.300, "gain": -9.0, "highpass": 220, "lowpass": 10_000, "eq": [[4_900, 1.1, -4.0]]},
        ],
    },
    "AFTERIMAGE": {
        "basename": "afterimage-advancement-v1",
        "label": "AFTERIMAGE · 잔영자",
        "duration": 0.90,
        "sync": 0.178,
        "lufs": -16.3,
        "truePeak": -1.0,
        "finalLowpass": 12_500,
        "design": "겹친 단검풍과 전기성 공기 절단, 178 ms 잔상 이탈 충돌, 짧은 저역 꼬리",
        "palette": ["#36f1db", "#a486ff"],
        "layers": [
            {"role": "lead-whoosh", "id": 2792, "delay": 0.042, "gain": -5.0, "highpass": 170, "lowpass": 14_500},
            {"role": "close-whoosh", "id": 1487, "gain": -8.0, "highpass": 190, "lowpass": 13_000},
            {"role": "air-tear", "id": 1508, "gain": -6.0, "highpass": 120, "lowpass": 14_000, "eq": [[5_800, 1.0, -3.0]]},
            {"role": "exit-impact", "id": 2655, "trim": 0.069, "delay": 0.188, "gain": -12.0, "highpass": 50, "lowpass": 5_000},
        ],
    },
    "IMMORTAL": {
        "basename": "immortal-advancement-v1",
        "label": "IMMORTAL · 불멸자",
        "duration": 2.20,
        "sync": 0.333,
        "lufs": -19.5,
        "truePeak": -1.0,
        "finalLowpass": 9_500,
        "compressorThreshold": 0.030,
        "compressorRatio": 6.0,
        "compressorMakeup": 4.0,
        "design": "수계 생명력 점화, 마력 전개, 333 ms 깊은 회복 블룸, 저역 중심 장잔향",
        "palette": ["#54f0a7", "#ffd976"],
        "layers": [
            {"role": "rise", "id": 878, "gain": -7.0, "highpass": 70, "lowpass": 12_000},
            {"role": "magic-spread", "id": 874, "delay": 0.095, "gain": -10.0, "highpass": 90, "lowpass": 10_000},
            {"role": "bloom-impact", "id": 877, "trim": 0.954, "fadeIn": 0.300, "delay": 0.333, "gain": -3.0, "highpass": 38, "lowpass": 11_000},
            {"role": "tail", "id": 781, "trim": 0.189, "fadeIn": 0.320, "delay": 0.350, "gain": -16.0, "highpass": 25, "lowpass": 3_800},
        ],
    },
}


def ffmpeg_binary() -> str:
    configured = os.environ.get("FFMPEG_BINARY")
    if configured:
        return configured
    discovered = shutil.which("ffmpeg")
    if discovered:
        return discovered
    try:
        import imageio_ffmpeg

        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception as error:
        raise RuntimeError("ffmpeg unavailable; install imageio-ffmpeg or set FFMPEG_BINARY") from error


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def asset_url(asset_id: int) -> str:
    source = SOURCES[asset_id]
    return f"https://assets.mixkit.co/active_storage/sfx/{asset_id}/{asset_id}.{source['extension']}"


def source_path(asset_id: int) -> Path:
    source = SOURCES[asset_id]
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    destination = CACHE_DIR / f"mixkit-{asset_id}.{source['extension']}"
    if destination.exists():
        actual = sha256(destination)
        if actual == source["sha256"]:
            return destination
        destination.unlink()

    partial = CACHE_DIR / f".mixkit-{asset_id}.download"
    request = urllib.request.Request(
        asset_url(asset_id),
        headers={"User-Agent": "Mozilla/5.0 (compatible; CNINE preview asset builder)"},
    )
    with urllib.request.urlopen(request, timeout=60) as response, partial.open("wb") as output:
        shutil.copyfileobj(response, output)
    actual = sha256(partial)
    if actual != source["sha256"]:
        partial.unlink(missing_ok=True)
        raise RuntimeError(f"downloaded source hash mismatch for Mixkit {asset_id}: {actual}")
    partial.replace(destination)
    return destination


def run(command: list[str], *, capture: bool = False) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        command,
        check=True,
        text=True,
        stdout=subprocess.PIPE if capture else None,
        stderr=subprocess.PIPE if capture else None,
    )


def layer_filter(index: int, layer: dict, label: str) -> str:
    filters = [f"[{index}:a]atrim=start={layer.get('trim', 0):.3f}"]
    if layer.get("end") is not None:
        filters[0] += f":end={layer['end']:.3f}"
    filters.extend(
        [
            "asetpts=PTS-STARTPTS",
            f"aresample={RATE}",
            "aformat=sample_fmts=fltp:channel_layouts=stereo",
            f"highpass=f={layer.get('highpass', 30)}",
            f"lowpass=f={layer.get('lowpass', 18000)}",
            f"volume={layer.get('gain', 0):.2f}dB",
        ]
    )
    for frequency, width, gain in layer.get("eq", []):
        filters.append(f"equalizer=f={frequency}:t=q:w={width}:g={gain}")
    fade_in = layer.get("fadeIn", 0.012 if layer.get("trim", 0) > 0 else 0)
    if fade_in:
        filters.append(f"afade=t=in:st=0:d={fade_in:.3f}")
    delay_ms = round(layer.get("delay", 0) * 1000)
    if delay_ms:
        filters.append(f"adelay={delay_ms}|{delay_ms}")
    return ",".join(filters) + f"[{label}]"


def measure_loudness(ffmpeg: str, source: Path, target_lufs: float, true_peak: float) -> dict[str, str]:
    result = run(
        [
            ffmpeg,
            "-hide_banner",
            "-nostats",
            "-threads",
            "1",
            "-filter_threads",
            "1",
            "-i",
            str(source),
            "-af",
            f"loudnorm=I={target_lufs}:TP={true_peak}:LRA=5:print_format=json",
            "-f",
            "null",
            "NUL" if os.name == "nt" else "/dev/null",
        ],
        capture=True,
    )
    matches = re.findall(r"\{[\s\S]*?\}", result.stderr)
    if not matches:
        raise RuntimeError(f"unable to parse loudnorm measurement for {source}")
    return json.loads(matches[-1])


def normalize(ffmpeg: str, source: Path, destination: Path, target_lufs: float, true_peak: float) -> None:
    measured = measure_loudness(ffmpeg, source, target_lufs, true_peak)
    audio_filter = (
        f"loudnorm=I={target_lufs}:TP={true_peak}:LRA=5:"
        f"measured_I={measured['input_i']}:measured_TP={measured['input_tp']}:"
        f"measured_LRA={measured['input_lra']}:measured_thresh={measured['input_thresh']}:"
        f"offset={measured['target_offset']}:linear=true:print_format=summary,"
        f"aresample={RATE}:dither_method=none,aformat=sample_fmts=s32:channel_layouts=stereo"
    )
    run(
        [
            ffmpeg,
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-threads",
            "1",
            "-filter_threads",
            "1",
            "-i",
            str(source),
            "-af",
            audio_filter,
            "-ar",
            str(RATE),
            "-ac",
            "2",
            "-codec:a",
            "pcm_s24le",
            str(destination),
        ]
    )


def decode_pcm24(raw: bytes) -> list[float]:
    values: list[float] = []
    for index in range(0, len(raw) - 2, 3):
        value = raw[index] | (raw[index + 1] << 8) | (raw[index + 2] << 16)
        if value & 0x800000:
            value -= 0x1000000
        values.append(value / 8_388_608)
    return values


def waveform_svg(path: Path, spec: dict) -> str:
    with wave.open(str(path), "rb") as source:
        channels = source.getnchannels()
        width = source.getsampwidth()
        raw = source.readframes(source.getnframes())
    if width != 3:
        raise RuntimeError(f"expected 24-bit waveform master, got {width * 8}-bit: {path}")
    samples = decode_pcm24(raw)
    mono = [max(abs(value) for value in samples[index:index + channels]) for index in range(0, len(samples), channels)]
    bins = 220
    levels = []
    for index in range(bins):
        start = index * len(mono) // bins
        end = max(start + 1, (index + 1) * len(mono) // bins)
        levels.append(max(mono[start:end], default=0.0))
    width_px, height_px, center = 900, 120, 60
    top, bottom = [], []
    for index, level in enumerate(levels):
        x = index * width_px / (bins - 1)
        amplitude = max(1.2, level * 48)
        top.append(f"{x:.2f},{center - amplitude:.2f}")
        bottom.append(f"{x:.2f},{center + amplitude:.2f}")
    polygon = " ".join(top + list(reversed(bottom)))
    sync_x = spec["sync"] / spec["duration"] * width_px
    color_a, color_b = spec["palette"]
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width_px} {height_px}" role="img" aria-label="{spec['label']} waveform">
  <defs><linearGradient id="wave" x1="0" x2="1"><stop stop-color="{color_a}"/><stop offset="1" stop-color="{color_b}"/></linearGradient></defs>
  <rect width="{width_px}" height="{height_px}" rx="18" fill="#081018"/>
  <path d="M0 {center}H{width_px}" stroke="#24313d" stroke-width="1"/>
  <polygon points="{polygon}" fill="url(#wave)" opacity=".88"/>
  <path d="M{sync_x:.2f} 8V112" stroke="#ffffff" stroke-width="2" stroke-dasharray="4 5" opacity=".82"/>
</svg>'''


def build_effect(ffmpeg: str, key: str, spec: dict, build_dir: Path) -> dict:
    inputs: list[str] = []
    filters: list[str] = []
    labels: list[str] = []
    for index, layer in enumerate(spec["layers"]):
        inputs.extend(["-i", str(source_path(layer["id"]))])
        label = f"layer{index}"
        labels.append(f"[{label}]")
        filters.append(layer_filter(index, layer, label))

    duration = spec["duration"]
    filters.append(
        "".join(labels)
        + f"amix=inputs={len(labels)}:normalize=0:duration=longest:dropout_transition=0,"
        + f"highpass=f=28,lowpass=f={spec.get('finalLowpass', 18000)},"
        + f"acompressor=threshold={spec.get('compressorThreshold', 0.100)}:ratio={spec.get('compressorRatio', 3.5)}:attack=4:release=115:makeup={spec.get('compressorMakeup', 1.5)},"
        + "alimiter=limit=0.95:attack=5:release=70,"
        + f"atrim=start=0:end={duration:.3f},afade=t=out:st={max(0.0, duration - 0.10):.3f}:d=0.100,"
        + f"aresample={RATE}:dither_method=none,aformat=sample_fmts=s32:channel_layouts=stereo[mix]"
    )

    premaster = build_dir / f"{key.lower()}-premaster.wav"
    master = build_dir / f"{key.lower()}-master.wav"
    run(
        [
            ffmpeg,
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-threads",
            "1",
            "-filter_complex_threads",
            "1",
            *inputs,
            "-filter_complex",
            ";".join(filters),
            "-map",
            "[mix]",
            "-ar",
            str(RATE),
            "-ac",
            "2",
            "-codec:a",
            "pcm_s24le",
            str(premaster),
        ]
    )
    normalize(ffmpeg, premaster, master, spec["lufs"], spec["truePeak"])

    basename = spec["basename"]
    mp3_path = OUT_DIR / f"{basename}.mp3"
    run(
        [
            ffmpeg,
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-threads",
            "1",
            "-i",
            str(master),
            "-codec:a",
            "libmp3lame",
            "-b:a",
            "256k",
            "-ar",
            str(RATE),
            "-ac",
            "2",
            "-write_xing",
            "1",
            str(mp3_path),
        ]
    )
    waveform_path = OUT_DIR / f"{basename}-waveform.svg"
    waveform_path.write_text(waveform_svg(master, spec), encoding="utf-8")
    return {
        "advancementCode": key,
        "src": f"assets/audio/{basename}.mp3",
        "waveform": f"assets/audio/{basename}-waveform.svg",
        "bytes": mp3_path.stat().st_size,
        "sha256": sha256(mp3_path),
        "durationMs": round(duration * 1000),
        "syncPointMs": round(spec["sync"] * 1000),
        "targetLufs": spec["lufs"],
        "truePeakCeilingDbtp": spec["truePeak"],
        "design": spec["design"],
        "layers": [dict(layer) for layer in spec["layers"]],
    }


def write_provenance(manifest: dict) -> None:
    used_ids = sorted({layer["id"] for spec in SPECS.values() for layer in spec["layers"]})
    source_rows = "\n".join(
        f"| {asset_id} | {SOURCES[asset_id]['name']} | `{SOURCES[asset_id]['sha256']}` | {asset_url(asset_id)} |"
        for asset_id in used_ids
    )
    output_rows = "\n".join(
        f"| {code} | `{asset['src']}` | {asset['durationMs']} ms | {asset['syncPointMs']} ms | {asset['targetLufs']} LUFS | `{asset['sha256']}` |"
        for code, asset in manifest["assets"].items()
    )
    processing = "\n".join(
        f"- **{code}** — {SPECS[code]['design']}"
        for code in SPECS
    )
    content = f"""# PROJECT V advancement SFX v1 provenance

These four files are new preview-only mixes. They follow the current live V3
recorded-source editorial method but do **not** reuse any final live role MP3.
No oscillator, synthesized tone, generated noise, or runtime synthesis is used.

## License

- Provider: Mixkit by Envato
- License: Mixkit Sound Effects Free License
- License URL: {MIXKIT_LICENSE}
- Attribution: not required by the provider
- Scope: independent advancement-effect preview only; not connected to live runtime

## Verified recorded sources

| Mixkit ID | Title | SHA-256 | Direct asset URL |
| ---: | --- | --- | --- |
{source_rows}

## Editorial design

{processing}

All layers are decoded from the recorded sources, trimmed and aligned to the
specified impact point, filtered, mixed, compressed, limited, two-pass loudness
normalized, and encoded as stereo 48 kHz / 256 kbps MP3. The strongest intended
collision or bloom transient is aligned to the manifest `syncPointMs`.

## Final outputs

| Class | File | Duration | Sync | Target | SHA-256 |
| --- | --- | ---: | ---: | ---: | --- |
{output_rows}
"""
    (OUT_DIR / "PROVENANCE.md").write_text(content, encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Build recorded Project V advancement SFX")
    parser.add_argument("--effect", choices=tuple(SPECS), help="rebuild only one advancement effect")
    args = parser.parse_args()
    selected = [args.effect] if args.effect else list(SPECS)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    ffmpeg = ffmpeg_binary()
    manifest_path = OUT_DIR / "manifest.json"
    if args.effect and manifest_path.exists():
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    else:
        manifest = {"assets": {}}
    manifest.update(
        {
            "version": "project-v-advancement-sfx-v1",
            "previewOnly": True,
            "runtimeConnected": False,
            "sourceType": "layered-recorded-samples",
            "reusesFinalLiveAudio": False,
            "proceduralSynthesis": False,
            "runtimeSynthesis": False,
            "sampleRate": RATE,
            "channels": 2,
            "codec": "MP3 256 kbps",
            "license": "Mixkit Sound Effects Free License",
            "licenseUrl": MIXKIT_LICENSE,
            "sources": {
                str(asset_id): {
                    **source,
                    "assetUrl": asset_url(asset_id),
                }
                for asset_id, source in SOURCES.items()
                if any(layer["id"] == asset_id for spec in SPECS.values() for layer in spec["layers"])
            },
        }
    )
    with tempfile.TemporaryDirectory(prefix="cnine-advancement-sfx-build-") as temporary:
        build_dir = Path(temporary)
        for key in selected:
            manifest["assets"][key] = build_effect(ffmpeg, key, SPECS[key], build_dir)
            print(f"generated {key}: {manifest['assets'][key]['bytes']:,} bytes")

    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    write_provenance(manifest)


if __name__ == "__main__":
    main()
