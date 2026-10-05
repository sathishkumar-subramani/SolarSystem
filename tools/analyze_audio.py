#!/usr/bin/env python3
"""Measures the rendered loops (levels, spectrum balance, stereo width, loop seam) and draws spectrograms."""
import os, sys, json, tempfile
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
SR = 44100
TMP = os.environ.get('AUDIO_TMP') or os.path.join(tempfile.gettempdir(), 'sol-audio')
os.makedirs(TMP, exist_ok=True)
names = sys.argv[1:] or ['warm', 'vast', 'cold', 'void', 'bh', 'tunnel', 'roar', 'engine', 'arrive']
bands = [(20, 60), (60, 250), (250, 1000), (1000, 4000), (4000, 16000)]
fig, axes = plt.subplots(len(names), 1, figsize=(15, 2.6 * len(names)), squeeze=False)
for ax, name in zip(axes[:, 0], names):
    x = np.load(os.path.join(TMP, name + '.npy')).astype(np.float64)
    mono = x.mean(axis=0)
    n = x.shape[1]
    rms = 20 * np.log10(np.sqrt(np.mean(x ** 2)))
    peak = 20 * np.log10(np.abs(x).max())
    spec = np.abs(np.fft.rfft(mono)) ** 2
    f = np.fft.rfftfreq(n, 1 / SR)
    tot = spec.sum()
    be = [10 * np.log10(spec[(f >= a) & (f < b)].sum() / tot + 1e-12) for a, b in bands]
    centroid = (spec * f).sum() / tot
    corr = np.corrcoef(x[0], x[1])[0, 1]
    # short-term loudness over 400 ms windows: how much the piece moves
    w = int(0.4 * SR)
    st = np.array([np.sqrt(np.mean(mono[i:i + w] ** 2)) for i in range(0, n - w, w)])
    st_db = 20 * np.log10(st + 1e-9)
    # seam: the jump between the last and first sample compared with ordinary sample-to-sample steps
    step = np.abs(np.diff(mono))
    seam = abs(mono[0] - mono[-1]) / (np.percentile(step, 99) + 1e-12)
    print(f'{name:7s} rms {rms:6.1f}  peak {peak:5.1f}  crest {peak - rms:4.1f}  centroid {centroid:6.0f} Hz  L/R corr {corr:5.2f}  '
          f'short-term {st_db.min():6.1f}..{st_db.max():6.1f} dB  seam x{seam:4.2f}  bands ' + ' '.join(f'{b:6.1f}' for b in be))
    ax.specgram(mono, NFFT=8192, Fs=SR, noverlap=6144, cmap='magma', vmin=-150, vmax=-50)
    ax.set_yscale('symlog', linthresh=100)
    ax.set_ylim(20, 16000)
    ax.set_yticks([30, 60, 125, 250, 500, 1000, 2000, 4000, 8000, 16000])
    ax.set_yticklabels(['30', '60', '125', '250', '500', '1k', '2k', '4k', '8k', '16k'])
    ax.set_title(name, loc='left', fontsize=10)
plt.tight_layout()
out = os.path.join(TMP, 'spectrograms_' + '_'.join(names)[:60] + '.png')
plt.savefig(out, dpi=70)
print(out)
