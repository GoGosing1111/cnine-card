#!/usr/bin/env python3
"""Build six original stereo SFX for the disconnected Project V FX preview."""

from __future__ import annotations

import json
import math
import os
import shutil
import subprocess
import wave
from pathlib import Path

import numpy as np


RATE = 48_000
ROOT = Path(__file__).resolve().parents[1]
PREVIEW_ROOT = ROOT / "preview" / "project-v-v3-event-fx-v1"
OUT_DIR = PREVIEW_ROOT / "assets" / "audio"
RNG = np.random.default_rng(0xC91E2026)

SPECS = {
    "critical": {"duration": .92, "sync": .250, "label": "치명타", "design": "blade snap · metal crack · compact sub punch"},
    "counter": {"duration": 1.12, "sync": .300, "label": "반격", "design": "guard ping · reverse whoosh · retaliating impact"},
    "ultimate": {"duration": 1.55, "sync": .333, "label": "궁극기", "design": "rising charge · royal impact · harmonic tail"},
    "boss-ultimate": {"duration": 1.70, "sync": .353, "label": "보스 궁극기", "design": "descending pressure · heavy crush · debris tail"},
    "dodge": {"duration": .72, "sync": .178, "label": "회피", "design": "three moving air cuts · bright displacement snap"},
    "revive": {"duration": 1.65, "sync": .333, "label": "불굴 · 부활", "design": "reverse breath · life ignition · ascending fifths"},
}


def timeline(duration: float) -> np.ndarray:
    return np.arange(max(1, round(duration * RATE)), dtype=np.float64) / RATE


def smoothstep(value: np.ndarray | float) -> np.ndarray | float:
    value = np.clip(value, 0, 1)
    return value * value * (3 - 2 * value)


def envelope(duration: float, attack: float, release: float, hold: float = 0.0) -> np.ndarray:
    t = timeline(duration)
    rise = smoothstep(t / max(attack, 1 / RATE))
    tail_start = max(attack + hold, duration - release)
    fall = 1 - smoothstep((t - tail_start) / max(release, 1 / RATE))
    return np.minimum(rise, fall)


def exp_decay(duration: float, decay: float, attack: float = .001) -> np.ndarray:
    t = timeline(duration)
    return np.minimum(1, t / max(attack, 1 / RATE)) * np.exp(-np.maximum(0, t - attack) / decay)


def oscillator_sweep(duration: float, start: float, end: float, curve: float = 1.0, phase: float = 0.0) -> np.ndarray:
    t = timeline(duration)
    ratio = np.power(np.clip(t / max(duration, 1 / RATE), 0, 1), curve)
    frequency = start + (end - start) * ratio
    phase_curve = phase + 2 * np.pi * np.cumsum(frequency) / RATE
    return np.sin(phase_curve)


def filtered_noise(duration: float, smooth: int = 16, highpass: bool = False) -> np.ndarray:
    raw = RNG.standard_normal(len(timeline(duration)))
    width = max(2, int(smooth))
    kernel = np.hanning(width * 2 + 1)
    kernel /= kernel.sum()
    low = np.convolve(raw, kernel, mode="same")
    result = raw - low if highpass else low
    peak = float(np.max(np.abs(result))) or 1.0
    return result / peak


def stereo(signal: np.ndarray, pan: float | np.ndarray = 0.0) -> np.ndarray:
    if np.isscalar(pan):
        pans = np.full(len(signal), float(pan))
    else:
        pans = np.asarray(pan, dtype=np.float64)
        if len(pans) != len(signal):
            pans = np.interp(np.linspace(0, 1, len(signal)), np.linspace(0, 1, len(pans)), pans)
    angle = (np.clip(pans, -1, 1) + 1) * math.pi / 4
    return np.column_stack((signal * np.cos(angle), signal * np.sin(angle)))


def add(track: np.ndarray, signal: np.ndarray, start: float, gain: float = 1.0, pan: float | np.ndarray = 0.0) -> None:
    payload = stereo(signal, pan) * gain
    begin = max(0, round(start * RATE))
    end = min(len(track), begin + len(payload))
    if end > begin:
        track[begin:end] += payload[:end - begin]


def moving_pan(length: int, start: float, end: float) -> np.ndarray:
    return np.linspace(start, end, length)


def whoosh(duration: float, low: float, high: float, bright: float = .5) -> np.ndarray:
    noise = filtered_noise(duration, max(3, round(18 - bright * 10)), highpass=True)
    tone = oscillator_sweep(duration, low, high, .8) * .24
    return (noise * (.55 + bright * .25) + tone) * envelope(duration, duration * .28, duration * .42, duration * .08)


def sub_hit(duration: float, start: float, end: float, decay: float) -> np.ndarray:
    return oscillator_sweep(duration, start, end, .72) * exp_decay(duration, decay, .001)


def metal_hit(duration: float, frequencies: tuple[float, ...], decay: float) -> np.ndarray:
    t = timeline(duration)
    result = np.zeros_like(t)
    for index, frequency in enumerate(frequencies):
        result += np.sin(2 * np.pi * frequency * t + index * .71) * np.exp(-t / (decay * (1 + index * .16))) / (1 + index * .48)
    result += filtered_noise(duration, 5, highpass=True) * np.exp(-t / .026) * .35
    return result


def chime(duration: float, frequency: float, decay: float = .55) -> np.ndarray:
    t = timeline(duration)
    result = np.zeros_like(t)
    for multiple, gain in ((1, 1), (2.01, .36), (3.98, .16), (6.02, .08)):
        result += np.sin(2 * np.pi * frequency * multiple * t) * np.exp(-t / (decay / math.sqrt(multiple))) * gain
    return result * envelope(duration, .006, .12, .08)


def crack(duration: float, density: int = 5) -> np.ndarray:
    t = timeline(duration)
    result = np.zeros_like(t)
    for index in range(density):
        start = min(duration * .62, index * duration * .075 + float(RNG.uniform(0, duration * .055)))
        begin = round(start * RATE)
        if begin >= len(result):
            continue
        tail = t[:len(result) - begin]
        burst = filtered_noise(len(tail) / RATE, 3, highpass=True) * np.exp(-tail / (.015 + index * .004))
        result[begin:] += burst * (1 - index / (density * 1.45))
    return result


def room(track: np.ndarray, amount: float, taps: tuple[tuple[float, float], ...] = ((.043, .34), (.087, .21), (.149, .12))) -> np.ndarray:
    wet = track.copy()
    for delay, gain in taps:
        shift = round(delay * RATE)
        if 0 < shift < len(track):
            wet[shift:] += track[:-shift, ::-1] * gain * amount
    return wet


def build_critical(spec: dict) -> np.ndarray:
    track = np.zeros((round(spec["duration"] * RATE), 2))
    sweep = whoosh(.26, 310, 1950, .92)
    add(track, sweep, 0, .54, moving_pan(len(sweep), -.72, .68))
    add(track, metal_hit(.54, (790, 1185, 1810, 2680), .16), spec["sync"], .47, .12)
    add(track, crack(.34, 7), spec["sync"], .52, -.08)
    add(track, sub_hit(.52, 96, 42, .18), spec["sync"], .62)
    add(track, chime(.42, 1320, .22), spec["sync"] + .045, .12, .28)
    return room(track, .33)


def build_counter(spec: dict) -> np.ndarray:
    track = np.zeros((round(spec["duration"] * RATE), 2))
    add(track, metal_hit(.34, (620, 930, 1480), .18), .055, .24, -.62)
    sweep = whoosh(.30, 920, 260, .76)[::-1]
    add(track, sweep, .075, .5, moving_pan(len(sweep), .78, -.7))
    add(track, metal_hit(.62, (515, 785, 1210, 2020), .22), spec["sync"], .5, .34)
    add(track, sub_hit(.58, 82, 38, .23), spec["sync"], .53)
    add(track, crack(.4, 5), spec["sync"] + .012, .3, .5)
    return room(track, .38)


def build_ultimate(spec: dict) -> np.ndarray:
    track = np.zeros((round(spec["duration"] * RATE), 2))
    charge = oscillator_sweep(spec["sync"], 145, 820, 1.45) * envelope(spec["sync"], .05, .035, .08)
    charge += filtered_noise(spec["sync"], 20, highpass=True) * envelope(spec["sync"], .09, .04, .07) * .25
    add(track, charge, 0, .4, moving_pan(len(charge), -.32, .32))
    add(track, sub_hit(.92, 88, 31, .34), spec["sync"], .72)
    add(track, metal_hit(.72, (420, 690, 1045, 1690), .29), spec["sync"], .43)
    add(track, crack(.52, 8), spec["sync"] + .008, .42)
    add(track, chime(.88, 523.25, .72), spec["sync"] + .11, .16, -.28)
    add(track, chime(.76, 783.99, .6), spec["sync"] + .17, .13, .31)
    return room(track, .52, ((.051, .32), (.109, .22), (.183, .14), (.277, .08)))


def build_boss(spec: dict) -> np.ndarray:
    track = np.zeros((round(spec["duration"] * RATE), 2))
    pressure = oscillator_sweep(spec["sync"] + .03, 118, 39, .72) * envelope(spec["sync"] + .03, .018, .025, .16)
    pressure += filtered_noise(spec["sync"] + .03, 52) * envelope(spec["sync"] + .03, .035, .025, .15) * .36
    add(track, pressure, 0, .5)
    add(track, sub_hit(1.08, 64, 24, .44), spec["sync"], .86)
    add(track, metal_hit(.82, (94, 141, 282, 565), .38), spec["sync"], .54, -.12)
    add(track, crack(.7, 11), spec["sync"] + .016, .55, .08)
    add(track, filtered_noise(.9, 48) * exp_decay(.9, .36, .002), spec["sync"], .35)
    return room(track, .46, ((.062, .28), (.131, .19), (.241, .12)))


def build_dodge(spec: dict) -> np.ndarray:
    track = np.zeros((round(spec["duration"] * RATE), 2))
    for index, (start, pan_a, pan_b) in enumerate(((.0, -.88, .68), (.045, -.58, .86), (.097, -.78, .72))):
        sweep = whoosh(.23 - index * .018, 470 + index * 160, 2380 + index * 280, .95)
        add(track, sweep, start, .42 - index * .045, moving_pan(len(sweep), pan_a, pan_b))
    snap = metal_hit(.26, (1490, 2240, 3160), .075)
    add(track, snap, spec["sync"], .16, .55)
    add(track, filtered_noise(.34, 13, highpass=True) * exp_decay(.34, .11, .004), spec["sync"], .16, .72)
    return room(track, .19, ((.027, .24), (.061, .12)))


def build_revive(spec: dict) -> np.ndarray:
    track = np.zeros((round(spec["duration"] * RATE), 2))
    swell = filtered_noise(spec["sync"], 38) * envelope(spec["sync"], .18, .018, .1)
    swell += oscillator_sweep(spec["sync"], 178, 620, 1.35) * envelope(spec["sync"], .12, .02, .11) * .42
    add(track, swell, 0, .34, moving_pan(len(swell), -.24, .24))
    ignition = filtered_noise(.28, 9, highpass=True) * exp_decay(.28, .075, .008)
    add(track, ignition, spec["sync"], .2)
    add(track, chime(.92, 523.25, .76), spec["sync"], .2, -.32)
    add(track, chime(.88, 659.25, .71), spec["sync"] + .075, .18, .08)
    add(track, chime(.82, 783.99, .66), spec["sync"] + .15, .16, .34)
    lift = oscillator_sweep(.82, 242, 1280, 1.18) * envelope(.82, .05, .22, .28)
    add(track, lift, spec["sync"] + .02, .18, moving_pan(len(lift), -.36, .36))
    return room(track, .56, ((.057, .28), (.121, .2), (.213, .13), (.337, .07)))


BUILDERS = {
    "critical": build_critical,
    "counter": build_counter,
    "ultimate": build_ultimate,
    "boss-ultimate": build_boss,
    "dodge": build_dodge,
    "revive": build_revive,
}


def finish(track: np.ndarray) -> np.ndarray:
    track -= np.mean(track, axis=0, keepdims=True)
    track = np.tanh(track * 1.18)
    edge = min(round(.008 * RATE), len(track) // 5)
    if edge:
        track[:edge] *= np.linspace(0, 1, edge)[:, None]
        track[-edge:] *= np.linspace(1, 0, edge)[:, None]
    peak = float(np.max(np.abs(track))) or 1
    return (track / peak * .91).astype(np.float32)


def write_wav(path: Path, track: np.ndarray) -> None:
    pcm = np.clip(track * 32767, -32768, 32767).astype("<i2")
    with wave.open(str(path), "wb") as output:
        output.setnchannels(2)
        output.setsampwidth(2)
        output.setframerate(RATE)
        output.writeframes(pcm.tobytes())


def waveform_svg(track: np.ndarray, label: str, sync: float, duration: float) -> str:
    bins = 180
    mono = np.max(np.abs(track), axis=1)
    segments = np.array_split(mono, bins)
    levels = [float(np.max(segment)) if len(segment) else 0 for segment in segments]
    width, height, center = 900, 120, 60
    path_top = []
    path_bottom = []
    for index, level in enumerate(levels):
        x = index * width / (bins - 1)
        amp = max(1.2, level * 48)
        path_top.append(f"{x:.2f},{center-amp:.2f}")
        path_bottom.append(f"{x:.2f},{center+amp:.2f}")
    polygon = " ".join(path_top + list(reversed(path_bottom)))
    sync_x = sync / duration * width
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" role="img" aria-label="{label} waveform">
  <defs><linearGradient id="wave" x1="0" x2="1"><stop stop-color="#42dfff"/><stop offset=".5" stop-color="#fff1a6"/><stop offset="1" stop-color="#ff5067"/></linearGradient></defs>
  <rect width="{width}" height="{height}" rx="18" fill="#081018"/>
  <path d="M0 {center}H{width}" stroke="#24313d" stroke-width="1"/>
  <polygon points="{polygon}" fill="url(#wave)" opacity=".82"/>
  <path d="M{sync_x:.2f} 8V112" stroke="#ffffff" stroke-width="2" stroke-dasharray="4 5" opacity=".76"/>
</svg>'''


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


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    ffmpeg = ffmpeg_binary()
    manifest = {"version": "project-v-v3-event-sfx-preview-v1", "previewOnly": True, "sampleRate": RATE, "channels": 2, "codec": "MP3 192 kbps", "assets": {}}
    for key, spec in SPECS.items():
        track = finish(BUILDERS[key](spec))
        wav_path = OUT_DIR / f".{key}-build.wav"
        mp3_path = OUT_DIR / f"{key}.mp3"
        write_wav(wav_path, track)
        subprocess.run([
            ffmpeg, "-y", "-hide_banner", "-loglevel", "error", "-i", str(wav_path),
            "-af", "loudnorm=I=-16:TP=-1.2:LRA=7", "-codec:a", "libmp3lame", "-b:a", "192k",
            "-ar", str(RATE), "-ac", "2", "-write_xing", "1", str(mp3_path),
        ], check=True)
        wav_path.unlink()
        waveform_path = OUT_DIR / f"{key}-waveform.svg"
        waveform_path.write_text(waveform_svg(track, spec["label"], spec["sync"], spec["duration"]), encoding="utf-8")
        manifest["assets"][key] = {
            "src": f"assets/audio/{key}.mp3",
            "waveform": f"assets/audio/{key}-waveform.svg",
            "bytes": mp3_path.stat().st_size,
            "durationMs": round(spec["duration"] * 1000),
            "syncPointMs": round(spec["sync"] * 1000),
            "design": spec["design"],
        }
        print(f"generated {key}: {mp3_path.stat().st_size:,} bytes")
    (OUT_DIR / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

    visual_manifest_path = PREVIEW_ROOT / "manifest.json"
    visual_manifest = json.loads(visual_manifest_path.read_text(encoding="utf-8"))
    for effect in visual_manifest["effects"]:
        effect.update(manifest["assets"][effect["id"]])
    visual_manifest["audioContract"] = {
        "previewOnly": True,
        "source": "original procedural offline master",
        "runtimeSynthesis": False,
        "sampleRate": RATE,
        "channels": 2,
        "codec": "MP3 192 kbps",
        "targetLoudness": "-16 LUFS",
        "truePeakCeiling": "-1.2 dBTP",
    }
    visual_manifest_path.write_text(json.dumps(visual_manifest, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
