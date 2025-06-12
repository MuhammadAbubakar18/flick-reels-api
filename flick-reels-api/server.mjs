import express from 'express';
import multer from 'multer';
import cors from 'cors';
import fs from 'fs/promises';
import path from 'path';
import Replicate from 'replicate';
import dotenv from 'dotenv';
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ dest: 'uploads/' });
const PORT = process.env.PORT || 10000;

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

console.log(`🚀 Whisper server running on port ${PORT}`);
console.log('🔧 Replicate version:', replicate.version);
console.log('🔍 Available Replicate methods:', Object.keys(replicate));

// ===== ✅ 1. Upload and get public HTTPS URL
app.post('/upload', upload.single('audio'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  try {
    const filePath = path.resolve(req.file.path);
    const fileBuffer = await fs.readFile(filePath);

    const uploadResponse = await replicate.upload(fileBuffer, {
      contentType: req.file.mimetype,
      filename: req.file.originalname,
    });

    if (!uploadResponse?.url) {
      throw new Error('No URL returned from replicate.upload()');
    }

    console.log('✅ Uploaded to:', uploadResponse.url);
    res.json({ upload_url: uploadResponse.url });
  } catch (error) {
    console.error('❌ Upload error:', error);
    res.status(500).json({ error: 'Upload failed', detail: error.message });
  }
});

// ===== ✅ 2. Start transcription
const transcriptionCache = {};

app.post('/transcribe', async (req, res) => {
  try {
    const { audio_url } = req.body;
    if (!audio_url) {
      return res.status(400).json({ error: 'Missing audio_url' });
    }

    const prediction = await replicate.predictions.create({
      version: "a2e3c15c03e3f18e68b9c9565d6b31283c13ad095a380ddcf80c60363a932f7c",
      input: {
        audio: audio_url,
        transcription: "verbose_json",
        language: "en"
      },
    });

    transcriptionCache[prediction.id] = prediction;
    console.log(`🚀 Transcription started: ${prediction.id}`);
    res.json({ transcript_id: prediction.id });
  } catch (err) {
    console.error('❌ Transcription error:', err);
    res.status(500).json({ error: 'Transcription failed', detail: err.message });
  }
});

// ===== ✅ 3. Poll for results
app.get('/transcription/:id', async (req, res) => {
  try {
    const prediction = await replicate.predictions.get(req.params.id);
    console.log(`🔄 Polled status: ${prediction.status}`);

    if (prediction.status === "succeeded") {
      const words = prediction.output.words || [];
      const formattedWords = words.map(w => ({
        start: Math.floor(parseFloat(w.start) * 1000),
        end: Math.floor(parseFloat(w.end) * 1000),
        text: w.text.trim()
      }));
      return res.json({ status: "completed", words: formattedWords });
    }

    if (prediction.status === "failed") {
      return res.status(500).json({ status: "error", detail: prediction.error });
    }

    res.json({ status: prediction.status });
  } catch (err) {
    console.error('❌ Polling error:', err);
    res.status(500).json({ error: 'Polling failed', detail: err.message });
  }
});

app.listen(PORT);