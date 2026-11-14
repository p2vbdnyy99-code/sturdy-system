# Hinglish narration with VoxCPM2 (Apache-2.0), every line cloned from voice/ref.wav so the voice stays the same.
import json, sys, os, numpy as np, soundfile as sf
from voxcpm import VoxCPM
HERE = os.path.dirname(os.path.abspath(__file__))
L = json.load(open(os.path.join(HERE, 'lines.json')))
only = set(sys.argv[1:])
m = VoxCPM.from_pretrained('openbmb/VoxCPM2', load_denoiser=False, local_files_only=True, optimize=False, device='cpu')
sr = getattr(m.tts_model, 'sample_rate', 48000)
dur = {}
for l in L:
    if only and l['id'] not in only: continue
    w = m.generate(text=l['text'], reference_wav_path=os.path.join(HERE, 'voice', 'ref.wav'), cfg_value=2.0, inference_timesteps=10, normalize=False, retry_badcase=True)
    w = np.asarray(w, dtype=np.float32)
    nz = np.where(np.abs(w) > 0.01)[0]; w = w[max(0, nz[0] - int(.03*sr)): nz[-1] + int(.08*sr)] if len(nz) else w
    sf.write(os.path.join(HERE, 'voice', l['id'] + '.wav'), w, sr); dur[l['id']] = round(len(w) / sr, 3); print(l['id'], dur[l['id']], flush=True)
p = os.path.join(HERE, 'voice', 'dur.json'); old = json.load(open(p)) if os.path.exists(p) else {}
old.update(dur); json.dump(old, open(p, 'w'), indent=1); print('sr', sr)
