"""Detecta tempo y beats de una pista para cuadrar la animación con ctx.beat(n).

Uso: python audio/beats.py pista.mp3 --out videos/<slug>/beats.json
Usa librosa si está instalado; si no, un detector propio con numpy.
"""
import argparse
import json

import numpy as np

from wavio import read_audio

SR = 22050
HOP = 512
WIN = 2048


def onset_envelope(y):
    """Flujo espectral positivo (qué tanto 'golpea' cada ventana)."""
    win = WIN
    n_frames = 1 + (len(y) - win) // HOP
    if n_frames < 4:
        raise SystemExit("Pista demasiado corta")
    idx = np.arange(win)[None, :] + HOP * np.arange(n_frames)[:, None]
    frames = y[idx] * np.hanning(win)[None, :]
    mag = np.log1p(np.abs(np.fft.rfft(frames, axis=1)) * 10)
    flux = np.maximum(0, np.diff(mag, axis=0)).sum(axis=1)
    flux = np.concatenate([[0], flux])
    flux -= np.convolve(flux, np.ones(16) / 16, mode="same")
    return np.maximum(flux, 0)


def numpy_beats(y):
    env = onset_envelope(y)
    fps = SR / HOP
    ac = np.correlate(env, env, mode="full")[len(env) - 1:]
    lags = np.arange(len(ac))
    bpm_of = 60 * fps / np.maximum(lags, 1)
    valid = (bpm_of >= 60) & (bpm_of <= 180)
    weight = np.exp(-0.5 * (np.log2(bpm_of / 120) / 0.9) ** 2)  # prefiere tempos cerca de 120
    score = np.where(valid, ac * weight, 0)
    lag = int(np.argmax(score))
    coarse = lag / fps
    t_env = np.arange(len(env)) / fps

    def comb(period, off):
        pos = np.arange(off, t_env[-1], period) * fps
        return np.interp(pos, np.arange(len(env)), env).sum() / max(len(pos), 1)

    # Refina período y fase juntos (el lag entero sesga el tempo ~2%).
    best, period, best_off = -1, coarse, 0.0
    for p in np.linspace(coarse * 0.96, coarse * 1.04, 81):
        for off in np.linspace(0, p, 40, endpoint=False):
            s = comb(p, off)
            if s > best:
                best, period, best_off = s, p, off
    dur = len(y) / SR
    # Cada ventana se fecha por su centro, no por su inicio.
    first = (best_off + WIN / 2 / SR) % period
    beats = list(np.arange(first, dur, period))
    return 60 / period, beats


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("track")
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    y = read_audio(a.track, sr=SR, mono=True)
    dur = len(y) / SR
    try:
        import librosa  # noqa: F401
        tempo, beats = librosa.beat.beat_track(y=y.astype(np.float32), sr=SR, hop_length=HOP, units="time")
        bpm = float(np.atleast_1d(tempo)[0])
        beats = [float(b) for b in beats]
        source = "librosa"
    except ImportError:
        bpm, beats = numpy_beats(y)
        source = "numpy"
    beats = [round(b, 4) for b in beats]
    out = {"bpm": round(bpm, 2), "offset": beats[0] if beats else 0, "beats": beats,
           "downbeats": beats[::4], "duration": round(dur, 3), "source": source}
    with open(a.out, "w") as f:
        json.dump(out, f, indent=2)
    print(f"♪ {bpm:.1f} BPM, {len(beats)} beats, primer beat en {out['offset']:.3f}s ({source})")


if __name__ == "__main__":
    main()
