#!/usr/bin/env python3
"""
Whisper transcription script
Transcribes audio file using Whisper
Can be called from Node.js
"""
import sys
import json
import os
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent))

def transcribe_audio(audio_path, model_name="tiny", language="en"):
    """
    Transcribe audio file using Whisper
    Returns JSON with text and segments
    """
    try:
        import whisper
        
        print(f"[WHISPER-PY] Loading model: {model_name}", file=sys.stderr)
        model = whisper.load_model(model_name, device="cpu")
        
        print(f"[WHISPER-PY] Transcribing: {audio_path}", file=sys.stderr)
        result = model.transcribe(
            audio_path, 
            language=language,
            fp16=False,
            verbose=False
        )
        
        print(f"[WHISPER-PY] Transcription complete: {len(result.get('text', ''))} chars", file=sys.stderr)
        return result
        
    except Exception as e:
        print(f"[WHISPER-PY] Error: {str(e)}", file=sys.stderr)
        return {"text": "", "segments": [], "error": str(e)}

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: transcribe.py <audio_file>"}))
        sys.exit(1)
    
    audio_file = sys.argv[1]
    model = sys.argv[2] if len(sys.argv) > 2 else "tiny"
    language = sys.argv[3] if len(sys.argv) > 3 else "en"
    
    if not os.path.exists(audio_file):
        print(json.dumps({"error": f"File not found: {audio_file}"}))
        sys.exit(1)
    
    result = transcribe_audio(audio_file, model, language)
    print(json.dumps(result))
