#!/usr/bin/env python3
"""Rebuild the short bird-call clips in assets/audio/ from Wikimedia Commons.

Every source, its creator and licence are listed in assets/audio/CREDITS.md;
keep that file in step with CLIPS below.

    pip install numpy imageio-ffmpeg
    python3 tools/make_bird_calls.py [cache_dir]

Sources are downloaded once into cache_dir (default: .cache/bird-calls/). For
each clip: trim, high-pass (rumble / DC), low-pass, light FFT denoise, short
fades, then a gain that sets the loudest quarter of the call to -20 dBFS RMS,
a soft-knee limiter above -6 dBFS so no peak passes -3 dBFS, and a small mono
MP3 (32 kHz, 56 kbps).

Some sources are Commons' own MP3 transcodes of the uploaded file (same
recording and licence), used because the originals were rate-limited.
"""
import os
import subprocess
import sys
import time
import urllib.request

import imageio_ffmpeg
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "audio")
UP = "https://upload.wikimedia.org/wikipedia/commons/"
SR = 32000
TARGET_RMS = -20.0  # dBFS, loudest quarter of 50 ms frames
KNEE, PEAK = -6.0, -3.0  # dBFS

# tile id, source URL, start s, end s, high-pass Hz, low-pass Hz
CLIPS = [
    ("american-crow", UP + "8/82/Corvus_brachyrhynchos_call.ogg", 0.05, 1.60, 300, 8000),
    ("common-raven", UP + "transcoded/a/ad/Common_Raven_Grand_Teton_National_Park.ogg/"
     "Common_Raven_Grand_Teton_National_Park.ogg.mp3", 3.30, 5.60, 200, 8000),
    ("bald-eagle", UP + "5/59/Bald_Eagle_Yellowstone_National_Park.ogg", 0.40, 2.30, 600, 10000),
    ("northern-cardinal", UP + "transcoded/f/f6/Northern_Cardinal.ogg/Northern_Cardinal.ogg.mp3",
     265.70, 268.25, 1200, 8000),
    ("wood-duck", UP + "transcoded/9/9f/Aix_sponsa_-_Wood_Duck_-_XC63109.ogg/"
     "Aix_sponsa_-_Wood_Duck_-_XC63109.ogg.mp3", 5.00, 6.10, 500, 9000),
]
FF = imageio_ffmpeg.get_ffmpeg_exe()


def fetch(url, cache):
    path = os.path.join(cache, url.rsplit("/", 1)[1])
    if os.path.exists(path) and os.path.getsize(path) > 10000:
        return path
    req = urllib.request.Request(url, headers={"User-Agent": "BirdMahjong-bird-calls/1.0"})
    for attempt in range(6):
        try:
            with urllib.request.urlopen(req, timeout=60) as r, open(path, "wb") as f:
                f.write(r.read())
            return path
        except urllib.error.HTTPError as e:
            if e.code != 429:
                raise
            time.sleep(30 * (attempt + 1))  # Wikimedia rate limit: back off
    sys.exit(f"could not download {url}")


def process(src, start, end, highpass, lowpass):
    dur = end - start
    chain = (f"atrim={start}:{end},asetpts=N/SR/TB,highpass=f={highpass}:poles=2,"
             f"lowpass=f={lowpass},afftdn=nr=8:nf=-45,afade=t=in:d=0.03,"
             f"afade=t=out:st={dur - 0.2:.3f}:d=0.2")
    raw = subprocess.run([FF, "-v", "error", "-i", src, "-ac", "1", "-ar", str(SR), "-af", chain,
                          "-f", "f32le", "-"], capture_output=True, check=True).stdout
    x = np.frombuffer(raw, np.float32).astype(np.float64)
    x -= x.mean()
    n = int(SR * 0.05)
    frames = np.array([np.sqrt(np.mean(x[i:i + n] ** 2)) for i in range(0, len(x) - n, n)])
    loud = np.sort(frames)[-max(3, len(frames) // 4):]
    gain = TARGET_RMS - 20 * np.log10(np.sqrt(np.mean(loud ** 2)))
    y = x * 10 ** (gain / 20)
    t, c = 10 ** (KNEE / 20), 10 ** (PEAK / 20)
    over = np.abs(y) > t
    y[over] = np.sign(y[over]) * (t + (c - t) * np.tanh((np.abs(y[over]) - t) / (c - t)))
    return y.astype(np.float32), gain


def main():
    cache = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, ".cache", "bird-calls")
    os.makedirs(cache, exist_ok=True)
    os.makedirs(OUT, exist_ok=True)
    for tile_id, url, start, end, hp, lp in CLIPS:
        y, gain = process(fetch(url, cache), start, end, hp, lp)
        out = os.path.join(OUT, f"{tile_id}.mp3")
        subprocess.run([FF, "-v", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", "-",
                        "-c:a", "libmp3lame", "-b:a", "56k", "-map_metadata", "-1", out],
                       input=y.tobytes(), check=True)
        print(f"{tile_id:18s} {end - start:4.2f}s gain {gain:+5.1f} dB  {os.path.getsize(out) // 1024} KB")


if __name__ == "__main__":
    main()
