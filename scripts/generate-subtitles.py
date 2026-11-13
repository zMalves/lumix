import sys, os
from faster_whisper import WhisperModel

audio_path = sys.argv[1]
output_ass = sys.argv[2]
lang = sys.argv[3] if len(sys.argv) > 3 and sys.argv[3] else "pt"

model = WhisperModel("base", device="cpu", compute_type="int8")
segments, info = model.transcribe(audio_path, language=lang, word_timestamps=True)

def format_ass_time(sec):
    h = int(sec // 3600)
    m = int((sec % 3600) // 60)
    s = int(sec % 60)
    cs = int((sec - int(sec)) * 100)
    return f"{h:01d}:{m:02d}:{s:02d}.{cs:02d}"

# Resolução 9:16 vertical nativa (1080x1920 Full HD)
# Alignment 5 = centro exato da tela (X=540, Y=960)
ass_content = """[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial Black,75,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,7,3,5,15,15,15,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""

events = []
for segment in segments:
    for word in segment.words:
        w_text = word.word.strip().upper()
        if not w_text:
            continue
        start_str = format_ass_time(word.start)
        end_str = format_ass_time(word.end)
        events.append(f"Dialogue: 0,{start_str},{end_str},Default,,0,0,0,,{w_text}")

with open(output_ass, "w", encoding="utf-8") as f:
    f.write(ass_content + "\n".join(events))

print(f"Legendas 9:16 geradas com sucesso! {len(events)} palavras alinhadas.")
