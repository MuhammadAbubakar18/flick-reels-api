// server.mjs
import express from 'express';
import multer from 'multer';
import cors from 'cors';
import fs from 'fs/promises';
import path from 'path';
import replicate from 'replicate';
import dotenv from 'dotenv';
import { v2 as cloudinary } from 'cloudinary'; // Import Cloudinary

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Configure Cloudinary (get these from your Cloudinary dashboard)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const upload = multer({ dest: 'uploads/' });
const PORT = process.env.PORT || 10000;

console.log(`🚀 Whisper server running on port ${PORT}`);
console.log('🔍 Available Replicate methods:', Object.keys(replicate));

// ===== ✅ 1. Upload to Cloudinary and get public HTTPS URL
app.post('/upload', upload.single('audio'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  try {
    const filePath = path.resolve(req.file.path);

    // Upload audio file to Cloudinary
    const result = await cloudinary.uploader.upload(filePath, {
      resource_type: "video", // Treat as video to handle audio extraction by Cloudinary if needed, or 'raw' for just audio
      folder: "replicate_audio_uploads", // Optional: organize your uploads
    });

    // Clean up the local file after upload
    await fs.unlink(filePath);

    if (!result?.secure_url) {
      throw new Error('No secure_url returned from Cloudinary upload');
    }

    console.log('✅ Uploaded to Cloudinary:', result.secure_url);
    res.json({ upload_url: result.secure_url });
  } catch (error) {
    console.error('❌ Upload error:', error);
    res.status(500).json({ error: 'Upload failed', detail: error.message });
  }
});

// ===== ✅ 2. Start transcription (No changes needed here as it expects a URL)
const transcriptionCache = {};

app.post('/transcribe', async (req, res) => {
  try {
    const { audio_url } = req.body;
    if (!audio_url) {
      return res.status(400).json({ error: 'Missing audio_url' });
    }

    // Initialize Replicate API with your token
    const replicateApi = new replicate({
      auth: process.env.REPLICATE_API_TOKEN,
    });

    const prediction = await replicateApi.predictions.create({
      version: "be69de6b9dc57b3361dff4122ef4d6876ad4234bf5c879287b48d35c20ce3e83",
      input: {
        audio: audio_url,
        transcription: "verbose_json",
        language: "auto"
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

// ===== ✅ 3. Poll for results (No changes needed here)
app.get('/transcription/:id', async (req, res) => {
  try {
    // Initialize Replicate API with your token
    const replicateApi = new replicate({
      auth: process.env.REPLICATE_API_TOKEN,
    });

    const prediction = await replicateApi.predictions.get(req.params.id);
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

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});