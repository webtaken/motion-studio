"""Leer y escribir audio sin dependencias extra: ffmpeg decodifica, `wave` escribe."""
import os
import subprocess
import wave

import numpy as np

SR = 48000
FFMPEG = os.environ.get("FFMPEG_PATH", "ffmpeg")


def read_audio(path, sr=SR, mono=False):
    """Cualquier formato que ffmpeg entienda → float64 (n,) mono o (n, 2) estéreo."""
    ch = 1 if mono else 2
    cmd = [FFMPEG, "-v", "error", "-i", str(path), "-f", "f32le", "-acodec", "pcm_f32le",
           "-ac", str(ch), "-ar", str(sr), "-"]
    raw = subprocess.run(cmd, check=True, capture_output=True).stdout
    a = np.frombuffer(raw, dtype=np.float32).astype(np.float64)
    return a if mono else a.reshape(-1, 2)


def write_wav(path, data, sr=SR):
    """Escribe PCM 16 bits estéreo."""
    data = np.asarray(data, dtype=np.float64)
    if data.ndim == 1:
        data = np.stack([data, data], axis=1)
    pcm = (np.clip(data, -1.0, 1.0) * 32767.0).astype("<i2")
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(pcm.tobytes())


def fit_length(x, n):
    """Recorta o rellena con silencio hasta n muestras."""
    if len(x) >= n:
        return x[:n]
    pad = np.zeros((n - len(x),) + x.shape[1:])
    return np.concatenate([x, pad])
