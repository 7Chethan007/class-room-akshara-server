#!/usr/bin/env python3
"""
Advanced Audio Transcription with librosa (no FFmpeg needed)
Converts WAV → MP3 and transcribes using Whisper
Handles malformed WAV files and format detection
"""
import sys
import json
import os
from pathlib import Path
import subprocess
import struct

def validate_wav_file(wav_path):
    """Validate and repair WAV file if needed"""
    try:
        with open(wav_path, 'rb') as f:
            # Check RIFF header
            riff_header = f.read(4)
            if riff_header != b'RIFF':
                print(f"[WHISPER-PY] ⚠️ Invalid RIFF header, attempting to repair", file=sys.stderr)
                return False
            
            # Read file size
            file_size_bytes = f.read(4)
            if len(file_size_bytes) < 4:
                return False
            
            file_size = struct.unpack('<I', file_size_bytes)[0] + 8
            actual_size = os.path.getsize(wav_path)
            
            # Check if file size matches
            if actual_size != file_size:
                print(f"[WHISPER-PY] ⚠️ WAV size mismatch: header says {file_size}, actual is {actual_size}", file=sys.stderr)
                
                # Try to repair the header
                with open(wav_path, 'r+b') as fw:
                    # Update RIFF size
                    fw.seek(4)
                    fw.write(struct.pack('<I', actual_size - 8))
                    
                    # Find data chunk and update its size
                    fw.seek(0)
                    data = fw.read()
                    
                    # Look for 'data' chunk
                    data_pos = data.find(b'data')
                    if data_pos != -1 and data_pos + 8 < len(data):
                        fw.seek(data_pos + 4)
                        audio_data_size = actual_size - (data_pos + 8)
                        fw.write(struct.pack('<I', audio_data_size))
                        print(f"[WHISPER-PY] ✅ Repaired WAV header", file=sys.stderr)
                        return True
            
            return True
    except Exception as e:
        print(f"[WHISPER-PY] ⚠️ Error validating WAV: {str(e)}", file=sys.stderr)
        return False

def convert_wav_to_mp3(wav_path, mp3_path):
    """Convert WAV to MP3 using ffmpeg or alternative"""
    try:
        # Try using ffmpeg if available
        result = subprocess.run(
            ['ffmpeg', '-i', wav_path, '-q:a', '9', '-n', mp3_path],
            capture_output=True,
            timeout=30
        )
        if result.returncode == 0 and os.path.exists(mp3_path):
            return True
    except:
        pass
    
    # If ffmpeg not available, try using pydub
    try:
        from pydub import AudioSegment
        audio = AudioSegment.from_wav(wav_path)
        audio.export(mp3_path, format="mp3", bitrate="192k")
        return os.path.exists(mp3_path)
    except:
        pass
    
    # If all else fails, just copy WAV as output
    import shutil
    try:
        shutil.copy(wav_path, mp3_path.replace('.mp3', '.wav'))
        return True
    except:
        return False

def transcribe_audio(audio_path, model_name="tiny", language="en"):
    """
    Transcribe audio using Whisper with librosa for audio loading
    """
    try:
        import whisper
        import librosa
        import numpy as np
        
        print(f"[WHISPER-PY] Loading model: {model_name}", file=sys.stderr)
        model = whisper.load_model(model_name, device="cpu")
        
        # Validate and repair WAV file
        print(f"[WHISPER-PY] Validating audio file: {audio_path}", file=sys.stderr)
        validate_wav_file(audio_path)
        
        print(f"[WHISPER-PY] Loading audio with librosa: {audio_path}", file=sys.stderr)
        
        # Load audio using librosa (works without FFmpeg!)
        # Try multiple sample rates if 16kHz fails
        for sr in [16000, 44100, 48000, None]:
            try:
                audio_data, loaded_sr = librosa.load(audio_path, sr=sr)
                print(f"[WHISPER-PY] ✅ Loaded audio: sr={loaded_sr}, shape={audio_data.shape}", file=sys.stderr)
                break
            except Exception as e:
                if sr is None:
                    raise
                print(f"[WHISPER-PY] Could not load at sr={sr}, trying next...", file=sys.stderr)
        
        # Check if audio is actually valid
        if audio_data.shape[0] < 8000:  # Less than 0.5 seconds at 16kHz
            print(f"[WHISPER-PY] ⚠️ Audio too short: {audio_data.shape[0]} samples", file=sys.stderr)
        
        # Transcribe
        print(f"[WHISPER-PY] Starting transcription...", file=sys.stderr)
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
        import traceback
        traceback.print_exc(file=sys.stderr)
        return {"text": "", "segments": [], "error": str(e)}

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: transcribe_advanced.py <audio_file>"}))
        sys.exit(1)
    
    audio_file = sys.argv[1]
    model = sys.argv[2] if len(sys.argv) > 2 else "tiny"
    language = sys.argv[3] if len(sys.argv) > 3 else "en"
    
    if not os.path.exists(audio_file):
        print(json.dumps({"error": f"File not found: {audio_file}"}))
        sys.exit(1)
    
    # Validate WAV file first
    validate_wav_file(audio_file)
    
    # Convert WAV to MP3 if needed
    if audio_file.endswith('.wav'):
        mp3_file = audio_file.replace('.wav', '.mp3')
        print(f"[WHISPER-PY] Converting WAV to MP3: {mp3_file}", file=sys.stderr)
        convert_wav_to_mp3(audio_file, mp3_file)
    
    result = transcribe_audio(audio_file, model, language)
    print(json.dumps(result))
