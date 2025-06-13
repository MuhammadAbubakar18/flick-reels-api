import express from 'express';
import multer from 'multer';
import cors from 'cors';
import fs from 'fs/promises';
import path from 'path';
import replicate from 'replicate';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ dest: 'uploads/' });
const PORT = process.env.PORT || 10000;

// Initialize the Replicate API client once with your authentication token
const replicateApi = new replicate({
    auth: process.env.REPLICATE_API_TOKEN,
});

console.log(`🚀 Whisper server running on port ${PORT}`);
// Log available methods from the *instance* for debugging
console.log('🔍 Available Replicate methods (on instance):', Object.keys(replicateApi));

// ===== ✅ 1. Upload and get public HTTPS URL
app.post('/upload', upload.single('audio'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  try {
    const filePath = path.resolve(req.file.path);
    const fileBuffer = await fs.readFile(filePath);

    // Use the initialized replicateApi instance for upload
    const uploadResponse = await replicateApi.upload(fileBuffer, {
      contentType: req.file.mimetype,
      filename: req.file.originalname,
    });

    if (!uploadResponse?.url) {
      throw new Error('No URL returned from replicateApi.upload()');
    }

    console.log('✅ Uploaded to Cloudinary:', uploadResponse.url);
    res.json({ upload_url: uploadResponse.url });
  } catch (error) {
    console.error('❌ Upload error:', error);
    res.status(500).json({ error: 'Upload failed', detail: error.message });
  } finally {
    // Clean up the uploaded file
    if (req.file) {
      await fs.unlink(path.resolve(req.file.path));
    }
  }
});

// ===== ✅ 2. Start transcription
const transcriptionCache = {}; // Simple in-memory cache for predictions

app.post('/transcribe', async (req, res) => {
  try {
    const audio_url = req.body.audio_url;
    if (!audio_url) {
      return res.status(400).json({ error: 'Audio URL is required.' });
    }

    // Use the initialized replicateApi instance for predictions.create
    const prediction = await replicateApi.predictions.create({
      version: "fc8db75653afb753541995d315ac4ed632aab7c13abfb25c56a9e810a51ff93e", // Corrected model version for word timestamps
      input: {
        audio: audio_url,
        word_timestamps: true, // Enable word-level timestamps
        // language: "en" // Removed this parameter as it was causing issues and model can auto-detect
      },
    });

    transcriptionCache[prediction.id] = prediction;
    console.log(`🚀 Transcription started: ${prediction.id}`);
    res.json({ transcript_id: prediction.id });
  } catch (err) {
    console.error('❌ Transcription error:', err);
    res.status(500).json({ error: 'Transcription start failed', detail: err.message });
  }
});

// ===== ✅ 3. Poll for results
app.get('/transcription/:id', async (req, res) => {
  try {
    // Use the initialized replicateApi instance for predictions.get
    const prediction = await replicateApi.predictions.get(req.params.id);
    console.log(`🔄 Polled status: ${prediction.status}`);

    if (prediction.status === "succeeded") {
      let allWords = [];
      // Check if the output has segments and if it's an array
      if (prediction.output && Array.isArray(prediction.output.segments)) {
        prediction.output.segments.forEach(segment => {
          // Each segment is expected to have its own 'words' array for word-level timestamps
          if (segment.words && Array.isArray(segment.words)) {
            const formattedSegmentWords = segment.words.map(w => ({
              start: Math.floor(parseFloat(w.start) * 1000), // Convert seconds to milliseconds
              end: Math.floor(parseFloat(w.end) * 1000),     // Convert seconds to milliseconds
              text: w.text.trim()
            }));
            allWords = allWords.concat(formattedSegmentWords);
          }
        });
      }

      // Send the combined list of all words to the frontend
      return res.json({ status: "completed", words: allWords });
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