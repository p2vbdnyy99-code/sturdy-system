"""Sound for TenderTez reel 1: voice, a light pitched score and foley, all synthesised (no samples).
Run from the library root: .venv/bin/python films/tendertez-reel1/mix.py -> out/mix.wav"""
import json, os, sys
import numpy as np, soundfile as sf
LIB = os.environ.get('LIB') or os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
sys.path.insert(0, LIB)
from core.audio.sfx import SR, lp, hp, bp, add, compress, limit, whoosh, noise
HERE = os.path.dirname(os.path.abspath(__file__))
D = json.load(open(os.path.join(HERE, 'events.json'))); DUR = float(D['dur']); EV = D['ev']
N = int(round(DUR * SR)); music = np.zeros((N, 2)); fol = np.zeros((N, 2)); vox = np.zeros((N, 2))
def tone(f, d, tau, harm=((1, 1.0), (2, .25), (3.01, .12))):          # a kalimba-like pluck
    t = np.arange(int(d * SR)) / SR; x = sum(a * np.sin(2 * np.pi * f * h * t) for h, a in harm)
    att = np.minimum(1, t / .004); return x * att * np.exp(-t / tau)
def midi(m): return 440 * 2 ** ((m - 69) / 12)
SCALE = [62, 64, 66, 69, 71, 74, 76, 78, 81, 83, 86]                   # D major pentatonic
# pop-ins: a rising series as the row grows
pops = [e for e in EV if e['type'] == 'pop']
for k, e in enumerate(pops):
    i = max(0, e.get('i', 0)); note = SCALE[min(len(SCALE) - 1, int(i / 4))] + (0 if i % 2 == 0 else 0)
    add(music, tone(midi(note), .5, .16), e['t'], .16 if i >= 0 else .3, pan=min(.6, -.3 + i * .025))
# a soft pizzicato-like bass pulse, two notes a bar at 100 bpm, resting in the silences
for b in np.arange(0.6, DUR - 2.5, 1.2):
    if 21.8 < b < 22.4: continue
    if 9.6 < b < 10.6 or 15.9 < b < 16.7 or 11.8 < b < 13.0: continue
    root = 50 if b < 13 else 45 if b < 16.6 else 50
    add(music, lp(tone(midi(root - 12), .9, .28, ((1, 1.0), (2, .5), (3, .3))), 900), b, .5)
    add(music, lp(tone(midi(root - 5), .7, .22, ((1, 1.0), (2, .5), (3, .3))), 900), b + .6, .32)
for e in EV:
    t = e['t']
    if e['type'] == 'mark':                                            # the clause: one clear high note after near-silence
        add(music, tone(midi(81), 1.6, .5), t, .5); add(music, tone(midi(74), 1.6, .5), t + .02, .25)
    if e['type'] == 'fade':                                            # it drops a minor third and is gone
        add(music, tone(midi(78), 1.2, .4), t, .3); add(music, tone(midi(66), 1.5, .5), t + .35, .28)
    if e['type'] == 'pulse':
        add(fol, lp(whoosh(1.1, .5), 2500), t, .5, pan=-.3)
    if e['type'] == 'hit':
        n = [74, 78, 81, 86][e['k']]
        add(music, tone(midi(n), 1.8, .55, ((1, 1.0), (2, .4), (4, .2))), t, .5, pan=-.2 + .15 * e['k'])
        add(fol, hp(noise(.03) * np.exp(-np.arange(int(.03 * SR)) / SR / .006), 2500), t, .12)
    if e['type'] == 'page':
        add(music, tone(midi(93), .35, .08), t, .2, pan=-.2 + .15 * e['k'])
    if e['type'] == 'end':                                             # closing chord
        for j, n in enumerate([50, 57, 62, 66, 69, 74]): add(music, tone(midi(n), 4.5, 1.4, ((1, 1.0), (2, .3), (3, .1))), t + .05 * j, .22, pan=-.3 + .12 * j)
# voice: compress, then sit it about 10 dB over the music; the music ducks under each line
VO = [(0.6, 'l1'), (5.2, 'l2'), (9.0, 'l3'), (13.2, 'l4'), (16.7, 'l5'), (22.3, 'l6'), (26.3, 'l7')]
duck = np.ones(N)
for t0, vid in VO:
    x, sr = sf.read(os.path.join(HERE, 'voice', vid + '.wav'))
    if x.ndim > 1: x = x.mean(1)
    if sr != SR:
        import soxr; x = soxr.resample(x, sr, SR)
    x = compress(hp(x, 70), thr=.2, ratio=3.0); x = x / (np.sqrt(np.mean(x ** 2)) + 1e-9) * .11
    add(vox, x, t0, 1.0)
    a, b = int((t0 - .15) * SR), min(N, int((t0 + len(x) / SR + .25) * SR)); duck[max(0, a):b] = .42
k = int(.12 * SR); duck = np.convolve(duck, np.ones(k) / k, 'same')
mrms = np.sqrt(np.mean(music ** 2)) + 1e-9; music *= (.11 / 2.4) / mrms * 1.0   # music roughly 8 dB under the voice before ducking
mix = vox + music * duck[:, None] + fol * .6
fade = np.minimum(1, (N - np.arange(N)) / (.8 * SR)); mix *= fade[:, None]
mix = limit(mix, .9)
os.makedirs(os.path.join(HERE, 'out'), exist_ok=True); sf.write(os.path.join(HERE, 'out', 'mix.wav'), mix, SR)
print('mix ok', DUR)
