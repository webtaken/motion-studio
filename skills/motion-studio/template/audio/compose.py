"""Compone música original en código, cuadrada al BPM y a las secciones del video.

Uso: python audio/compose.py --bpm 120 --duration 15 --style minimal --key Am \
       --sections '[{"start":0,"end":2,"energy":"hook"}]' --out music.wav --beats beats.json

Estilos: minimal (tech limpio), house (4x4 con clap y bajo a contratiempo),
lofi (swing, suave, rhodes), cinematic (golpes, pulsos, cuerdas).
Energías de sección: hook, intro, build, drop, break, outro.
"""
import argparse
import json
import re

import numpy as np

import dsp
from dsp import SR, db, env_exp, fft_filter, midi_hz, osc_saw, osc_sine, osc_tri, pan, place, sweep
from wavio import write_wav

LAYERS = {
    "hook":  dict(kick=True, back=False, hat="8", ohat=False, bass=True, pad=True, arp=False),
    "intro": dict(kick=False, back=False, hat="8", ohat=False, bass=False, pad=True, arp=False),
    "build": dict(kick=True, back=True, hat="8", ohat=False, bass=True, pad=True, arp=False),
    "drop":  dict(kick=True, back=True, hat="16", ohat=True, bass=True, pad=True, arp=True),
    "break": dict(kick=False, back=False, hat="4", ohat=False, bass=False, pad=True, arp=True),
    "outro": dict(kick=False, back=False, hat=None, ohat=False, bass=False, pad=True, arp=False),
}

STYLES = {
    "minimal":   dict(swing=0.5, back="rim", bass="sine", pad_hz=1800, pad_gain=-21, arp="tri", kick_decay=0.26),
    "house":     dict(swing=0.5, back="clap", bass="saw", pad_hz=2600, pad_gain=-20, arp="tri", kick_decay=0.3),
    "lofi":      dict(swing=0.6, back="snare", bass="sine", pad_hz=1400, pad_gain=-18, arp=None, kick_decay=0.22),
    "cinematic": dict(swing=0.5, back=None, bass="pulse", pad_hz=2200, pad_gain=-17, arp="tri", kick_decay=0.9),
}

NOTES = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


def parse_key(key):
    m = re.match(r"^([A-Ga-g])([#b]?)(m?)$", key.strip())
    if not m:
        raise SystemExit(f"Tonalidad inválida: {key} (ej: Am, C, F#m)")
    pc = NOTES[m.group(1).upper()] + (1 if m.group(2) == "#" else -1 if m.group(2) == "b" else 0)
    return pc % 12, m.group(3) == "m"


def default_sections(duration, spb):
    def snap(x):
        return round(x / spb) * spb
    a = snap(min(2.0, duration * 0.15))
    b = snap(duration * 0.4)
    c = snap(duration * 0.85)
    return [
        {"start": 0, "end": a, "energy": "hook"},
        {"start": a, "end": b, "energy": "build"},
        {"start": b, "end": c, "energy": "drop"},
        {"start": c, "end": duration, "energy": "outro"},
    ]


# ---------------- instrumentos (one-shots) ----------------

def kick(decay=0.28, soft=False):
    n = int(0.6 * SR)
    t = np.arange(n) / SR
    f = 44 + 120 * np.exp(-t / 0.032)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / decay)
    click = fft_filter(np.random.default_rng(1).standard_normal(n) * np.exp(-t / 0.0025), lo=1500) * 0.35
    k = body + (0 if soft else click)
    return fft_filter(k, hi=3000) if soft else k


def boom():
    n = int(1.8 * SR)
    t = np.arange(n) / SR
    f = 34 + 40 * np.exp(-t / 0.08)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.7)
    noise = fft_filter(np.random.default_rng(2).standard_normal(n) * np.exp(-t / 0.25), hi=400) * 0.4
    return body + noise


def clap(rng):
    n = int(0.35 * SR)
    t = np.arange(n) / SR
    noise = rng.standard_normal(n)
    e = np.zeros(n)
    for off in (0.0, 0.011, 0.022):
        e += np.where(t >= off, np.exp(-(t - off) / 0.008), 0)
    e += np.where(t >= 0.03, np.exp(-(t - 0.03) / 0.09), 0) * 0.6
    return fft_filter(noise * e, lo=900, hi=6000) * 0.9


def snare(rng):
    n = int(0.3 * SR)
    t = np.arange(n) / SR
    tone = np.sin(2 * np.pi * 185 * t) * np.exp(-t / 0.05)
    noise = fft_filter(rng.standard_normal(n), lo=1200, hi=7000) * np.exp(-t / 0.08)
    return fft_filter(tone * 0.6 + noise * 0.8, hi=5000)


def rim(rng):
    n = int(0.08 * SR)
    t = np.arange(n) / SR
    return (np.sin(2 * np.pi * 1750 * t) * 0.7 + rng.standard_normal(n) * 0.3) * np.exp(-t / 0.012)


def hat(rng, open_=False):
    n = int((0.35 if open_ else 0.08) * SR)
    t = np.arange(n) / SR
    noise = fft_filter(rng.standard_normal(n), lo=7000)
    return noise * np.exp(-t / (0.16 if open_ else 0.022)) * (0.5 if open_ else 0.6)


def crash(rng):
    n = int(2.2 * SR)
    t = np.arange(n) / SR
    return fft_filter(rng.standard_normal(n), lo=4500) * np.exp(-t / 0.7) * 0.5


def bass_note(freq, dur, kind):
    n = int(dur * SR)
    if kind == "saw":
        x = fft_filter(osc_saw(freq, n, max_hz=900), hi=700)
    elif kind == "pulse":
        x = fft_filter(osc_saw(freq, n, max_hz=1200), hi=500)
    else:
        x = osc_sine(freq, n) + 0.25 * osc_sine(freq * 2, n)
    return x * dsp.adsr(n, a=0.004, d=0.12, s=0.75, r=min(0.06, dur * 0.3))


def pad_chord(freqs, dur, cutoff):
    n = int(dur * SR)
    left = np.zeros(n)
    right = np.zeros(n)
    for f in freqs:
        for det, side in ((-0.07, 0), (0.0, 2), (0.07, 1)):
            v = osc_saw(f * 2 ** (det / 12), n, max_hz=cutoff, phase=(f * 0.013 + det * 31) % 6.28)
            if side == 0:
                left += v
            elif side == 1:
                right += v
            else:
                left += v * 0.7
                right += v * 0.7
    e = dsp.adsr(n, a=min(0.35, dur * 0.3), d=0.2, s=0.85, r=min(0.4, dur * 0.3))
    out = np.stack([left, right], axis=1) * e[:, None]
    return fft_filter(out, hi=cutoff) / (len(freqs) * 2.4)


def pluck(freq, kind="tri"):
    n = int(0.35 * SR)
    x = osc_tri(freq, n) if kind == "tri" else osc_sine(freq, n)
    return x * env_exp(n, 0.12)


def rhodes(freqs, dur):
    n = int(dur * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for f in freqs:
        out += (np.sin(2 * np.pi * f * t) + 0.3 * np.sin(4 * np.pi * f * t) + 0.08 * np.sin(6 * np.pi * f * t)) * np.exp(-t / 1.4)
    trem = 1 + 0.12 * np.sin(2 * np.pi * 4.2 * t)
    return out * trem * dsp.adsr(n, a=0.005, d=0.3, s=0.9, r=0.25) / len(freqs)


def riser(dur, rng):
    n = int(dur * SR)
    p = np.arange(n) / n
    noise = rng.standard_normal(n)
    out = np.zeros(n)
    chunks = 24
    for c in range(chunks):
        a = c * n // chunks
        b = (c + 1) * n // chunks
        hi = 600 + 9000 * (c / chunks) ** 2
        seg = fft_filter(noise[a:b], lo=hi * 0.25, hi=hi)
        out[a:b] = seg
    tone = sweep(180, 1400, n) * 0.25
    return (out * 0.8 + tone) * p ** 2.2


# ---------------- composición ----------------

def chord_notes(root_pc, degree, quality, octave=4):
    base = 12 * (octave + 1) + (root_pc + degree) % 12
    third = 3 if quality == "m" else 4
    return [base, base + third, base + 7]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--bpm", type=float, default=120)
    ap.add_argument("--duration", type=float, required=True)
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--style", default="minimal", choices=list(STYLES))
    ap.add_argument("--key", default="Am")
    ap.add_argument("--sections", default="[]")
    ap.add_argument("--out", required=True)
    ap.add_argument("--beats")
    a = ap.parse_args()

    rng = np.random.default_rng(a.seed)
    st = STYLES[a.style]
    spb = 60.0 / a.bpm
    step = spb / 4
    dur = a.duration
    n = int(round(dur * SR))
    sections = json.loads(a.sections) or default_sections(dur, spb)
    sections = sorted(sections, key=lambda s: s["start"])

    def section_at(t):
        cur = sections[0]
        for s in sections:
            if s["start"] <= t + 1e-6:
                cur = s
        return cur

    root_pc, minor = parse_key(a.key)
    prog = [(0, "m"), (8, ""), (3, ""), (10, "")] if minor else [(0, ""), (7, ""), (9, "m"), (5, "")]

    drums = np.zeros((n, 2))
    bass = np.zeros((n, 2))
    pads = np.zeros((n, 2))
    lead = np.zeros((n, 2))
    fx = np.zeros((n, 2))

    K = kick(st["kick_decay"], soft=a.style == "lofi") if a.style != "cinematic" else boom()
    HAT = hat(rng)
    OHAT = hat(rng, open_=True)
    BACK = {"clap": clap(rng), "snare": snare(rng), "rim": rim(rng), None: None}[st["back"]]
    kicks = []

    def swing(i):
        return (st["swing"] - 0.5) * 2 * step if i % 2 == 1 else 0.0

    total_steps = int(np.ceil(dur / step))
    for i in range(total_steps):
        t = i * step
        if t >= dur:
            break
        sec = section_at(t)
        L = LAYERS.get(sec.get("energy", "drop"), LAYERS["drop"])
        sub = i % 4
        beat = (i // 4) % 4
        ts = t + swing(i)
        vel = 1 + rng.uniform(-0.08, 0.08)

        # Bombo
        if L["kick"]:
            if a.style == "cinematic":
                hit = sub == 0 and beat in (0, 2) and sec.get("energy") in ("drop", "hook")
            elif a.style == "lofi":
                hit = (sub == 0 and beat == 0) or (sub == 2 and beat == 1) or (sub == 0 and beat == 2)
            else:
                hit = sub == 0
            if hit:
                place(drums, pan(K * db(-3) * vel), ts * SR)
                kicks.append(ts)

        # Contratiempo (clap / snare / rim) en 2 y 4
        if L["back"] and BACK is not None and sub == 0 and beat in (1, 3):
            place(drums, pan(BACK * db(-8) * vel, 0.05), ts * SR)

        # Redoble en el último compás de un "build"
        if sec.get("energy") == "build" and BACK is not None and sec["end"] - t <= 4 * spb + 1e-6 and sec["end"] - t > 0:
            if sub % 2 == 0 or sec["end"] - t <= spb:
                prog_ = 1 - (sec["end"] - t) / (4 * spb)
                place(drums, pan(BACK * db(-20 + 12 * prog_), 0.1), ts * SR)

        # Hi-hats
        h = L["hat"]
        if h and a.style != "cinematic":
            if (h == "16") or (h == "8" and sub % 2 == 0) or (h == "4" and sub == 0):
                g = db(-17 if sub % 2 else -14) * (0.7 if a.style == "lofi" else 1)
                place(drums, pan(HAT * g * vel, 0.3), ts * SR)
        if L["ohat"] and sub == 2 and a.style in ("house", "minimal"):
            place(drums, pan(OHAT * db(-19), -0.25), ts * SR)

        # Bajo
        bar = int(t // (4 * spb))
        deg, q = prog[bar % len(prog)]
        bass_midi = 12 * 2 + 9 + (root_pc - 9 + deg) % 12  # alrededor de A1–G#2
        if L["bass"]:
            f = midi_hz(bass_midi)
            if st["bass"] == "saw" and sub == 2:
                place(bass, pan(bass_note(f, step * 1.6, "saw") * db(-9)), ts * SR)
            elif st["bass"] == "pulse" and sub % 2 == 0:
                place(bass, pan(bass_note(f, step * 1.2, "pulse") * db(-8)), ts * SR)
            elif st["bass"] == "sine" and sub == 0 and beat in (0, 2):
                place(bass, pan(bass_note(f, spb * 1.8, "sine") * db(-8)), ts * SR)

        # Arpegio
        arp_step = sub in (0, 2, 3) if a.style == "minimal" else sub % 2 == 0
        if L["arp"] and st["arp"] and arp_step:
            notes = chord_notes(root_pc, deg, q, octave=5)
            note = notes[(i // 2) % 3] + (12 if (i // 6) % 2 else 0)
            place(lead, pan(pluck(midi_hz(note), st["arp"]) * db(-19), 0.35 if i % 4 < 2 else -0.35), ts * SR)

    # Acordes (uno por compás)
    bars = int(np.ceil(dur / (4 * spb)))
    for b in range(bars):
        t = b * 4 * spb
        sec = section_at(t)
        if not LAYERS.get(sec.get("energy", "drop"), LAYERS["drop"])["pad"]:
            continue
        deg, q = prog[b % len(prog)]
        notes = chord_notes(root_pc, deg, q, octave=3 if a.style == "cinematic" else 4)
        freqs = [midi_hz(m) for m in notes]
        length = min(4 * spb + 0.3, dur - t + 0.5)
        if a.style == "lofi":
            place(pads, pan(rhodes(freqs, length) * db(st["pad_gain"])), t * SR)
        else:
            gain = db(st["pad_gain"] - (4 if sec.get("energy") in ("hook", "build") else 0))
            place(pads, dsp.stereo(pad_chord(freqs, length, st["pad_hz"])) * gain, t * SR)

    # Transiciones: riser antes de cada drop, crash/boom al entrar
    for i, s in enumerate(sections):
        e = s.get("energy")
        if e in ("drop", "outro") and s["start"] > 0.5:
            r_len = min(4 * spb, s["start"])
            place(fx, pan(riser(r_len, rng) * db(-20)), (s["start"] - r_len) * SR)
            place(fx, pan(crash(rng) * db(-16), 0.0), s["start"] * SR)
            if e == "outro" or a.style == "cinematic":
                place(fx, pan(boom() * db(-6)), s["start"] * SR)
        if e == "hook" and s["start"] == 0:
            place(fx, pan(crash(rng) * db(-18)), 0)

    # Lofi: crujido de vinilo
    if a.style == "lofi":
        crackle = np.zeros(n)
        idx = rng.integers(0, n, size=int(dur * 14))
        crackle[idx] = rng.uniform(-0.3, 0.3, size=len(idx))
        drums += pan(fft_filter(crackle, lo=1500, hi=8000) * 0.5)

    # Sidechain: el bajo y los acordes respiran con el bombo
    if kicks:
        ks = np.array(sorted(kicks)) * SR
        idx = np.arange(n)
        pos = np.searchsorted(ks, idx, side="right") - 1
        since = np.where(pos >= 0, idx - ks[np.clip(pos, 0, None)], 1e9) / SR
        duck = 1 - 0.55 * np.exp(-since / 0.11)
        bass *= duck[:, None]
        pads *= duck[:, None]

    pads = dsp.reverb(pads, seconds=2.2, mix=0.35, seed=a.seed)
    lead = dsp.reverb(lead, seconds=1.4, mix=0.3, seed=a.seed + 1)
    fx = dsp.reverb(fx, seconds=1.8, mix=0.3, seed=a.seed + 2)

    mix = drums + bass + pads + lead + fx
    fade = int(0.25 * SR)
    mix[-fade:] *= np.linspace(1, 0, fade)[:, None]
    mix = dsp.soft_clip(dsp.normalize_peak(mix, -1.0) * 1.1, 1.2)
    mix = dsp.normalize_peak(mix, -1.0)
    write_wav(a.out, mix)

    if a.beats:
        beats = [round(i * spb, 4) for i in range(int(dur / spb) + 1) if i * spb <= dur]
        with open(a.beats, "w") as f:
            json.dump({"bpm": a.bpm, "offset": 0, "beats": beats, "downbeats": beats[::4],
                       "duration": dur, "source": "compose"}, f, indent=2)
    print(f"♪ música {a.style} {a.key} {a.bpm:g} BPM, {dur:g}s")


if __name__ == "__main__":
    main()
