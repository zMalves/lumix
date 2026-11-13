import requests, sys, os

url = 'http://127.0.0.1:3900/generate'
project_dir = os.path.join(os.path.dirname(__file__), '..', 'videos', 'Random_Facts_You_Didnt_Know_13')
script_file = os.path.join(project_dir, 'roteiro_traduzido.txt')
wav_file = os.path.join(project_dir, 'temp_narracao.wav')
mp3_file = os.path.join(project_dir, 'narracao.mp3')

with open(script_file, 'r', encoding='utf-8') as f:
    text = f.read().strip()

data = {
    'text': text,
    'profile_id': '7182adf6', # Curiosidades - Padrao
    'speed': 1.08,
    'num_step': 10,           # Rapido e de altissima fidelidade
    'guidance_scale': 2.0,
    't_shift': 0.10,
    'denoise': True,
    'postprocess_output': True,
    'effect_preset': 'broadcast',
    'max_chunk_chars': 280
}

print("Iniciando sintese no Voice Studio (GPU)...")
res = requests.post(url, data=data, timeout=900)

if res.status_code == 200:
    with open(wav_file, 'wb') as f:
        f.write(res.content)
    print(f"[OK] Audio WAV gerado com sucesso: {len(res.content)} bytes")
    # Converte para MP3
    os.system(f'ffmpeg -y -i "{wav_file}" -b:a 192k "{mp3_file}"')
    if os.path.exists(wav_file):
        os.remove(wav_file)
    print("[OK] MP3 gerado em:", mp3_file)
else:
    print("[ERRO] Voice Studio:", res.status_code, res.text)
    sys.exit(1)
