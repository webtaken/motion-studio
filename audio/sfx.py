"""Efectos de sonido sintetizados. Cada uno devuelve (estéreo, ancla): el ancla es la
muestra que cae exacto en el t del evento (ej. un riser termina en t, un whoosh pica en t).
Si existe assets/_sfx/<tipo>.wav se usa ese archivo en lugar del sintetizado."""
import os

import numpy as np

from dsp import SR, db, env_exp, fft_filter, osc_sine, pan, stereo, sweep
from wavio import read_audio

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Ganancia por defecto (dB) de cada tipo para que la mezcla salga pareja.
GAIN = {"click": -9, "tap": -11, "tick": -15, "pop": -9, "whoosh": -11, "riser": -13,
        "impact": -5, "boom": -6, "ding": -11, "type": -16, "glitch": -13, "swipe": -12}


def _t(dur):
    return np.arange(int(dur * SR)) / SR


def click(rng):
    t = _t(0.05)
    body = osc_sine(2600 + rng.uniform(-200, 200), len(t)) * np.exp(-t / 0.006)
    noise = fft_filter(rng.standard_normal(len(t)), lo=2000) * np.exp(-t / 0.002) * 0.6
    low = osc_sine(220, len(t)) * np.exp(-t / 0.012) * 0.5
    return body * 0.6 + noise + low, 0


def tap(rng):
    t = _t(0.08)
    return osc_sine(900 + rng.uniform(-60, 60), len(t)) * np.exp(-t / 0.012) + \
        fft_filter(rng.standard_normal(len(t)), lo=800, hi=4000) * np.exp(-t / 0.004) * 0.4, 0


def tick(rng):
    t = _t(0.03)
    return fft_filter(rng.standard_normal(len(t)), lo=5000) * np.exp(-t / 0.003) + \
        osc_sine(4200, len(t)) * np.exp(-t / 0.004) * 0.4, 0


def pop(rng):
    n = int(0.12 * SR)
    t = np.arange(n) / SR
    return sweep(950 + rng.uniform(-80, 80), 280, n) * np.exp(-t / 0.03), 0


def whoosh(rng, dur=0.5):
    n = int(dur * SR)
    p = np.arange(n) / n
    noise = rng.standard_normal(n)
    out = np.zeros(n)
    chunks = 20
    for c in range(chunks):
        a, b = c * n // chunks, (c + 1) * n // chunks
        x = c / chunks
        center = 400 + 4200 * np.sin(np.pi * x) ** 1.5
        out[a:b] = fft_filter(noise[a:b], lo=center * 0.5, hi=center * 1.6)
    env = np.sin(np.pi * p) ** 2 * (p < 0.6) + (p >= 0.6) * np.exp(-(p - 0.6) / 0.12) * np.sin(np.pi * 0.6) ** 2
    mono = out * env
    # Paneo que cruza de izquierda a derecha.
    a = (np.clip(p * 1.4 - 0.2, 0, 1)) * np.pi / 2
    return np.stack([mono * np.cos(a), mono * np.sin(a)], 1) * 1.6, int(0.6 * n)


def riser(rng, dur=1.6):
    n = int(dur * SR)
    p = np.arange(n) / n
    noise = rng.standard_normal(n)
    out = np.zeros(n)
    for c in range(24):
        a, b = c * n // 24, (c + 1) * n // 24
        hi = 500 + 9000 * (c / 24) ** 2
        out[a:b] = fft_filter(noise[a:b], lo=hi * 0.3, hi=hi)
    tone = sweep(160, 1500, n) * 0.3
    return (out * 0.8 + tone) * p ** 2.5, n - 1


def impact(rng):
    n = int(1.4 * SR)
    t = np.arange(n) / SR
    f = 42 + 90 * np.exp(-t / 0.04)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.45)
    noise = fft_filter(rng.standard_normal(n), hi=2500) * np.exp(-t / 0.12) * 0.6
    air = fft_filter(rng.standard_normal(n), lo=5000) * np.exp(-t / 0.5) * 0.15
    return body + noise + air, 0


def boom(rng):
    n = int(2.0 * SR)
    t = np.arange(n) / SR
    f = 32 + 36 * np.exp(-t / 0.09)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.8), 0


def ding(rng):
    n = int(1.4 * SR)
    t = np.arange(n) / SR
    f0 = 1318.5
    partials = [(1, 1.0, 0.9), (2.76, 0.5, 0.4), (5.4, 0.25, 0.2), (8.93, 0.12, 0.1)]
    out = sum(a * np.sin(2 * np.pi * f0 * r * t) * np.exp(-t / d) for r, a, d in partials)
    return out * 0.6, 0


def typekey(rng):
    t = _t(0.04)
    return fft_filter(rng.standard_normal(len(t)), lo=1500, hi=7000) * np.exp(-t / 0.006) + \
        osc_sine(rng.uniform(300, 420), len(t)) * np.exp(-t / 0.01) * 0.5, 0


def glitch(rng):
    n = int(0.22 * SR)
    out = np.zeros(n)
    pos = 0
    while pos < n:
        ln = int(rng.uniform(0.008, 0.03) * SR)
        f = rng.choice([180, 440, 1200, 3100])
        seg = np.sign(osc_sine(f, min(ln, n - pos))) * rng.uniform(0.2, 0.7)
        out[pos:pos + len(seg)] = seg
        pos += ln + int(rng.uniform(0, 0.01) * SR)
    return fft_filter(out, hi=8000) * 0.6, 0


def swipe(rng):
    s, anchor = whoosh(rng, dur=0.28)
    return s, anchor


SYNTH = {"click": click, "tap": tap, "tick": tick, "pop": pop, "whoosh": whoosh, "riser": riser,
         "impact": impact, "boom": boom, "ding": ding, "type": typekey, "glitch": glitch, "swipe": swipe}


def make(kind, seed=0, opts=None):
    """Devuelve (audio estéreo, ancla en muestras, ganancia lineal)."""
    opts = opts or {}
    rng = np.random.default_rng(seed)
    custom = os.path.join(ROOT, "assets", "_sfx", f"{kind}.wav")
    if os.path.exists(custom):
        x = read_audio(custom)
        anchor = len(x) - 1 if opts.get("anchor") == "end" or kind == "riser" else 0
    else:
        fn = SYNTH.get(kind)
        if fn is None:
            print(f"! sfx desconocido '{kind}', uso 'tick'. Tipos: {', '.join(SYNTH)}")
            fn = tick
        x, anchor = fn(rng)
        x = stereo(x) if x.ndim == 1 else x
        if opts.get("anchor") == "end":
            anchor = len(x) - 1
        elif opts.get("anchor") == "start":
            anchor = 0
    if "pan" in opts:
        x = pan(x.mean(axis=1), float(opts["pan"])) * np.sqrt(2)
    gain = db(GAIN.get(kind, -12)) * float(opts.get("gain", 1.0))
    return x, anchor, gain
