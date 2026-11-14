# Whole script in one pass (natural flow between sentences), VoxCPM2, Apache-2.0. Variant via argv: cfg timesteps tag
import json, sys, os, numpy as np, soundfile as sf
from voxcpm import VoxCPM
HERE = os.path.dirname(os.path.abspath(__file__))
L = json.load(open(os.path.join(HERE, 'lines.json')))
cfg, steps, tag = float(sys.argv[1]), int(sys.argv[2]), sys.argv[3]
mode = sys.argv[4] if len(sys.argv) > 4 else 'ref'
m = VoxCPM.from_pretrained('openbmb/VoxCPM2', load_denoiser=False, local_files_only=True, optimize=False, device='cpu')
text = ' '.join(l['text'] for l in L)
kw = dict(text=text, cfg_value=cfg, inference_timesteps=steps, normalize=False, retry_badcase=True)
if mode == 'ref': kw['reference_wav_path'] = os.path.join(HERE, 'voice', 'ref.wav')
else: kw['text'] = '(A young Indian woman in her late twenties, warm, lively and expressive, talking casually to camera in natural Hinglish like a friendly Instagram creator, relaxed pace, natural intonation)' + text
w = np.asarray(m.generate(**kw), dtype=np.float32)
sf.write(os.path.join(HERE, 'voice2', f'full_{tag}.wav'), w, 48000); print(tag, round(len(w)/48000, 2))
