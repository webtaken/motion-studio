"""Mezcla final: música + sfx (de out/<slug>/meta.json) → WAV normalizado a -14 LUFS.

Uso: python audio/mix.py --meta out/demo/meta.json --music videos/demo/audio/music.wav \
       --out out/demo/mix.wav --duration 15
"""
import argparse
import json
import os
import re
import subprocess
import tempfile

import numpy as np

from dsp import SR, db, normalize_peak, place, soft_clip
from sfx import make
from wavio import FFMPEG, fit_length, read_audio, write_wav

DUCK = {"impact": 5.0, "boom": 5.0, "whoosh": 3.0, "riser": 0.0, "glitch": 3.0}


def loudnorm(src, dst, target=-14.0, tp=-1.0):
    """Normalización en dos pasadas (ffmpeg loudnorm, modo lineal)."""
    p1 = subprocess.run([FFMPEG, "-hide_banner", "-nostats", "-i", src, "-af",
                         f"loudnorm=I={target}:TP={tp}:LRA=11:print_format=json", "-f", "null", "-"],
                        capture_output=True, text=True, check=True)
    m = re.search(r"\{[^{}]*\"input_i\"[^{}]*\}", p1.stderr, re.S)
    if not m:
        raise SystemExit("loudnorm no devolvió medidas")
    j = json.loads(m.group(0))
    if float(j["input_i"]) < -70:  # silencio
        subprocess.run([FFMPEG, "-y", "-v", "error", "-i", src, "-ar", str(SR), dst], check=True)
        return
    af = (f"loudnorm=I={target}:TP={tp}:LRA=11:measured_I={j['input_i']}:measured_TP={j['input_tp']}:"
          f"measured_LRA={j['input_lra']}:measured_thresh={j['input_thresh']}:offset={j['target_offset']}:linear=true")
    subprocess.run([FFMPEG, "-y", "-v", "error", "-i", src, "-af", af, "-ar", str(SR), "-ac", "2",
                    "-c:a", "pcm_s16le", dst], check=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--meta", required=True)
    ap.add_argument("--music", default="none")
    ap.add_argument("--out", required=True)
    ap.add_argument("--duration", type=float)
    ap.add_argument("--music-gain", type=float, default=-2.0, help="dB")
    a = ap.parse_args()

    meta = json.load(open(a.meta))
    dur = a.duration or meta["duration"]
    n = int(round(dur * SR))
    seed = int(meta.get("seed", 1))

    music = np.zeros((n, 2))
    if a.music != "none":
        music = fit_length(read_audio(a.music), n) * db(a.music_gain)

    sfx = np.zeros((n, 2))
    duck = np.ones(n)
    for i, ev in enumerate(meta.get("sfx", [])):
        kind = ev.get("type", "tick")
        opts = {k: v for k, v in ev.items() if k not in ("t", "type")}
        x, anchor, gain = make(kind, seed=seed * 1000 + i, opts=opts)
        start = int(round(ev["t"] * SR)) - anchor
        place(sfx, x, start, gain)
        dd = DUCK.get(kind, 0)
        if dd and a.music != "none":
            c = int(round(ev["t"] * SR))
            w = np.arange(-int(0.02 * SR), int(0.3 * SR))
            shape = np.where(w < 0, 1 + w / (0.02 * SR), np.exp(-w / (0.12 * SR)))
            idx = c + w
            ok = (idx >= 0) & (idx < n)
            duck[idx[ok]] = np.minimum(duck[idx[ok]], 1 - (1 - db(-dd)) * shape[ok])

    out = music * duck[:, None] + sfx
    peak = np.max(np.abs(out))
    if peak > 0.95:
        out = soft_clip(out / peak * 1.05, 1.1) * 0.95

    if a.music == "none":
        # Solo sfx: sin normalizar por sonoridad (subiría demasiado los clics).
        write_wav(a.out, normalize_peak(out, -3.0) if peak > 0 else out)
        return
    with tempfile.TemporaryDirectory() as d:
        raw = os.path.join(d, "raw.wav")
        write_wav(raw, out)
        loudnorm(raw, a.out)


if __name__ == "__main__":
    main()
