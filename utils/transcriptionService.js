const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');

function hasOpenAi() {
  return Boolean(process.env.OPENAI_API_KEY);
}

async function transcribeRecording(recordingPath) {
  if (!hasOpenAi()) {
    throw new Error('OPENAI_API_KEY is missing');
  }

  if (!fs.existsSync(recordingPath)) {
    throw new Error(`Recording file not found: ${recordingPath}`);
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const ext = path.extname(recordingPath).replace('.', '').toLowerCase();
  const response = await client.audio.transcriptions.create({
    file: fs.createReadStream(recordingPath),
    model: process.env.OPENAI_WHISPER_MODEL || 'whisper-1',
    response_format: 'verbose_json',
    language: process.env.OPENAI_WHISPER_LANGUAGE || undefined,
  });

  const text = (response?.text || '').trim();
  const segments = Array.isArray(response?.segments)
    ? response.segments.map((item) => ({
        text: String(item.text || '').trim(),
        start: item.start,
        end: item.end,
      }))
    : [];

  return {
    text,
    segments,
  };
}

module.exports = {
  hasOpenAi,
  transcribeRecording,
};
