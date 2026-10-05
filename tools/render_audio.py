#!/usr/bin/env python3
"""
Renders the soundtrack of the tour.

Everything is synthesised here — no samples. Each loop is built on a circle: every oscillator
frequency is a whole number of cycles per loop, every envelope and noise texture wraps around,
and the reverb is a circular convolution, so the result repeats without any seam. The files are
written with one second of the loop's own continuation on either side, and the page loops the
middle, so MP3 encoder padding can never land on the loop point.

    python3 tools/render_audio.py            # renders everything into public/audio
    python3 tools/render_audio.py warm bh    # only these

Needs numpy and ffmpeg.
"""
import os
import tempfile
import subprocess
import sys
import wave

import numpy as np
from numpy.fft import irfft, rfft, rfftfreq

SR = 44100
CR = 100  # control rate for slow envelopes / LFOs
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'public', 'audio')
TMP = os.environ.get('AUDIO_TMP') or os.path.join(tempfile.gettempdir(), 'sol-audio')
os.makedirs(TMP, exist_ok=True)
PAD = 1.0  # seconds of periodic continuation written before and after each loop


def midi(m):
    return 440.0 * 2 ** ((m - 69) / 12)


class Loop:
    """A stereo buffer on a circle of `period` seconds."""

    def __init__(self, period, seed):
        self.P = float(period)
        self.N = int(round(period * SR))
        self.t = np.arange(self.N) / SR
        self.rng = np.random.default_rng(seed)
        self.M = int(round(period * CR))

    # ------------------------------------------------------------ helpers
    def q(self, f):
        """nearest frequency that completes a whole number of cycles in the loop"""
        return max(round(f * self.P), 1) / self.P

    def up(self, ctrl):
        """control-rate array (M) -> audio rate (N), periodic"""
        x = np.arange(self.N) * (CR / SR)
        return np.interp(x, np.arange(self.M + 1), np.append(ctrl, ctrl[0]))

    def wander(self, harmonics=6, power=1.0):
        """slow random periodic curve in [-1, 1] (control rate)"""
        tc = np.arange(self.M) / CR
        y = np.zeros(self.M)
        for k in range(1, harmonics + 1):
            y += self.rng.normal() / k ** power * np.sin(2 * np.pi * k * tc / self.P + self.rng.uniform(0, 2 * np.pi))
        return y / (np.max(np.abs(y)) + 1e-9)

    def env(self, t0, attack, hold, release):
        """raised-cosine swell starting at t0 (seconds), wrapping around the loop (control rate)"""
        tc = (np.arange(self.M) / CR - t0) % self.P
        e = np.zeros(self.M)
        a = tc < attack
        e[a] = 0.5 - 0.5 * np.cos(np.pi * tc[a] / attack)
        h = (tc >= attack) & (tc < attack + hold)
        e[h] = 1.0
        r = (tc >= attack + hold) & (tc < attack + hold + release)
        e[r] = 0.5 + 0.5 * np.cos(np.pi * (tc[r] - attack - hold) / release)
        return e

    def noise(self, alpha=1.0):
        """periodic noise with power spectrum 1/f^alpha (0 white, 1 pink, 2 brown), stereo, unit RMS"""
        out = np.zeros((2, self.N))
        f = rfftfreq(self.N, 1 / SR)
        f[0] = f[1]
        shape = f ** (-alpha / 2)
        shape[f < 12] = 0
        for c in range(2):
            spec = (self.rng.normal(size=f.size) + 1j * self.rng.normal(size=f.size)) * shape
            x = irfft(spec, self.N)
            out[c] = x / np.std(x)
        return out

    def filt(self, x, gain):
        """zero-phase circular filter; `gain(f)` returns the magnitude response"""
        f = rfftfreq(self.N, 1 / SR)
        g = gain(f)
        return np.stack([irfft(rfft(x[c]) * g, self.N) for c in range(x.shape[0])])

    def tone(self, f, partials, voices, drift=1.2, shimmer=0.0, env=None):
        """
        Additive voice. partials: [(multiple, amplitude)], voices: [(detune ratio, pan -1..1)].
        Each voice drifts slowly in phase; `shimmer` lets every partial breathe on its own.
        `env` (control rate) shapes the result; only the part where it is non-zero is computed.
        """
        out = np.zeros((2, self.N))
        if env is None:
            idx = slice(None)
            e = 1.0
        else:
            ea = self.up(env)
            idx = np.nonzero(ea > 1e-5)[0]
            e = ea[idx]
        tw = 2 * np.pi * self.t[idx]
        if shimmer > 0 and not hasattr(self, 'bank'):
            self.bank = [0.5 + 0.5 * self.up(self.wander(9, 0.7)) for _ in range(7)]
        partials = [(m, a) for m, a in partials if a > 0.003]
        for det, pan in voices:
            th = (pan + 1) * np.pi / 4
            gl, gr = np.cos(th), np.sin(th)
            dr = (self.up(self.wander(5)) * drift)[idx]
            acc = np.zeros(tw.shape)
            for mult, amp in partials:
                fh = self.q(f * mult * (1 + det))
                s = np.sin(tw * fh + self.rng.uniform(0, 2 * np.pi) + dr * min(mult, 4) * 0.5)
                if shimmer > 0:
                    s *= 1 - shimmer * self.bank[self.rng.integers(len(self.bank))][idx]
                acc += amp * s
            acc *= e
            out[0, idx] += gl * acc
            out[1, idx] += gr * acc
        return out / np.sqrt(len(voices))

    def add_event(self, buf, t0, sig):
        """mix a one-off stereo signal into the loop at t0, wrapping around"""
        i0 = int(round(t0 * SR)) % self.N
        n = sig.shape[1]
        idx = (i0 + np.arange(n)) % self.N
        np.add.at(buf[0], idx, sig[0])
        np.add.at(buf[1], idx, sig[1])

    def reverb(self, x, t60, bright=5000.0, predelay=0.03):
        """dense stereo reverb: exponentially decaying noise, highs dying faster, convolved on the circle"""
        L = min(int(t60 * 1.35 * SR), self.N)
        t = np.arange(L) / SR
        ir = np.zeros((2, L))
        f = rfftfreq(L, 1 / SR)
        bands = [(lambda f: lp(f, 400, 2), 1.15), (lambda f: hp(f, 400, 2) * lp(f, bright * 0.5, 2), 1.0), (lambda f: hp(f, bright * 0.5, 2), 0.42)]
        for c in range(2):
            n = self.rng.normal(size=L)
            N_ = rfft(n)
            for g, k in bands:
                ir[c] += irfft(N_ * g(f), L) * np.exp(-6.91 * t / (t60 * k))
        pd = int(predelay * SR)
        ir = np.roll(ir, pd, axis=1)
        ir[:, :pd] = 0
        on = int(0.06 * SR)
        ir[:, pd:pd + on] *= np.linspace(0, 1, on) ** 2
        ir /= np.sqrt(np.sum(ir ** 2, axis=1, keepdims=True))
        pad = np.zeros((2, self.N))
        pad[:, :L] = ir
        return np.stack([irfft(rfft(x[c]) * rfft(pad[c]), self.N) for c in range(2)])


# ---------------------------------------------------------------- filters (magnitude responses)
def lp(f, fc, order=2):
    return 1 / np.sqrt(1 + (f / fc) ** (2 * order))


def hp(f, fc, order=2):
    return 1 / np.sqrt(1 + (fc / np.maximum(f, 1e-6)) ** (2 * order))


def bp(f, f0, q):
    ff = np.maximum(f, 1e-6)
    return 1 / np.sqrt(1 + q * q * (ff / f0 - f0 / ff) ** 2)


# ---------------------------------------------------------------- timbres (partial lists)
def strings(f, fc=1000.0, tilt=1.0, top=5200.0):
    """a soft bowed / sawtooth spectrum under a low-pass"""
    out = []
    h = 1
    while f * h < top and h <= 44:
        out.append((h, h ** -tilt * lp(f * h, fc, 2)))
        h += 1
    return out


def organ(f, fc=2600.0):
    """principal chorus: 16', 8', 4', 2 2/3', 2', 1 1/3', 1'"""
    stops = [(0.5, 0.42), (1, 1.0), (2, 0.62), (3, 0.26), (4, 0.34), (6, 0.11), (8, 0.09)]
    return [(m, a * lp(f * m, fc, 2)) for m, a in stops]


def flute(f):
    return [(1, 1.0), (2, 0.22), (3, 0.06), (4, 0.02)]


def glass(f):
    return [(1, 1.0), (2.003, 0.18), (3.011, 0.05)]


V3 = [(-0.0028, -0.75), (0.0004, 0.0), (0.0031, 0.75)]
V5 = [(-0.0046, -0.9), (-0.0019, -0.4), (0.0, 0.0), (0.0022, 0.45), (0.0049, 0.9)]
V2 = [(-0.0015, -0.5), (0.0015, 0.5)]
VC = [(0.0, 0.0)]


def struck(f, dur, tau, partials, attack=0.012, pan=0.0, seed=0):
    """a struck tone: every partial decays on its own, higher ones faster"""
    rng = np.random.default_rng(seed)
    n = int(dur * SR)
    t = np.arange(n) / SR
    x = np.zeros(n)
    for mult, amp, damp in partials:
        x += amp * np.sin(2 * np.pi * f * mult * t + rng.uniform(0, 6.28)) * np.exp(-t / (tau * damp))
    a = int(attack * SR)
    x[:a] *= 0.5 - 0.5 * np.cos(np.pi * np.arange(a) / a)
    x[-2000:] *= np.linspace(1, 0, 2000)
    th = (pan + 1) * np.pi / 4
    return np.stack([np.cos(th) * x, np.sin(th) * x])


def piano(f):
    """felt-piano-like: slightly stretched partials, soft hammer"""
    B = 0.00035
    return [(k * np.sqrt(1 + B * k * k), k ** -1.75 * lp(f * k, 1500, 1), k ** -0.75) for k in range(1, 12)]


def bell(f):
    """small glass bell: a few inharmonic partials"""
    return [(1.0, 1.0, 1.0), (2.76, 0.32, 0.55), (5.4, 0.12, 0.3), (8.93, 0.04, 0.18)]


# ---------------------------------------------------------------- mastering
def a_weight(f):
    """IEC A-weighting magnitude — roughly how loud each frequency sounds at modest volume"""
    f2 = np.maximum(f, 1e-6) ** 2
    ra = 12194.0 ** 2 * f2 ** 2 / ((f2 + 20.6 ** 2) * np.sqrt((f2 + 107.7 ** 2) * (f2 + 737.9 ** 2)) * (f2 + 12194.0 ** 2))
    return ra * 10 ** (2.0 / 20)


def loudness(x):
    """A-weighted RMS in dB"""
    n = x.shape[1]
    w = a_weight(rfftfreq(n, 1 / SR))
    p = sum(np.sum(np.abs(rfft(x[c]) * w) ** 2) for c in range(x.shape[0])) / (x.shape[0] * n * n / 2)
    return 10 * np.log10(p + 1e-20)


def master(x, loud_db, peak_db=-1.5, hp_fc=24.0, lp_fc=15000.0):
    """
    High-pass, low-pass, then set the level by perceived loudness (A-weighted), not raw RMS —
    otherwise a strong sub-bass would make everything you can actually hear too quiet.
    A soft-knee limiter catches the rare peak.
    """
    n = x.shape[1]
    f = rfftfreq(n, 1 / SR)
    g = hp(f, hp_fc, 2) * lp(f, lp_fc, 2)
    x = np.stack([irfft(rfft(x[c]) * g, n) for c in range(2)])
    x -= x.mean(axis=1, keepdims=True)
    x *= 10 ** ((loud_db - loudness(x)) / 20)
    ceil = 10 ** (peak_db / 20)
    knee = ceil * 0.7
    a = np.abs(x)
    over = a > knee
    if over.mean() > 0.002:
        print(f'   note: {over.mean() * 100:.2f}% of samples in the limiter knee')
    x[over] = np.sign(x[over]) * (knee + (ceil - knee) * np.tanh((a[over] - knee) / (ceil - knee)))
    return x


REUSE = os.environ.get('REUSE') == '1'


def cached(key, make):
    """expensive layers are kept on disk so that a re-mix does not have to re-synthesise them (REUSE=1)"""
    path = os.path.join(TMP, 'layer_' + key + '.npy')
    if REUSE and os.path.exists(path):
        return np.load(path).astype(np.float64)
    x = make()
    np.save(path, x.astype(np.float32))
    return x


def report(name, **layers):
    print('   ' + name + ' layers (dBA): ' + '  '.join(f'{k} {loudness(v):.1f}' for k, v in layers.items()))


def write(name, x, period, bitrate='128k'):
    """x: stereo loop of exactly `period` seconds. Written with PAD seconds of wrap-around on both sides."""
    pad = int(PAD * SR)
    y = np.concatenate([x[:, -pad:], x, x[:, :pad]], axis=1) if period else x
    wav = os.path.join(TMP, name + '.wav')
    pcm = (np.clip(y.T, -1, 1) * 32767).astype('<i2')
    with wave.open(wav, 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    os.makedirs(OUT, exist_ok=True)
    mp3 = os.path.join(OUT, name + '.mp3')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-codec:a', 'libmp3lame', '-b:a', bitrate, '-joint_stereo', '1', mp3], check=True)
    rms = 20 * np.log10(np.sqrt(np.mean(x ** 2)))
    peak = 20 * np.log10(np.max(np.abs(x)))
    print(f'{name:8s} {x.shape[1] / SR:6.1f}s  loudness {loudness(x):6.1f} dBA  rms {rms:6.1f} dB  peak {peak:5.1f} dB  {os.path.getsize(mp3) / 1024:6.0f} kB')


def chords_pad(L, chords, slot, voice_fn, voices, gain_fn, attack=6.0, hold=None, release=8.0, lead=3.0, swell=None, shimmer=0.25, drift=1.2):
    """lay a sequence of chords around the loop, each swelling in before its slot and melting into the next"""
    out = np.zeros((2, L.N))
    hold = slot - attack if hold is None else hold
    for i, notes in enumerate(chords):
        e = L.env(i * slot - lead, attack, hold, release)
        if swell is not None:
            e = e * swell(L, i)
        for m in notes:
            f = midi(m)
            out += L.tone(f, voice_fn(f), voices, drift=drift, shimmer=shimmer, env=e) * gain_fn(m)
    return out


# ================================================================ the pieces
def organ_bright(f, fc=4200.0):
    """principal chorus with a mixture on top, for the big moments"""
    stops = [(0.5, 0.4), (1, 1.0), (2, 0.62), (3, 0.28), (4, 0.36), (6, 0.14), (8, 0.12), (12, 0.06), (16, 0.045)]
    return [(m, a * lp(f * m, fc, 2)) for m, a in stops]


def warm():
    """Inner Solar System: Dm9 - Bbmaj7 - Fmaj9 - Csus2. Strings, soft flutes and a distant piano."""
    L = Loop(64, 11)
    chords = [[38, 45, 53, 60, 64], [34, 41, 53, 57, 62], [41, 48, 57, 64, 67], [36, 43, 52, 62, 67]]
    g = lambda m: 0.9 * 2 ** (-(m - 38) / 30)
    pad = cached('warm_pad', lambda: chords_pad(L, chords, 16, lambda f: strings(f, 1250 + 8 * f ** 0.5), V5, g))
    # flutes double the upper voices an octave above, far back in the hall
    tops = [[72, 76], [69, 74], [72, 79], [74, 79]]
    fl = cached('warm_fl', lambda: chords_pad(L, tops, 16, flute, V3, lambda m: 0.12, attack=8, release=9, shimmer=0.6))
    # bass: an almost pure tone under each chord
    bass = cached('warm_bass', lambda: chords_pad(L, [[c[0]] for c in chords], 16, lambda f: [(1, 1.0), (2, 0.5), (3, 0.22), (4, 0.08)], V2, lambda m: 0.55,
                                                  attack=5, release=7, shimmer=0.0, drift=0.4))

    # a slow, sparse line on a felt piano
    def line():
        notes = [(2.0, 69, 0.9), (6.6, 65, 0.7), (10.4, 64, 0.8), (18.2, 62, 0.85), (22.8, 65, 0.65), (26.5, 69, 0.8),
                 (34.1, 72, 0.9), (38.7, 69, 0.7), (42.6, 67, 0.75), (50.3, 64, 0.85), (54.9, 62, 0.7), (59.2, 57, 0.6)]
        pn = np.zeros((2, L.N))
        for k, (t0, m, v) in enumerate(notes):
            f = midi(m)
            L.add_event(pn, t0, struck(f, 9.0, 3.2, piano(f), pan=(-0.35 if k % 2 else 0.3), seed=100 + k) * v)
            L.add_event(pn, t0 + 0.012, struck(f / 2, 9.0, 3.6, piano(f / 2), pan=0.0, seed=200 + k) * v * 0.35)
        return pn

    pn = cached('warm_piano', line)
    air = L.filt(L.noise(1.0), lambda f: bp(f, 1500, 0.6)) * (0.6 + 0.4 * L.up(L.wander(7)))
    layers = dict(pad=pad * 0.2, flutes=fl * 0.9, bass=bass * 0.07, piano=pn * 0.2, air=air * 0.008)
    report('warm', **layers)
    dry = layers['pad'] + layers['flutes'] + layers['bass'] + layers['air']
    wet = L.reverb(layers['pad'] + layers['flutes'] * 1.6 + layers['air'], 7.5) * 0.5 + L.reverb(layers['piano'], 8.5, bright=4200) * 0.55
    return master(dry * 0.75 + layers['piano'] * 0.8 + wet, -27.0), 64


def vast():
    """The giants: a pipe organ over a D pedal — D5, Gm/D, Bb/D, Asus4/D — with slow brass-like swells."""
    L = Loop(64, 22)
    chords = [[38, 45, 50, 57, 62], [38, 43, 55, 58, 62], [38, 46, 53, 58, 65], [38, 45, 52, 57, 62]]
    g = lambda m: 0.85 * 2 ** (-(m - 38) / 34)
    swell = lambda L, i: 0.62 + 0.38 * L.env(i * 16 + 3.5, 6, 2, 6)
    org = cached('vast_org', lambda: chords_pad(L, chords, 16, lambda f: organ_bright(f, 4200), V3, g, attack=5, release=8, swell=swell, shimmer=0.12, drift=0.7))
    low = cached('vast_low', lambda: chords_pad(L, [c[:3] for c in chords], 16, lambda f: strings(f, 520, 1.0, 2600), V5, lambda m: 0.8, attack=7, release=8,
                                                swell=lambda L, i: 0.35 + 0.65 * L.env(i * 16 + 4, 6, 1.5, 6)))
    pedal = cached('vast_pedal', lambda: L.tone(midi(26), [(1, 1.0), (2, 0.6), (3, 0.25), (4, 0.1)], V2, drift=0.3) * L.up(0.75 + 0.25 * L.wander(4)))
    high = cached('vast_high', lambda: chords_pad(L, [[74, 81], [74, 79], [77, 82], [76, 81]], 16, glass, V3, lambda m: 0.07, attack=9, release=9, shimmer=0.8))
    rumble = L.filt(L.noise(2.0), lambda f: lp(f, 110, 2)) * L.up(0.6 + 0.4 * L.wander(5))
    air = L.filt(L.noise(1.0), lambda f: bp(f, 3200, 0.5)) * L.up(0.4 + 0.6 * np.clip(L.wander(8, 0.6), 0, 1))
    layers = dict(organ=org * 0.17, low=low * 0.13, pedal=pedal * 0.09, high=high * 0.5, rumble=rumble * 0.02, air=air * 0.004)
    report('vast', **layers)
    dry = layers['organ'] + layers['low'] + layers['pedal'] + layers['rumble'] + layers['high'] * 0.6 + layers['air']
    wet = L.reverb(layers['organ'] + layers['low'] * 0.7 + layers['high'] * 2 + layers['air'], 9.5, bright=5200) * 0.75
    return master(dry * 0.7 + wet, -26.0), 64


def cold():
    """The ice giants: thin air, glass harmonics that come and go, single bells far away."""
    L = Loop(64, 33)
    chords = [[57, 64, 69, 76], [58, 64, 69, 77], [55, 62, 69, 76], [57, 61, 64, 73]]
    g = lambda m: 0.5 * 2 ** (-(m - 57) / 40)
    pad = cached('cold_pad', lambda: chords_pad(L, chords, 16, flute, V5, g, attack=8, release=9, shimmer=0.75, drift=1.6))
    hi = cached('cold_hi', lambda: chords_pad(L, [[81, 88], [81, 89], [79, 86], [81, 85]], 16, glass, V3, lambda m: 0.16, attack=9, release=10, shimmer=0.95, drift=2.0))
    drone = cached('cold_drone', lambda: L.tone(midi(38), [(1, 1.0), (2, 0.5), (3, 0.3), (4, 0.12), (5, 0.06)], V3, drift=0.5) * L.up(0.7 + 0.3 * L.wander(4)))
    wind = L.filt(L.noise(1.0), lambda f: bp(f, 2600, 0.8)) * L.up(0.35 + 0.65 * np.clip(L.wander(8, 0.6), 0, 1))
    wind2 = L.filt(L.noise(1.2), lambda f: bp(f, 700, 1.2)) * L.up(0.3 + 0.7 * np.clip(L.wander(6, 0.6), 0, 1))

    def chimes():
        bells = np.zeros((2, L.N))
        scale = [74, 76, 81, 86, 88, 79, 93, 81, 76, 91]
        times = [3.1, 9.8, 15.2, 21.7, 28.4, 33.9, 40.6, 46.3, 52.8, 58.5]
        for k, (t0, m) in enumerate(zip(times, scale)):
            f = midi(m)
            L.add_event(bells, t0, struck(f, 10.0, 4.5, bell(f), attack=0.03, pan=np.sin(k * 2.4) * 0.7, seed=300 + k) * (0.5 + 0.5 * ((k * 7) % 3) / 2))
        return bells

    bells = cached('cold_bells', chimes)
    layers = dict(pad=pad * 0.22, glass=hi * 0.45, drone=drone * 0.05, wind=wind * 0.02 + wind2 * 0.012, bells=bells * 0.035)
    report('cold', **layers)
    dry = layers['pad'] + layers['glass'] + layers['drone'] + layers['wind']
    wet = L.reverb(layers['pad'] * 1.2 + layers['glass'] * 2 + layers['wind'], 10.5, bright=7000) * 0.42 + L.reverb(layers['bells'], 11.0, bright=8000) * 1.4
    return master(dry * 0.6 + layers['bells'] + wet, -28.0), 64


def void():
    """Beyond Neptune: almost nothing. A low D that beats against itself, a tritone in the dark, far whistles."""
    L = Loop(64, 44)
    sub = cached('void_sub', lambda: L.tone(midi(26), [(1, 1.0), (2, 0.5), (3, 0.2)], [(-0.0016, -0.3), (0.0016, 0.3)], drift=0.2))
    d2 = cached('void_d2', lambda: L.tone(midi(38), [(1, 1.0), (2, 0.4), (3, 0.2), (4, 0.08)], [(-0.0009, -0.5), (0.0009, 0.5)], drift=0.3) * L.up(0.6 + 0.4 * L.wander(3)))

    def dark():
        w = L.wander(5)
        tri = L.tone(midi(44), strings(midi(44), 520, 1.0, 2400), V5, drift=1.5, shimmer=0.5, env=np.clip(w, 0, 1) ** 1.5)
        fifth = L.tone(midi(45), strings(midi(45), 560, 1.0, 2400), V5, drift=1.5, shimmer=0.5, env=np.clip(-w, 0, 1) ** 1.5)
        return tri + fifth

    pad = cached('void_pad', dark)
    whistle = cached('void_whistle', lambda: (L.tone(midi(81), glass(midi(81)), V2, shimmer=0.9, drift=2.5) + L.tone(midi(82), glass(midi(82)), V2, shimmer=0.9, drift=2.5)) * L.up(
        np.clip(L.wander(7, 0.5), 0, 1) ** 2))
    rumble = L.filt(L.noise(2.0), lambda f: lp(f, 95, 2)) * L.up(0.5 + 0.5 * L.wander(4))
    room = L.filt(L.noise(1.0), lambda f: bp(f, 420, 0.5)) * L.up(0.5 + 0.5 * L.wander(6))
    hiss = L.filt(L.noise(0.6), lambda f: bp(f, 5200, 1.0)) * L.up(0.4 + 0.6 * np.clip(L.wander(9, 0.5), 0, 1))
    layers = dict(sub=sub * 0.13, d2=d2 * 0.13, pad=pad * 0.2, whistle=whistle * 0.03, rumble=rumble * 0.035, room=room * 0.007, hiss=hiss * 0.003)
    report('void', **layers)
    dry = layers['sub'] + layers['d2'] + layers['pad'] + layers['rumble'] + layers['room'] + layers['hiss'] + layers['whistle'] * 0.3
    wet = L.reverb(layers['pad'] + layers['whistle'] * 2 + layers['d2'] * 0.4, 11.0, bright=5000) * 0.9
    return master(dry * 0.8 + wet, -31.0), 64


def bh():
    """The black hole: a sub that throbs, a low choir on D minor with a semitone of dread, the roar of the disc."""
    L = Loop(64, 55)
    sub = cached('bh_sub', lambda: L.tone(midi(26), [(1, 1.0), (2, 0.55), (3, 0.22), (4, 0.08)], [(-0.0034, -0.2), (0.0034, 0.2)], drift=0.2))
    chords = [[38, 45, 50, 53], [38, 45, 51, 53], [38, 45, 50, 57], [38, 44, 50, 53]]

    def choir(f):
        return [(h, float(a * (0.55 * bp(np.array(f * h), 380, 2.2) + 0.5 * bp(np.array(f * h), 780, 3.0) + 0.2 * bp(np.array(f * h), 2500, 4.0) + 0.05))) for h, a in
                strings(f, 3200, 1.0, 4400)]

    g = lambda m: 0.9 * 2 ** (-(m - 38) / 40)
    swell = lambda L, i: 0.55 + 0.45 * L.env(i * 16 + 2.5, 7, 2, 6)
    ch = cached('bh_choir', lambda: chords_pad(L, chords, 16, choir, V5, g, attack=7, release=9, swell=swell, shimmer=0.35, drift=1.8))
    org = cached('bh_org', lambda: chords_pad(L, [[26, 38, 45], [26, 38, 39], [26, 38, 45], [26, 38, 44]], 16, lambda f: organ(f, 1100), V3, lambda m: 0.5, attack=8, release=9,
                                              swell=lambda L, i: 0.3 + 0.7 * L.env(i * 16 + 5, 6, 1, 5), shimmer=0.1, drift=0.5))
    light = cached('bh_light', lambda: chords_pad(L, [[74], [75], [81, 74], [74]], 16, glass, V3, lambda m: 0.1, attack=10, release=10, shimmer=0.9, drift=2.0))
    disc = L.filt(L.noise(2.0), lambda f: lp(f, 210, 2) * hp(f, 28, 2)) * L.up(0.55 + 0.45 * L.wander(6))
    grit = L.filt(L.noise(1.0), lambda f: bp(f, 480, 0.9)) * L.up(0.3 + 0.7 * np.clip(L.wander(8, 0.6), 0, 1))
    layers = dict(sub=sub * 0.1, choir=ch * 0.3, organ=org * 0.11, light=light * 0.5, disc=disc * 0.05, grit=grit * 0.012)
    report('bh', **layers)
    dry = layers['sub'] + layers['choir'] + layers['organ'] + layers['disc'] + layers['grit'] + layers['light'] * 0.3
    wet = L.reverb(layers['choir'] + layers['organ'] * 0.6 + layers['light'] * 2 + layers['grit'], 12.0, bright=4200) * 0.7
    return master(dry * 0.72 + wet, -25.0), 64


def tunnel():
    """The throat: an endlessly rising chord (Shepard-Risset), full organ and a wall of air."""
    L = Loop(32, 66)
    out = np.zeros((2, L.N))
    k_ln2 = np.log(2)
    for root, amp, pan in [(13.75, 1.0, 0.0), (13.75 * 1.5, 0.7, -0.5), (13.75 * 1.2, 0.55, 0.5), (13.75 * 2.25, 0.3, 0.2)]:
        m = round(root * L.P / k_ln2)
        f0 = m * k_ln2 / L.P  # makes every octave land exactly in phase after one loop
        th = (pan + 1) * np.pi / 4
        k = 0
        while f0 * 2 ** (k + 1) < 19000:
            fk = f0 * 2 ** (k + L.t / L.P)
            ph = 2 * np.pi * f0 * 2 ** k * L.P / k_ln2 * (2 ** (L.t / L.P) - 1)
            a = np.exp(-0.5 * ((np.log2(fk) - np.log2(250)) / 1.3) ** 2)
            sg = amp * a * np.sin(ph)
            out[0] += np.cos(th) * sg
            out[1] += np.sin(th) * sg
            k += 1
    rise = out / 3.2
    org = np.zeros((2, L.N))
    trem = 0.85 + 0.15 * np.sin(2 * np.pi * L.q(5.2) * L.t)
    for mnote in [26, 38, 45, 50, 53, 57, 62, 64, 69]:
        f = midi(mnote)
        org += L.tone(f, organ_bright(f, 3600), V3, drift=0.6, shimmer=0.1) * 2 ** (-(mnote - 38) / 36)
    org *= trem
    air = L.filt(L.noise(1.0), lambda f: 0.9 * bp(f, 520, 0.45) + 0.5 * lp(f, 160, 2)) * L.up(0.75 + 0.25 * L.wander(12, 0.4))
    layers = dict(rise=rise * 0.5, organ=org * 0.06, air=air * 0.1)
    report('tunnel', **layers)
    dry = layers['rise'] + layers['organ'] + layers['air']
    wet = L.reverb(layers['rise'] + layers['organ'], 6.0, bright=6000) * 0.6
    return master(dry + wet, -21.0), 32


def roar():
    """Wide-band rush: next to the Sun, and at speed."""
    L = Loop(16, 77)
    low = L.filt(L.noise(2.0), lambda f: lp(f, 260, 2) * hp(f, 42, 2)) * L.up(0.7 + 0.3 * L.wander(9, 0.5))
    mid = L.filt(L.noise(1.0), lambda f: bp(f, 850, 0.4)) * L.up(0.6 + 0.4 * L.wander(13, 0.4))
    top = L.filt(L.noise(0.5), lambda f: bp(f, 3600, 0.6)) * L.up(0.5 + 0.5 * L.wander(15, 0.4))
    return master(low * 0.42 + mid * 0.3 + top * 0.05, -25.0), 16


def engine():
    """Inside the ship: reactor hum, air handling, the hull carrying the engine note."""
    L = Loop(8, 88)
    hum = np.zeros((2, L.N))
    for mult, amp in [(1, 0.8), (2, 0.7), (3, 0.45), (4, 0.3), (5, 0.2), (6, 0.12), (8, 0.07), (10, 0.04)]:
        hum += L.tone(55.0 * mult, [(1, 1.0)], [(-0.004, -0.4), (0.004, 0.4)], drift=0.5) * amp
    whine = L.tone(823.0, [(1, 1.0), (1.503, 0.4)], V2, drift=1.0, shimmer=0.5) * 0.02
    cabin = L.filt(L.noise(2.0), lambda f: lp(f, 420, 2) * hp(f, 38, 2)) * L.up(0.85 + 0.15 * L.wander(10, 0.4))
    air = L.filt(L.noise(1.0), lambda f: bp(f, 1800, 0.6)) * 0.07
    return master(hum * 0.14 + whine + cabin * 0.4 + air, -30.0), 8


def arrive():
    """One-shot: a distant, low thump with a long tail, for the moment the ship settles at a new world."""
    n = int(7.0 * SR)
    rng = np.random.default_rng(99)
    t = np.arange(n) / SR
    f = rfftfreq(n, 1 / SR)
    x = np.zeros((2, n))
    for c in range(2):
        nz = irfft(rfft(rng.normal(size=n)) * lp(f, 170, 2) * hp(f, 28, 2), n)
        nz /= np.std(nz)
        body = nz * (1 - np.exp(-t / 0.05)) * np.exp(-t / 1.0)
        kn = irfft(rfft(rng.normal(size=n)) * bp(f, 240, 1.0), n)
        kn /= np.std(kn)
        knock = kn * (1 - np.exp(-t / 0.02)) * np.exp(-t / 0.3) * 0.5
        tone = (np.sin(2 * np.pi * 55.0 * t + c * 0.4) + 0.5 * np.sin(2 * np.pi * 82.4 * t)) * (1 - np.exp(-t / 0.03)) * np.exp(-t / 1.3) * 0.6
        airn = irfft(rfft(rng.normal(size=n)) * bp(f, 1400, 0.5), n)
        airn /= np.std(airn)
        swell = airn * np.minimum(t / 0.5, 1) ** 2 * np.exp(-np.maximum(t - 0.5, 0) / 1.5) * 0.04
        x[c] = body + knock + tone + swell
    # hall
    L = int(4.5 * SR)
    tt = np.arange(L) / SR
    wet = np.zeros((2, n))
    for c in range(2):
        ir = rng.normal(size=L) * np.exp(-6.91 * tt / 4.0)
        ir = irfft(rfft(ir) * lp(rfftfreq(L, 1 / SR), 1800, 1), L)
        ir /= np.sqrt(np.sum(ir ** 2))
        wet[c] = irfft(rfft(x[c], n + L) * rfft(ir, n + L), n + L)[:n]
    y = x + wet * 0.5
    fade = int(1.2 * SR)
    y[:, -fade:] *= np.linspace(1, 0, fade) ** 2
    y = master(y, -27.0, peak_db=-3.0, hp_fc=26.0, lp_fc=9000.0)
    return y, 0


PIECES = {'warm': warm, 'vast': vast, 'cold': cold, 'void': void, 'bh': bh, 'tunnel': tunnel, 'roar': roar, 'engine': engine, 'arrive': arrive}

if __name__ == '__main__':
    for name in sys.argv[1:] or list(PIECES):
        x, period = PIECES[name]()
        np.save(os.path.join(TMP, name + '.npy'), x.astype(np.float32))
        write(name, x, period, '112k' if name in ('roar', 'engine', 'arrive') else '128k')
