const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const fetch = require('node-fetch');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 10000;
const upload = multer({ dest: 'uploads/' });

app.use(cors());
app.use(express.json());

// 🔁 Step 1: Upload to AssemblyAI
app.post('/upload', upload.single('audio'), async (req, res) => {
  const filePath = req.file.path;
  const fileStream = fs.createReadStream(filePath);

  const response = await fetch('https://api.assemblyai.com/v2/upload', {
    method: 'POST',
    headers: {
      authorization: process.env.ASSEMBLY_API_KEY,
    },
    body: fileStream,
  });

  const data = await response.json();
  fs.unlinkSync(filePath); // clean up

  res.json({ upload_url: data.upload_url });
});

// 🧠 Step 2: Start Transcription with Enhanced Model
app.post('/transcribe', async (req, res) => {
  const { audio_url } = req.body;

  const response = await fetch('https://api.assemblyai.com/v2/transcript', {
    method: 'POST',
    headers: {
      authorization: process.env.ASSEMBLY_API_KEY,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      audio_url,
      speaker_labels: true,
      dual_channel: true,
      word_boost: ['welcome', 'video', 'editor', 'AI'],
      model: 'enhanced',
      punctuate: true,
      format_text: true,
    }),
  });

  const data = await response.json();
  res.json({ transcript_id: data.id });
});

// 🔄 Step 3: Poll for Transcription Result
app.get('/transcription/:id', async (req, res) => {
  const { id } = req.params;

  const response = await fetch(`https://api.assemblyai.com/v2/transcript/${id}`, {
    method: 'GET',
    headers: {
      authorization: process.env.ASSEMBLY_API_KEY,
    },
  });

  const data = await response.json();

  if (data.status === 'completed') {
    const wordSubtitles = data.words.map((w) => ({
      start: w.start,
      end: w.end,
      text: w.text,
    }));
    res.json({ status: 'completed', words: wordSubtitles });
  } else {
    res.json({ status: data.status });
  }
});

// ✅ Test Endpoint
app.get('/', (req, res) => {
  res.send('Server running on port ' + port);
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
