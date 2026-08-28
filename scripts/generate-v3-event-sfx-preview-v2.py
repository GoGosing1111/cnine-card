#!/usr/bin/env python3
"""Build six preview-only combat SFX from licensed recorded source material.

This generator deliberately contains no oscillators, synthesized tones, generated
noise, or runtime audio. It trims, aligns, layers, EQs, compresses, and masters
recorded Mixkit source effects so the main transient lands on each visual impact
frame.
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
PREVIEW_ROOT = ROOT / "preview" / "project-v-v3-event-fx-v1"
OUT_DIR = PREVIEW_ROOT / "assets" / "audio"
CACHE_DIR = Path(os.environ.get("CNINE_V3_SFX_CACHE", Path(tempfile.gettempdir()) / "cnine-v3-sfx-sources"))
MIXKIT_LICENSE = "https://mixkit.co/license/#sfxFree"


SOURCES = {
    772: {
        "name": "Quick zoom impact",
        "page": "https://mixkit.co/free-sound-effects/impact/",
        "sha256": "a9acddce67b0ad80e44674964ac2cdcd91810593049f49d2afea508c8f15add1",
    },
    781: {
        "name": "Cinematic impact waves",
        "page": "https://mixkit.co/free-sound-effects/impact/",
        "sha256": "1dd7d383688ce07544322279ef43ccc0adec94ed65a51abb437863bcd67070cd",
    },
    873: {
        "name": "Light spell",
        "page": "https://mixkit.co/free-sound-effects/spell/",
        "sha256": "394090b28b6a63689047954bcb86576045341cd42da9ee74b624c7e28bd23206",
    },
    874: {
        "name": "Spell waves",
        "page": "https://mixkit.co/free-sound-effects/spell/",
        "sha256": "9f62b33ffe1690e266ec60416c702d3390f05361ab44b407609ef15354210479",
    },
    877: {
        "name": "Healing water spell with deep hit",
        "page": "https://mixkit.co/free-sound-effects/spell/",
        "sha256": "ce0da16d048dad829c5ed19f9c710e8406b71b1b1675ab3c17bec0846b02e5f2",
    },
    878: {
        "name": "Heal soft water spell",
        "page": "https://mixkit.co/free-sound-effects/spell/",
        "sha256": "27f574f4a35c633c3f26016b62e4cfe8d53b2523e47b9045b164e7dff946c032",
    },
    1085: {
        "name": "Rewind magic spell",
        "page": "https://mixkit.co/free-sound-effects/spell/",
        "sha256": "2ea47afa92626e84fa0648dfc22aa20e38b476b883edcbd1d80eae325dd12d25",
    },
    1485: {
        "name": "Metal hit woosh",
        "page": "https://mixkit.co/free-sound-effects/sword/",
        "sha256": "706a25a0fba25d317071a441c1e09737aef64b4ac2618f59197d4ca735e6302f",
    },
    1487: {
        "name": "Dagger woosh",
        "page": "https://mixkit.co/free-sound-effects/sword/",
        "sha256": "f8483970bec9e69ed7234545da9ee59a733c5310c8becbd3db8b6a63064c3049",
    },
    1508: {
        "name": "Lightning whip",
        "page": "https://mixkit.co/free-sound-effects/lightning/",
        "sha256": "6326cfd06e64e0b9b1a0da07327950c5a1325cf9e77bcca43b6b244528de3de2",
    },
    1685: {
        "name": "Explosion spell",
        "page": "https://mixkit.co/free-sound-effects/spell/",
        "sha256": "0c247e2a229afbc5c911de7f53224b6012a7148377a13c4fe552f9a340033931",
    },
    1687: {
        "name": "Dramatic metal explosion impact",
        "page": "https://mixkit.co/free-sound-effects/impact/",
        "sha256": "4d9c68705bcd669377a98c194c45c8ac7fa272ec4420e6b15aac0ada45925584",
    },
    2160: {
        "name": "Metallic sword strike",
        "page": "https://mixkit.co/free-sound-effects/sword/",
        "sha256": "2717a659587f7962dbfdfc59b2716894620834b9d24836794560d86bf10b4c30",
    },
    2599: {
        "name": "Heavy electric shockwave impact",
        "page": "https://mixkit.co/free-sound-effects/impact/",
        "sha256": "e4b4a658a77136544978137b3760ea1b6c959c455641142466edc7d146ca61c4",
    },
    2601: {
        "name": "Electricity lightning blast",
        "page": "https://mixkit.co/free-sound-effects/lightning/",
        "sha256": "f81e65d00ed906a974a5cb94330e3c56a42b4cf97a9e5ee4055ccb0f1ae67224",
    },
    2765: {
        "name": "Sword strikes armor",
        "page": "https://mixkit.co/free-sound-effects/sword/",
        "sha256": "0c05aeb28b5a795bf1e309f9bc209e00df954af9dd2b2da825b0bc83696bda64",
    },
    2792: {
        "name": "Fast sword whoosh",
        "page": "https://mixkit.co/free-sound-effects/sword/",
        "sha256": "e1de4e011ee6369aed772202a979590f03261e3607147bd2f04eda58ba5746eb",
    },
    2793: {
        "name": "Quick magic sword slice",
        "page": "https://mixkit.co/free-sound-effects/sword/",
        "sha256": "785c10dd107c35db6dec78ccf123b7badb93215a8a243b05a73c3ae565d3b997",
    },
    2795: {
        "name": "Heavy sword smashes metal",
        "page": "https://mixkit.co/free-sound-effects/sword/",
        "sha256": "f59abe6b03b22b37fa63553fdf72e3fcf190df0467efd762c4d2665f3c08de81",
    },
    2797: {
        "name": "Sword hits heavy metal",
        "page": "https://mixkit.co/free-sound-effects/sword/",
        "sha256": "e449eacce54ec3430f8f4ace7a5ff22aafaa833f710631daf67d879382a2d32f",
    },
}


SPECS = {
    "critical": {
        "duration": 1.35,
        "sync": 0.250,
        "label": "치명타",
        "lufs": -12.5,
        "basename": "critical-combat-v3",
        "audioProfile": "layered-recorded-critical-v3",
        "supersedes": ["critical-combat-v2"],
        "design": "마검 가속 · 이중 금속 파쇄 · 저역 잔향",
        "layers": [
            {"id": 2793, "delay": 0.027, "gain": -2.5, "highpass": 80, "lowpass": 17_000},
            {"id": 2160, "delay": 0.190, "gain": -3.0, "highpass": 160, "lowpass": 16_000},
            {"id": 2795, "trim": 0.171, "fadeIn": 0.220, "gain": -2.0, "highpass": 45, "lowpass": 12_500},
            {"id": 781, "trim": 0.292, "fadeIn": 0.230, "gain": -11.0, "highpass": 35, "lowpass": 6_500},
        ],
    },
    "counter": {
        "duration": 1.18,
        "sync": 0.300,
        "label": "반격",
        "lufs": -13.0,
        "design": "선행 방어 충돌 · 역방향 검풍 · 반격 금속타",
        "layers": [
            {"id": 2765, "gain": -8.0, "highpass": 150, "lowpass": 15_000},
            {"id": 1487, "delay": 0.135, "gain": -3.5, "highpass": 130, "lowpass": 17_000},
            {"id": 2797, "delay": 0.106, "gain": -1.5, "highpass": 70, "lowpass": 13_500},
            {"id": 2160, "delay": 0.240, "gain": -3.0, "highpass": 180, "lowpass": 16_000},
        ],
    },
    "ultimate": {
        "duration": 2.10,
        "sync": 0.333,
        "label": "궁극기",
        "lufs": -13.0,
        "design": "마력 흡입 · 마검 절단 · 폭발성 에너지 방출",
        "layers": [
            {"id": 1085, "trim": 0.922, "fadeIn": 0.280, "gain": -8.0, "highpass": 85, "lowpass": 10_000},
            {"id": 874, "delay": 0.232, "gain": -7.0, "highpass": 120, "lowpass": 14_000},
            {"id": 2793, "delay": 0.110, "gain": -4.0, "highpass": 75, "lowpass": 16_000},
            {"id": 1685, "delay": 0.138, "gain": -2.5, "highpass": 40, "lowpass": 14_500},
            {"id": 2601, "trim": 2.084, "fadeIn": 0.320, "gain": -5.0, "highpass": 35, "lowpass": 15_500},
        ],
    },
    "boss-ultimate": {
        "duration": 2.65,
        "sync": 0.353,
        "label": "보스 궁극기",
        "lufs": -12.0,
        "design": "압력 강하 · 금속 붕괴 · 대형 충격파 잔향",
        "layers": [
            {"id": 2599, "trim": 3.403, "fadeIn": 0.300, "gain": -2.0, "highpass": 28, "lowpass": 15_000},
            {"id": 1687, "delay": 0.247, "gain": -2.0, "highpass": 32, "lowpass": 13_000},
            {"id": 781, "trim": 0.189, "fadeIn": 0.320, "gain": -4.0, "highpass": 25, "lowpass": 11_500},
            {"id": 2601, "trim": 2.064, "fadeIn": 0.310, "gain": -7.0, "highpass": 40, "lowpass": 14_000},
        ],
    },
    "dodge": {
        "duration": 0.86,
        "sync": 0.178,
        "label": "회피",
        "lufs": -14.0,
        "design": "초고속 검풍 · 공기 절단 · 잔상 이탈",
        "layers": [
            {"id": 2792, "delay": 0.015, "gain": -2.0, "highpass": 160, "lowpass": 18_000},
            {"id": 1487, "delay": 0.043, "gain": -3.0, "highpass": 180, "lowpass": 17_500},
            {"id": 1508, "trim": 0.003, "gain": -5.0, "highpass": 120, "lowpass": 16_000},
            {"id": 772, "trim": 0.236, "gain": -8.0, "highpass": 90, "lowpass": 14_000},
        ],
    },
    "revive": {
        "duration": 2.40,
        "sync": 0.333,
        "label": "불굴 · 부활",
        "lufs": -14.0,
        "compressorThreshold": 0.020,
        "compressorRatio": 8.0,
        "compressorMakeup": 8.0,
        "design": "생명력 역류 · 수계 마법 점화 · 깊은 회복 파동",
        "layers": [
            {"id": 1085, "trim": 0.922, "fadeIn": 0.300, "gain": -7.0, "highpass": 90, "lowpass": 10_000},
            {"id": 878, "delay": 0.123, "gain": -3.0, "highpass": 70, "lowpass": 15_000},
            {"id": 877, "trim": 0.954, "fadeIn": 0.300, "gain": -2.0, "highpass": 38, "lowpass": 13_000},
            {"id": 873, "delay": 0.107, "gain": -5.0, "highpass": 110, "lowpass": 14_000},
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


def source_path(asset_id: int) -> Path:
    source = SOURCES[asset_id]
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    destination = CACHE_DIR / f"mixkit-{asset_id}.wav"
    if destination.exists():
        actual = sha256(destination)
        if actual == source["sha256"]:
            return destination
        raise RuntimeError(f"cached source hash mismatch: {destination} ({actual})")

    partial = CACHE_DIR / f".mixkit-{asset_id}.download"
    request = urllib.request.Request(
        f"https://assets.mixkit.co/active_storage/sfx/{asset_id}/{asset_id}.wav",
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
    fade_in = layer.get("fadeIn", 0.012 if layer.get("trim", 0) > 0 else 0)
    if fade_in:
        filters.append(f"afade=t=in:st=0:d={fade_in:.3f}")
    delay_ms = round(layer.get("delay", 0) * 1000)
    if delay_ms:
        filters.append(f"adelay={delay_ms}|{delay_ms}")
    return ",".join(filters) + f"[{label}]"


def measure_loudness(ffmpeg: str, source: Path, target_lufs: float) -> dict[str, str]:
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
            f"loudnorm=I={target_lufs}:TP=-1.0:LRA=5:print_format=json",
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


def normalize(ffmpeg: str, source: Path, destination: Path, target_lufs: float) -> None:
    measured = measure_loudness(ffmpeg, source, target_lufs)
    audio_filter = (
        f"loudnorm=I={target_lufs}:TP=-1.0:LRA=5:"
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


def waveform_svg(path: Path, label: str, sync: float, duration: float) -> str:
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
    sync_x = sync / duration * width_px
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width_px} {height_px}" role="img" aria-label="{label} waveform">
  <defs><linearGradient id="wave" x1="0" x2="1"><stop stop-color="#42dfff"/><stop offset=".5" stop-color="#fff1a6"/><stop offset="1" stop-color="#ff5067"/></linearGradient></defs>
  <rect width="{width_px}" height="{height_px}" rx="18" fill="#081018"/>
  <path d="M0 {center}H{width_px}" stroke="#24313d" stroke-width="1"/>
  <polygon points="{polygon}" fill="url(#wave)" opacity=".86"/>
  <path d="M{sync_x:.2f} 8V112" stroke="#ffffff" stroke-width="2" stroke-dasharray="4 5" opacity=".82"/>
</svg>'''


def build_effect(ffmpeg: str, key: str, spec: dict, build_dir: Path) -> dict:
    inputs: list[str] = []
    filters: list[str] = []
    labels: list[str] = []
    source_ids: list[int] = []
    for index, layer in enumerate(spec["layers"]):
        asset_id = layer["id"]
        source_ids.append(asset_id)
        inputs.extend(["-i", str(source_path(asset_id))])
        label = f"layer{index}"
        labels.append(f"[{label}]")
        filters.append(layer_filter(index, layer, label))

    duration = spec["duration"]
    tail_start = max(0.0, duration - 0.10)
    compressor_threshold = spec.get("compressorThreshold", 0.115)
    compressor_ratio = spec.get("compressorRatio", 3.2)
    compressor_makeup = spec.get("compressorMakeup", 1.35)
    filters.append(
        "".join(labels)
        + f"amix=inputs={len(labels)}:normalize=0:duration=longest:dropout_transition=0,"
        + "highpass=f=28,lowpass=f=18000,"
        + f"acompressor=threshold={compressor_threshold}:ratio={compressor_ratio}:attack=4:release=115:makeup={compressor_makeup},"
        + "alimiter=limit=0.95:attack=5:release=70,"
        + f"atrim=start=0:end={duration:.3f},afade=t=out:st={tail_start:.3f}:d=0.100,"
        + f"aresample={RATE}:dither_method=none,aformat=sample_fmts=s32:channel_layouts=stereo[mix]"
    )

    premaster = build_dir / f"{key}-premaster.wav"
    master = build_dir / f"{key}-master.wav"
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
    normalize(ffmpeg, premaster, master, spec["lufs"])

    basename = spec.get("basename", f"{key}-combat-v2")
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
    waveform_path.write_text(waveform_svg(master, spec["label"], spec["sync"], duration), encoding="utf-8")
    return {
        "src": f"assets/audio/{basename}.mp3",
        "audio": f"assets/audio/{basename}.mp3",
        "waveform": f"assets/audio/{basename}-waveform.svg",
        "bytes": mp3_path.stat().st_size,
        "sha256": sha256(mp3_path),
        "durationMs": round(duration * 1000),
        "syncPointMs": round(spec["sync"] * 1000),
        "design": spec["design"],
        "sourceIds": source_ids,
        "audioProfile": spec.get("audioProfile", "layered-recorded-combat-v2"),
    }


def remove_legacy_outputs(keys: list[str]) -> None:
    for key in keys:
        for suffix in (".mp3", "-waveform.svg"):
            legacy = OUT_DIR / f"{key}{suffix}"
            if legacy.exists():
                legacy.unlink()
        for basename in SPECS[key].get("supersedes", []):
            for suffix in (".mp3", "-waveform.svg"):
                superseded = OUT_DIR / f"{basename}{suffix}"
                if superseded.exists():
                    superseded.unlink()


def main() -> None:
    parser = argparse.ArgumentParser(description="Build recorded Project V event SFX")
    parser.add_argument("--effect", choices=tuple(SPECS), help="rebuild only one effect and preserve the accepted outputs")
    args = parser.parse_args()
    selected = [args.effect] if args.effect else list(SPECS)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    ffmpeg = ffmpeg_binary()
    manifest_path = OUT_DIR / "manifest.json"
    if args.effect and manifest_path.exists():
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    else:
        manifest = {"assets": {}}
    manifest.update({
        "version": "project-v-v3-event-sfx-preview-v3",
        "previewOnly": True,
        "sourceType": "layered-recorded-samples",
        "proceduralSynthesis": False,
        "runtimeSynthesis": False,
        "sampleRate": RATE,
        "channels": 2,
        "codec": "MP3 256 kbps",
        "license": "Mixkit Free License",
        "licenseUrl": MIXKIT_LICENSE,
        "sources": {
            str(asset_id): {
                **source,
                "assetUrl": f"https://assets.mixkit.co/active_storage/sfx/{asset_id}/{asset_id}.wav",
            }
            for asset_id, source in SOURCES.items()
        },
    })
    with tempfile.TemporaryDirectory(prefix="cnine-v3-sfx-build-") as temporary:
        build_dir = Path(temporary)
        for key in selected:
            spec = SPECS[key]
            manifest["assets"][key] = build_effect(ffmpeg, key, spec, build_dir)
            print(f"generated {key}: {manifest['assets'][key]['bytes']:,} bytes")

    remove_legacy_outputs(selected)
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

    visual_manifest_path = PREVIEW_ROOT / "manifest.json"
    visual_manifest = json.loads(visual_manifest_path.read_text(encoding="utf-8"))
    visual_manifest["version"] = "project-v-v3-event-fx-preview-v3"
    for effect in visual_manifest["effects"]:
        if effect["id"] in selected:
            effect.update(manifest["assets"][effect["id"]])
    visual_manifest["audioContract"] = {
        "previewOnly": True,
        "sourceType": "layered-recorded-samples",
        "proceduralSynthesis": False,
        "runtimeSynthesis": False,
        "sampleRate": RATE,
        "channels": 2,
        "codec": "MP3 256 kbps",
        "targetLoudness": "-12 to -14 LUFS by event weight",
        "truePeakCeiling": "-1.0 dBTP",
        "license": "Mixkit Free License",
        "provenance": "PROVENANCE.md",
    }
    visual_manifest_path.write_text(json.dumps(visual_manifest, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
