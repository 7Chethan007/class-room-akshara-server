#!/usr/bin/env node
/**
 * TEST: Direct Whisper transcription of actual recording
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Find an actual recording file
const recordingsBase = './recordings';
let recordingFile = null;

function findRecording(){
  if (!fs.existsSync(recordingsBase)) {
    console.error('❌ Recordings directory not found');
    process.exit(1);
  }
  
  const dirs = fs.readdirSync(recordingsBase);
  for (const userDir of dirs) {
    const userPath = path.join(recordingsBase, userDir);
    const sessions = fs.readdirSync(userPath);
    for (const sessionDir of sessions) {
      const sessionPath = path.join(userPath, sessionDir);
      const wavFile = path.join(sessionPath, 'recording.wav');
      if (fs.existsSync(wavFile)) {
        const stats = fs.statSync(wavFile);
        if (stats.size > 100) { // valid file
          return wavFile;
        }
      }
    }
  }
  return null;
}

recordingFile = findRecording();
if (!recordingFile) {
  console.error('❌ No valid recording.wav file found');
  process.exit(1);
}

const stats = fs.statSync(recordingFile);
console.log(`
╔═════════════════════════════════════════════════════════════╗
║  TEST: Direct Whisper Transcription                        ║
╚═════════════════════════════════════════════════════════════╝

📝 Test file: ${recordingFile}
📊 File size: ${stats.size} bytes
${stats.size < 1000 ? '⚠️  WARNING: File is small' : '✅ File size OK'}

🔄 Running Whisper...

`);

const PYTHON_PATH = 'C:\\Program Files\\Python311\\python.exe';
const tempJsonPath = recordingFile.replace('.wav', '_result.json');

const args = [
  '-m', 'whisper',
  recordingFile,
  '--model', 'tiny',
  '--language', 'en',
  '--output_format', 'json',
  '--output_dir', path.dirname(recordingFile),
  '--device', 'cpu'
];

console.log(`Running: ${PYTHON_PATH}`);
console.log(`Args: ${args.join(' ')}\n`);

const whisper = spawn(PYTHON_PATH, args, {
  timeout: 60000,
  stdio: ['pipe', 'pipe', 'pipe']
});

let stdout = '';
let stderr = '';

whisper.stdout.on('data', (data) => {
  const text = data.toString();
  stdout += text;
  if (text.trim()) process.stdout.write(`[STDOUT] ${text}`);
});

whisper.stderr.on('data', (data) => {
  const text = data.toString();
  stderr += text;
  if (text.trim()) process.stdout.write(`[STDERR] ${text}`);
});

whisper.on('close', (code) => {
  setTimeout(() => {
    console.log(`\n✓ Process exited with code: ${code}\n`);

    if (code === 0 && fs.existsSync(tempJsonPath)) {
      try {
        const result = JSON.parse(fs.readFileSync(tempJsonPath, 'utf8'));
        console.log('╔═════════════════════════════════════════════════════════════╗');
        console.log('║  ✅ TRANSCRIPTION SUCCESS                                   ║');
        console.log('╚═════════════════════════════════════════════════════════════╝\n');
        
        console.log(`Text length: ${result.text?.length || 0} characters`);
        console.log(`\nTranscribed text:\n`);
        console.log(result.text || '(empty)');
        console.log(`\nSegments: ${result.language}`);
        
        if (result.segments && result.segments.length > 0) {
          console.log(`\n${result.segments.length} segments found:`);
          for (const seg of result.segments.slice(0, 5)) {
            console.log(`  [${seg.start.toFixed(1)}s-${seg.end.toFixed(1)}s] ${seg.text}`);
          }
        }

        // Cleanup
        try {
          fs.unlinkSync(tempJsonPath);
        } catch (e) {}

      } catch (err) {
        console.error('❌ Failed to parse JSON result:', err.message);
      }
    } else {
      console.log('╔═════════════════════════════════════════════════════════════╗');
      console.log('║  ❌ TRANSCRIPTION FAILED                                    ║');
      console.log('╚═════════════════════════════════════════════════════════════╝\n');
      
      if (code !== 0) {
        console.log(`Exit code: ${code}`);
        console.log(`Error output: ${stderr || '(none)'}`);
      } else {
        console.log(`Result file not found: ${tempJsonPath}`);
      }
    }

    process.exit(code === 0 ? 0 : 1);
  }, 500);
});

whisper.on('error', (err) => {
  console.error(`❌ Spawn error: ${err.message}`);
  process.exit(1);
});
