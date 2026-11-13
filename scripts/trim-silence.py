import sys
import os
from pydub import AudioSegment
from pydub.silence import detect_nonsilent

def trim_silences(
    input_path: str,
    output_path: str = None,
    min_silence_len: int = 350,    # milissegundos mínimos para considerar pausa (calibrado para cortes naturais sem picotar fala)
    keep_silence: int = 200,        # milissegundos de respiro natural mantidos entre frases (ritmo dinâmico sem afobação)
    padding: int = 90,              # milissegundos de margem de segurança antes/depois da fala para jamais cortar fonemas ou consoantes
    silence_thresh: float = None    # dBFS limite (se None, auto-calculado)
):
    if not os.path.exists(input_path):
        raise FileNotFoundError(f"Arquivo não encontrado: {input_path}")

    if output_path is None:
        output_path = input_path

    audio = AudioSegment.from_file(input_path)
    orig_duration_sec = len(audio) / 1000.0

    # Auto-calcula limiar ágil mas suave para Shorts
    if silence_thresh is None:
        silence_thresh = max(audio.dBFS - 15.0, -36.0)

    # Detecta todos os intervalos onde há fala
    nonsilent_ranges = detect_nonsilent(
        audio,
        min_silence_len=min_silence_len,
        silence_thresh=silence_thresh
    )

    if not nonsilent_ranges:
        print("[Aviso] Nenhuma fala detectada com os parâmetros atuais. Mantendo áudio original.")
        if output_path != input_path:
            audio.export(output_path, format="mp3")
        return {
            "original_duration": orig_duration_sec,
            "new_duration": orig_duration_sec,
            "removed_seconds": 0.0,
            "segments_count": 0
        }

    # Mescla trechos muito colados (se a distância entre eles for menor que 200ms, mantém unificado para não picotar palavras)
    merged_ranges = []
    current_start, current_end = nonsilent_ranges[0]

    for next_start, next_end in nonsilent_ranges[1:]:
        if next_start - current_end < 200:
            current_end = next_end
        else:
            merged_ranges.append((current_start, current_end))
            current_start, current_end = next_start, next_end
    merged_ranges.append((current_start, current_end))

    # Monta o novo áudio mantendo respiro natural e suave crossfade
    trimmed_audio = AudioSegment.empty()
    breath = AudioSegment.silent(duration=keep_silence)

    for i, (start_ms, end_ms) in enumerate(merged_ranges):
        s = max(0, start_ms - padding)
        e = min(len(audio), end_ms + padding)
        chunk = audio[s:e]

        # Aplica micro fade in/fade out de 10ms nas bordas para transição suave sem cliques
        if len(chunk) > 25:
            chunk = chunk.fade_in(10).fade_out(10)

        if i > 0 and keep_silence > 0:
            trimmed_audio += breath
        trimmed_audio += chunk

    new_duration_sec = len(trimmed_audio) / 1000.0
    removed_sec = orig_duration_sec - new_duration_sec

    # Exporta o áudio final
    trimmed_audio.export(output_path, format="mp3", bitrate="192k")

    print(f"[OK] Silencios cortados com sucesso!")
    print(f"   - Duracao original: {orig_duration_sec:.2f}s")
    print(f"   - Nova duracao:     {new_duration_sec:.2f}s")
    print(f"   - Tempo removido:   {removed_sec:.2f}s ({len(nonsilent_ranges)} trechos de fala)")

    return {
        "original_duration": orig_duration_sec,
        "new_duration": new_duration_sec,
        "removed_seconds": removed_sec,
        "segments_count": len(nonsilent_ranges)
    }

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Uso: python trim-silence.py <caminho_audio> [caminho_saida] [min_silence_ms] [keep_silence_ms]")
        sys.exit(1)

    in_file = sys.argv[1]
    out_file = sys.argv[2] if len(sys.argv) > 2 else in_file
    min_silence = int(sys.argv[3]) if len(sys.argv) > 3 else 350
    keep_silence = int(sys.argv[4]) if len(sys.argv) > 4 else 200

    trim_silences(in_file, out_file, min_silence_len=min_silence, keep_silence=keep_silence)
