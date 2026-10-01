"""Bloques de síntesis vectorizados con numpy (sin bucles por muestra)."""
import numpy as np

SR = 48000


def tvec(dur, sr=SR):
    return np.arange(int(round(dur * sr))) / sr


def midi_hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def db(x):
    return 10 ** (x / 20)


def env_exp(n, decay, sr=SR):
    return np.exp(-np.arange(n) / (decay * sr))


def adsr(n, a=0.01, d=0.1, s=0.7, r=0.2, sr=SR):
    t = np.arange(n) / sr
    dur = n / sr
    e = np.where(t < a, t / max(a, 1e-6), 1.0)
    e = np.where((t >= a) & (t < a + d), 1 - (1 - s) * (t - a) / max(d, 1e-6), e)
    e = np.where(t >= a + d, s, e)
    rel = np.clip((dur - t) / max(r, 1e-6), 0, 1)
    return e * rel


def fft_filter(x, lo=None, hi=None, sr=SR, slope=0.25):
    """Pasa-banda suave en frecuencia (lo/hi en Hz). x mono o estéreo."""
    n = len(x)
    if n == 0:
        return x
    spec = np.fft.rfft(x, axis=0)
    f = np.fft.rfftfreq(n, 1 / sr)
    m = np.ones_like(f)
    if lo:
        m *= 1 / (1 + (lo / np.maximum(f, 1e-3)) ** (2 / slope))
    if hi:
        m *= 1 / (1 + (f / hi) ** (2 / slope))
    if x.ndim == 2:
        m = m[:, None]
    return np.fft.irfft(spec * m, n=n, axis=0)


def osc_sine(freq, n, sr=SR, phase=0.0):
    return np.sin(2 * np.pi * freq * np.arange(n) / sr + phase)


def osc_saw(freq, n, sr=SR, max_hz=None, phase=0.0):
    """Sierra limitada en banda (aditiva): sin aliasing."""
    t = np.arange(n) / sr
    top = min(sr / 2 * 0.9, max_hz or sr / 2 * 0.9)
    k_max = max(1, min(60, int(top // freq)))
    out = np.zeros(n)
    for k in range(1, k_max + 1):
        out += np.sin(2 * np.pi * k * freq * t + phase * k) / k
    return out * (2 / np.pi)


def osc_tri(freq, n, sr=SR, max_hz=6000):
    t = np.arange(n) / sr
    k_max = max(1, min(30, int(max_hz // freq)))
    out = np.zeros(n)
    sign = 1
    for k in range(1, k_max + 1, 2):
        out += sign * np.sin(2 * np.pi * k * freq * t) / (k * k)
        sign = -sign
    return out * (8 / np.pi ** 2)


def sweep(f0, f1, n, sr=SR, curve="exp"):
    """Seno con barrido de frecuencia (fase integrada)."""
    p = np.arange(n) / max(n - 1, 1)
    f = f0 * (f1 / f0) ** p if curve == "exp" else f0 + (f1 - f0) * p
    return np.sin(2 * np.pi * np.cumsum(f) / sr)


def pan(mono, p=0.0):
    """Paneo de potencia constante, p en [-1, 1]."""
    a = (p + 1) * np.pi / 4
    return np.stack([mono * np.cos(a), mono * np.sin(a)], axis=1)


def stereo(x):
    return x if x.ndim == 2 else np.stack([x, x], axis=1)


def place(buf, sample, start, gain=1.0):
    """Suma `sample` en `buf` desde el índice start (recorta bordes)."""
    sample = stereo(sample) if buf.ndim == 2 else sample
    s0 = int(start)
    a = max(0, -s0)
    b = min(len(sample), len(buf) - s0)
    if b > a:
        buf[s0 + a:s0 + b] += sample[a:b] * gain


def reverb(x, seconds=1.4, mix=0.25, seed=3, sr=SR, damp=6000):
    """Reverb por convolución con ruido decreciente (estéreo decorrelado)."""
    x = stereo(x)
    n_ir = int(seconds * sr)
    rng = np.random.default_rng(seed)
    t = np.arange(n_ir) / sr
    decay = np.exp(-t * 6.9 / seconds)
    ir = rng.standard_normal((n_ir, 2)) * decay[:, None]
    ir = fft_filter(ir, lo=200, hi=damp)
    ir /= np.sqrt(np.sum(ir ** 2, axis=0, keepdims=True)) + 1e-9
    n = len(x) + n_ir
    size = 1 << int(np.ceil(np.log2(n)))
    wet = np.fft.irfft(np.fft.rfft(x, size, axis=0) * np.fft.rfft(ir, size, axis=0), size, axis=0)[:len(x)]
    return x * (1 - mix) + wet * mix


def soft_clip(x, drive=1.0):
    return np.tanh(x * drive) / np.tanh(drive)


def normalize_peak(x, peak_db=-1.0):
    m = np.max(np.abs(x)) + 1e-12
    return x * (db(peak_db) / m)
