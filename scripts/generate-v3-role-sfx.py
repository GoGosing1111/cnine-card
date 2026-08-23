#!/usr/bin/env python3
"""Generate the compressed V3 combat audio sprite.

The renderer uses one short mono asset instead of many network requests.
The mix layers original synthesis with the CC0 recordings documented next to
the output asset. Set FFMPEG_BINARY when ffmpeg is not available on PATH.
"""

from __future__ import annotations

import json
import math
import os
import shutil
import subprocess
import tempfile
import urllib.request
import wave
import zipfile
from pathlib import Path

import numpy as np


RATE = 32_000
GAP_SECONDS = 0.035
ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "assets" / "sfx" / "v3"
RNG = np.random.default_rng(0xC91E)

CC0_DOWNLOADS = {
    "swishes.zip": "https://opengameart.org/sites/default/files/swishes.zip",
    "organic.zip": "https://opengameart.org/sites/default/files/tinysized.zip",
    "bing1.wav": "https://opengameart.org/sites/default/files/bing1.wav",
    "bong1.wav": "https://opengameart.org/sites/default/files/bong1.wav",
    "thud2.wav": "https://opengameart.org/sites/default/files/thud2.wav",
    "thud3.wav": "https://opengameart.org/sites/default/files/thud3.wav",
}


def ensure_sources() -> Path:
    configured = os.environ.get("CNINE_V3_AUDIO_SOURCES")
    if configured:
        return Path(configured)
    cache = Path(tempfile.gettempdir()) / "cnine-v3-audio-cc0-v1"
    ready = cache / ".ready"
    if ready.exists():
        return cache
    cache.mkdir(parents=True, exist_ok=True)
    for name, url in CC0_DOWNLOADS.items():
        target = cache / name
        if not target.exists():
            print(f"downloading CC0 source: {name}")
            urllib.request.urlretrieve(url, target)
        if target.suffix == ".zip":
            destination = cache / target.stem
            destination.mkdir(exist_ok=True)
            with zipfile.ZipFile(target) as archive:
                archive.extractall(destination)
    ready.touch()
    return cache


SOURCE_ROOT = ensure_sources()


def timeline(duration: float) -> np.ndarray:
    return np.arange(max(1, round(duration * RATE)), dtype=np.float64) / RATE


def exp_env(t: np.ndarray, attack: float, decay: float, floor: float = 0.0001) -> np.ndarray:
    rise = np.minimum(1.0, t / max(attack, 1 / RATE))
    return rise * np.exp(-np.maximum(0.0, t - attack) / max(decay, 1 / RATE)) + floor


def sweep(t: np.ndarray, start: float, end: float, duration: float, phase: float = 0.0) -> np.ndarray:
    ratio = max(end, 1.0) / max(start, 1.0)
    if abs(ratio - 1.0) < 1e-6:
        phase_curve = 2 * np.pi * start * t
    else:
        phase_curve = 2 * np.pi * start * duration * (np.power(ratio, t / duration) - 1) / math.log(ratio)
    return np.sin(phase_curve + phase)


def smooth_noise(length: int, width: int) -> np.ndarray:
    raw = RNG.standard_normal(length)
    if width <= 1:
        return raw
    kernel = np.hanning(width * 2 + 1)
    kernel /= kernel.sum()
    return np.convolve(raw, kernel, mode="same")


def high_noise(length: int, width: int = 8) -> np.ndarray:
    raw = RNG.standard_normal(length)
    return raw - smooth_noise(length, width)


def resonator(t: np.ndarray, frequency: float, decay: float, phase: float = 0.0) -> np.ndarray:
    return np.sin(2 * np.pi * frequency * t + phase) * np.exp(-t / decay)


def delay_mix(signal: np.ndarray, taps: tuple[tuple[float, float], ...]) -> np.ndarray:
    result = signal.copy()
    for delay, gain in taps:
        shift = round(delay * RATE)
        if 0 < shift < len(signal):
            result[shift:] += signal[:-shift] * gain
    return result


def transient(t: np.ndarray, brightness: float = 1.0) -> np.ndarray:
    noise = high_noise(len(t), max(2, round(11 / max(brightness, 0.2))))
    click = np.zeros_like(t)
    click[: min(12, len(t))] = np.linspace(1.0, 0.0, min(12, len(t)))
    return noise * np.exp(-t / 0.018) * 0.75 + click


def finalize(signal: np.ndarray, peak: float = 0.88) -> np.ndarray:
    signal = signal - float(np.mean(signal))
    signal = np.tanh(signal * 1.38)
    edge = min(round(0.008 * RATE), len(signal) // 4)
    if edge:
        signal[:edge] *= np.linspace(0, 1, edge)
        signal[-edge:] *= np.linspace(1, 0, edge)
    maximum = float(np.max(np.abs(signal))) or 1.0
    return (signal / maximum * peak).astype(np.float32)


SOURCE_CACHE: dict[tuple[str, float], np.ndarray] = {}


def read_pcm(relative: str, speed: float = 1.0) -> np.ndarray:
    key = (relative, speed)
    if key in SOURCE_CACHE:
        return SOURCE_CACHE[key]
    path = SOURCE_ROOT / relative
    with wave.open(str(path), "rb") as source:
        channels, width, source_rate, frames = source.getnchannels(), source.getsampwidth(), source.getframerate(), source.getnframes()
        raw = source.readframes(frames)
    if width == 1:
        values = (np.frombuffer(raw, dtype=np.uint8).astype(np.float64) - 128) / 128
    elif width == 2:
        values = np.frombuffer(raw, dtype="<i2").astype(np.float64) / 32768
    elif width == 3:
        octets = np.frombuffer(raw, dtype=np.uint8).reshape(-1, 3)
        packed = octets[:, 0].astype(np.int32) | (octets[:, 1].astype(np.int32) << 8) | (octets[:, 2].astype(np.int32) << 16)
        packed = np.where(packed & 0x800000, packed - 0x1000000, packed)
        values = packed.astype(np.float64) / 8388608
    elif width == 4:
        values = np.frombuffer(raw, dtype="<i4").astype(np.float64) / 2147483648
    else:
        raise ValueError(f"unsupported PCM width: {width} ({path})")
    if channels > 1:
        values = values.reshape(-1, channels).mean(axis=1)
    threshold = max(0.0015, float(np.max(np.abs(values))) * 0.012)
    active = np.flatnonzero(np.abs(values) >= threshold)
    if active.size:
        lead = round(source_rate * 0.006)
        tail = round(source_rate * 0.045)
        values = values[max(0, int(active[0]) - lead):min(len(values), int(active[-1]) + tail)]
    destination_length = max(1, round(len(values) * RATE / (source_rate * speed)))
    positions = np.arange(destination_length) * source_rate * speed / RATE
    result = np.interp(positions, np.arange(len(values)), values, left=0, right=0)
    peak = float(np.max(np.abs(result))) or 1
    result = (result / peak).astype(np.float32)
    SOURCE_CACHE[key] = result
    return result


def mix_clip(duration: float, layers: tuple[tuple[np.ndarray, float, float], ...], room: float = 0.0) -> np.ndarray:
    result = np.zeros(round(duration * RATE), dtype=np.float64)
    for source, start, gain in layers:
        begin = max(0, round(start * RATE))
        end = min(len(result), begin + len(source))
        if end > begin:
            result[begin:end] += source[:end - begin] * gain
    if room:
        result = delay_mix(result, ((0.041, room * 0.42), (0.079, room * 0.25), (0.133, room * 0.13)))
    return result


def cinematic_sub(duration: float, frequency: float = 72, decay: float = 0.2) -> np.ndarray:
    t = timeline(duration)
    return sweep(t, frequency, max(27, frequency * 0.48), duration) * exp_env(t, 0.001, decay)


def attack_cast(variant: int) -> np.ndarray:
    heavy = ("swishes/swishes/swish-7.wav", "swishes/swishes/swish-9.wav")[variant]
    organic = ("organic/sfx-cc0/tube-plastic-whoosh-01.wav", "organic/sfx-cc0/tube-plastic-whoosh-02.wav")[variant]
    return finalize(mix_clip(.34, ((read_pcm(heavy, .82), .0, .9), (read_pcm(organic, 1.16), .015, .34)), .12), .86)


def attack_hit(variant: int) -> np.ndarray:
    clash = ("sword-clash-01.wav", "sword-clash-03.wav", "sword-clash-05.wav")[variant]
    thud = ("thud2.wav", "thud3.wav", "thud2.wav")[variant]
    cut = ("apple-cut-01.wav", "apple-cut-02.wav", "wood-twigs-break-01.wav")[variant]
    result = mix_clip(.66, (
        (read_pcm(f"organic/sfx-cc0/{clash}", 1.02 + variant * .035), 0, .74),
        (read_pcm(thud, .9 + variant * .05), 0, .62),
        (read_pcm(f"organic/sfx-cc0/{cut}", 1.12), .006, .18),
        (cinematic_sub(.58, 83 + variant * 3, .18), 0, .2),
    ), .17)
    return finalize(result, .91)


def defense_cast(variant: int) -> np.ndarray:
    sheath = ("knife-sheathe-01.wav", "seax-sheathe-01.wav")[variant]
    air = ("tube-plastic-whoosh-02.wav", "compressed-air-spray-01.wav")[variant]
    result = mix_clip(.46, ((read_pcm(f"organic/sfx-cc0/{sheath}", 1.15), 0, .52), (read_pcm(f"organic/sfx-cc0/{air}", .92), .02, .34)), .16)
    return finalize(result, .82)


def defense_hit(variant: int) -> np.ndarray:
    metal = ("organic/sfx-cc0/metal-hammer-hit-01.wav", "bong1.wav", "organic/sfx-cc0/metal-hammer-hit-02.wav")[variant]
    support = ("thud2.wav", "thud3.wav", "thud2.wav")[variant]
    clash = ("sword-clash-02.wav", "sword-clash-04.wav", "sword-clash-01.wav")[variant]
    result = mix_clip(.82, (
        (read_pcm(metal, 1.06 + variant * .04), 0, .76),
        (read_pcm(support, .84), 0, .66),
        (read_pcm(f"organic/sfx-cc0/{clash}", .94), .012, .24),
        (cinematic_sub(.76, 66 + variant * 2, .27), 0, .28),
    ), .21)
    return finalize(result, .92)


def speed_cast(variant: int) -> np.ndarray:
    names = ((1, 10, 3), (2, 11, 4))[variant]
    layers = tuple((read_pcm(f"swishes/swishes/swish-{name}.wav", 1.08 + index * .08), index * .054, .72 - index * .1) for index, name in enumerate(names))
    return finalize(mix_clip(.31, layers, .06), .86)


def speed_hit(variant: int) -> np.ndarray:
    clashes = ((5, 3, 1), (3, 5, 2), (1, 4, 5))[variant]
    layers: list[tuple[np.ndarray, float, float]] = []
    for index, number in enumerate(clashes):
        layers.append((read_pcm(f"organic/sfx-cc0/sword-clash-0{number}.wav", 1.35 + index * .08), index * .052, .62 - index * .08))
    layers.append((read_pcm(f"swishes/swishes/swish-{10 + variant}.wav", 1.15), 0, .3))
    layers.append((cinematic_sub(.4, 94, .1), .0, .13))
    return finalize(mix_clip(.46, tuple(layers), .09), .9)


def hp_cast(variant: int) -> np.ndarray:
    vial = ("vial-glass-open-01.wav", "vial-glass-uncork-01.wav")[variant]
    drop = ("water-drop-01.wav", "water-drop-03.wav")[variant]
    discharge = read_pcm("organic/sfx-cc0/paralyzer-discharge-01.wav", .82 + variant * .06)
    bed = smooth_noise(round(.66 * RATE), 48) * np.exp(-timeline(.66) / .34)
    result = mix_clip(.66, ((discharge, 0, .2), (read_pcm(f"organic/sfx-cc0/{vial}", 1.08), .018, .42), (read_pcm(f"organic/sfx-cc0/{drop}", .92), .14, .5), (bed, 0, .08)), .24)
    return finalize(result, .78)


def hp_hit(variant: int) -> np.ndarray:
    cut = ("apple-cut-03.wav", "apple-cut-02.wav", "apple-cut-01.wav")[variant]
    glass = ("vial-glass-close-01.wav", "bottle-glass-cork-01.wav", "water-drop-02.wav")[variant]
    result = mix_clip(.66, (
        (read_pcm(f"organic/sfx-cc0/{cut}", .94), 0, .58),
        (read_pcm(f"organic/sfx-cc0/{glass}", .88), .028, .36),
        (read_pcm("thud3.wav", .82), 0, .43),
        (cinematic_sub(.58, 76 + variant * 2, .18), 0, .2),
    ), .2)
    return finalize(result, .88)


def critical_layer(variant: int) -> np.ndarray:
    crack = ("wood-twigs-break-01.wav", "wood-twigs-break-02.wav")[variant]
    clash = ("sword-clash-03.wav", "sword-clash-05.wav")[variant]
    result = mix_clip(.68, (
        (read_pcm(f"organic/sfx-cc0/{crack}", 1.05), 0, .6),
        (read_pcm(f"organic/sfx-cc0/{clash}", 1.12), .004, .58),
        (read_pcm("thud2.wav" if variant == 0 else "thud3.wav", .8), 0, .72),
        (cinematic_sub(.62, 91 + variant * 4, .22), 0, .34),
    ), .2)
    return finalize(result, .94)


def boss_layer(variant: int) -> np.ndarray:
    metal = "bong1.wav" if variant == 0 else "organic/sfx-cc0/metal-hammer-hit-01.wav"
    debris = "wood-twigs-break-02.wav" if variant == 0 else "wood-twigs-break-01.wav"
    result = mix_clip(.96, (
        (read_pcm(metal, .74 + variant * .05), 0, .76),
        (read_pcm("thud2.wav", .7), 0, .8),
        (read_pcm(f"organic/sfx-cc0/{debris}", .82), .018, .3),
        (cinematic_sub(.9, 58 + variant * 2, .34), 0, .5),
    ), .27)
    return finalize(result, .95)


def build_clips() -> list[tuple[str, np.ndarray]]:
    clips: list[tuple[str, np.ndarray]] = []
    factories = {
        "attack_cast": attack_cast,
        "attack_hit": attack_hit,
        "defense_cast": defense_cast,
        "defense_hit": defense_hit,
        "speed_cast": speed_cast,
        "speed_hit": speed_hit,
        "hp_cast": hp_cast,
        "hp_hit": hp_hit,
    }
    for name, factory in factories.items():
        count = 2 if name.endswith("cast") else 3
        clips.extend((f"{name}_{index + 1}", factory(index)) for index in range(count))
    clips.extend((f"critical_{index + 1}", critical_layer(index)) for index in range(2))
    clips.extend((f"boss_{index + 1}", boss_layer(index)) for index in range(2))
    return clips


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    clips = build_clips()
    gap = np.zeros(round(GAP_SECONDS * RATE), dtype=np.float32)
    cursor = 0
    manifest: dict[str, object] = {"version": 3, "sampleRate": RATE, "cues": {}}
    chunks: list[np.ndarray] = []
    for name, clip in clips:
        manifest["cues"][name] = {
            "offset": round(cursor / RATE, 6),
            "duration": round(len(clip) / RATE, 6),
        }
        chunks.extend((clip, gap))
        cursor += len(clip) + len(gap)
    sprite = np.concatenate(chunks)
    pcm = np.clip(sprite * 32767, -32768, 32767).astype("<i2")
    wav_path = OUT_DIR / ".role-combat-sprite-build.wav"
    with wave.open(str(wav_path), "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(RATE)
        output.writeframes(pcm.tobytes())
    mp3_path = OUT_DIR / "role-combat-sprite-v2.mp3"
    ffmpeg = os.environ.get("FFMPEG_BINARY") or shutil.which("ffmpeg")
    if not ffmpeg:
        raise RuntimeError("ffmpeg not found; set FFMPEG_BINARY to the executable path")
    subprocess.run([
        ffmpeg, "-y", "-hide_banner", "-loglevel", "error", "-i", str(wav_path),
        "-codec:a", "libmp3lame", "-b:a", "96k", "-ar", str(RATE), "-ac", "1",
        "-write_xing", "1", str(mp3_path),
    ], check=True)
    wav_path.unlink()
    manifest["asset"] = "/assets/sfx/v3/role-combat-sprite-v2.mp3?v=3-fastload"
    manifest["bytes"] = mp3_path.stat().st_size
    (OUT_DIR / "role-combat-sprite-v2.json").write_text(
        json.dumps(manifest, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )
    module_payload = json.dumps(manifest, ensure_ascii=False, separators=(",", ":"))
    module_path = ROOT / "preview" / "project-v-v3" / "source" / "battle" / "RoleAudioSpriteManifest.js"
    module_path.write_text(
        f"const manifest={module_payload};\nmanifest.cues=Object.freeze(manifest.cues);\n"
        "export const V3_ROLE_AUDIO_SPRITE=Object.freeze(manifest);\n",
        encoding="utf-8",
    )
    print(f"generated {len(clips)} cues, {len(sprite) / RATE:.2f}s, {mp3_path.stat().st_size:,} bytes")


if __name__ == "__main__":
    main()
