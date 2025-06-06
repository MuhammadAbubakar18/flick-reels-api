const express = require('express');
const multer = require('multer');
const cors = require('cors');
const Replicate = require('replicate');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 10000;

// Middleware
app.use(cors());
app.use(express.json());

// Replicate instance
const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN, // <-- Set this in Render's "Environment" tab
});

// Multer setup for file uploads
const upload = multer({ dest: 'uploads/' });

// Route: Whisper subtitle generation using Replicate
app.post('/whisper', upload.single('audio'), async (req, res) => {
  try {
    const audioPath = path.resolve(__dirname, req.file.path);

    const output = await replicate.run(
      "openai/whisper", {
        input: {
          audio: fs.createReadStream(audioPath),
          language: "en",
          output_format: "srt"
        }
      }
    );

    fs.unlinkSync(audioPath); // Clean up uploaded file
    res.json({ subtitles: output }); // Return SRT content as string
  } catch (error) {
    console.error("❌ Whisper API error:", error);
    res.status(500).json({ error: "Whisper transcription failed." });
  }
});

// Default route
app.get('/', (req, res) => {
  res.send('Whisper API server is running ✅');
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
