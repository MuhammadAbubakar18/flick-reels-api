const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const Replicate = require('replicate');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ dest: 'uploads/' });
const PORT = process.env.PORT || 10000;

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

// ===== ✅ 1. Upload audio or video file =====
app.post('/upload', upload.single('audio'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const filePath = path.resolve(req.file.path);

  // Replicate supports file:// protocol for local file paths
  const uploadUrl = `file://${filePath}`;

  console.log(`✅ File uploaded: ${uploadUrl}`);
  res.json({ upload_url: uploadUrl });
});

// ===== ✅ 2. Transcription request =====
let transcriptionCache = {}; // Store transcripts in memory (for testing/demo)

app.post('/transcribe', async (req, res) => {
  try {
    const { audio_url } = req.body;

    if (!audio_url) {
      return res.status(400).json({ error: 'Missing audio_url' });
    }

    const prediction = await replicate.predictions.create({
      version: "a2e3c15c03e3f18e68b9c9565d6b31283c13ad095a380ddcf80c60363a932f7c", // Whisper version
      input: {
        audio: audio_url,
        transcription: "verbose_json",
        language: "en"
      },
    });

    console.log(`🚀 Transcription started: ${prediction.id}`);
    transcriptionCache[prediction.id] = prediction;

    res.json({ transcript_id: prediction.id });
  } catch (err) {
    console.error('❌ Transcription error:', err);
    res.status(500).json({ error: 'Transcription failed', detail: err.message });
  }
});

// ===== ✅ 3. Poll for results =====
app.get('/transcription/:id', async (req, res) => {
  try {
    const predictionId = req.params.id;

    const prediction = await replicate.predictions.get(predictionId);
    console.log(`🔄 Polled status: ${prediction.status}`);

    if (prediction.status === "succeeded") {
      const words = prediction.output.words || [];
      const formattedWords = words.map(w => ({
        start: Math.floor(parseFloat(w.start) * 1000),
        end: Math.floor(parseFloat(w.end) * 1000),
        text: w.text.trim()
      }));

      return res.json({ status: "completed", words: formattedWords });
    } else if (prediction.status === "failed") {
      return res.status(500).json({ status: "error", detail: prediction.error });
    }

    res.json({ status: prediction.status });
  } catch (err) {
    console.error('❌ Polling error:', err);
    res.status(500).json({ error: 'Polling failed', detail: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Whisper server running on port ${PORT}`);
});
