import sqlite3, os, json
db_path = os.path.expandvars('%APPDATA%/OmniVoice/omnivoice.db')
conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row
r = conn.execute("SELECT * FROM voice_profiles WHERE id='7182adf6'").fetchone()
if r:
    print(json.dumps(dict(r), indent=2))
else:
    print("Nenhum perfil encontrado")
