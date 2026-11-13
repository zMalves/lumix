import sys
import os
import subprocess

def main():
    if len(sys.argv) < 3:
        print("Uso: python synthesize_minimax.py <input_txt> <output_mp3> [voice_id] [speed]")
        sys.exit(1)

    node_script = os.path.join(os.path.dirname(__file__), "synthesize_minimax.js")
    cmd = ["node", node_script] + sys.argv[1:]
    
    result = subprocess.run(cmd)
    sys.exit(result.returncode)

if __name__ == "__main__":
    main()
