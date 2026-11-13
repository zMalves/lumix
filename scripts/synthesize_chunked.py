import requests, sys, os, re

def split_into_chunks(text, max_chars=800):
    sentences = re.split(r'(?<=[.!?])\s+', text)
    chunks = []
    current_chunk = []
    current_len = 0

    for s in sentences:
        s = s.strip()
        if not s:
            continue
        if current_len + len(s) > max_chars and current_chunk:
            chunks.append(' '.join(current_chunk))
            current_chunk = [s]
            current_len = len(s)
        else:
            current_chunk.append(s)
            current_len += len(s)

    if current_chunk:
        chunks.append(' '.join(current_chunk))

    return chunks

def main():
    if len(sys.argv) < 3:
        print("Uso: python synthesize_chunked.py <input_txt> <output_mp3>")
        sys.exit(1)

    input_txt = sys.argv[1]
    output_mp3 = sys.argv[2]
    work_dir = os.path.dirname(output_mp3)

    with open(input_txt, 'r', encoding='utf-8') as f:
        full_text = f.read().strip()

    chunks = split_into_chunks(full_text, max_chars=800)
    print(f"[Synthesize] Texto total: {len(full_text)} caracteres dividido em {len(chunks)} blocos seguros (~800 chars cada).")

    url = 'http://127.0.0.1:3900/generate'
    part_files = []

    for i, chunk in enumerate(chunks):
        part_wav = os.path.join(work_dir, f'temp_part_{i}.wav')
        part_mp3 = os.path.join(work_dir, f'temp_part_{i}.mp3')
        print(f"\n[Synthesize] Bloco {i+1}/{len(chunks)} ({len(chunk)} chars)...")

        data = {
            'text': chunk,
            'profile_id': '7182adf6',
            'speed': 1.25,
            'num_step': 10,
            'guidance_scale': 2.0,
            't_shift': 0.10,
            'denoise': True,
            'postprocess_output': True,
            'effect_preset': 'broadcast',
            'max_chunk_chars': 280
        }

        res = requests.post(url, data=data, timeout=600)
        if res.status_code == 200:
            with open(part_wav, 'wb') as f:
                f.write(res.content)
            # Converte para MP3 leve
            os.system(f'ffmpeg -y -i "{part_wav}" -b:a 192k "{part_mp3}" >nul 2>&1')
            if os.path.exists(part_wav):
                os.remove(part_wav)
            part_files.append(part_mp3)
            print(f"[Synthesize] Bloco {i+1} concluído com sucesso!")
        else:
            print(f"[ERRO] Falha no bloco {i+1}: {res.status_code} - {res.text}")
            sys.exit(1)

    # Concatena todos os blocos gerados
    concat_list_txt = os.path.join(work_dir, 'concat_list.txt')
    with open(concat_list_txt, 'w', encoding='utf-8') as f:
        for p in part_files:
            # ffmpeg concat list formato: file 'c:/caminho/...'
            escaped = p.replace('\\', '/')
            f.write(f"file '{escaped}'\n")

    print("\n[Synthesize] Mesclando blocos de áudio no arquivo final...")
    os.system(f'ffmpeg -y -f concat -safe 0 -i "{concat_list_txt}" -c copy "{output_mp3}" >nul 2>&1')

    # Limpeza dos arquivos temporários
    if os.path.exists(concat_list_txt):
        os.remove(concat_list_txt)
    for p in part_files:
        if os.path.exists(p):
            os.remove(p)

    print(f"[Synthesize] [SUCESSO] Audio completo gerado com sucesso em: {output_mp3}")

if __name__ == '__main__':
    main()
