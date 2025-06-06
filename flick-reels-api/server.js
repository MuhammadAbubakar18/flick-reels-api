const express = require('express');
const multer = require('multer');
const axios = require('axios');
const cors = require('cors');
const fs = require('fs');
const FormData = require('form-data');
require('dotenv').config();

const app = express();
const upload = multer({ dest: 'uploads/' });
app.use(cors());
app.use(express.json());

const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;

app.get('/', (_, res) => {
  res.send('Server running on port 10000');
});

// 1. Upload route
app.post('/upload', upload.single('audio'), async (req, res) => {
  const filePath = req.file.path;

  try {
    const fileData = fs.readFileSync(filePath);
    const form = new FormData();
    form.append('file', fileData, {
      filename: req.file.originalname,
    });

    const response = await axios.post('https://api.replicate.com/v1/files', form, {
      headers: {
        ...form.getHeaders(),
        Authorization: `Bearer ${REPLICATE_API_TOKEN}`,
      },
    });

    fs.unlinkSync(filePath); // cleanup
    res.json({ upload_url: response.data.url });
  } catch (error) {
    console.error('Upload error:', error.message);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// 2. Transcribe route
app.post('/transcribe', async (req, res) => {
  const audioUrl = req.body.audio_url;

  try {
    const replicateResponse = await axios.post(
      'https://api.replicate.com/v1/predictions',
      {
        version: "d2675f1c10e17fd9c1c4fa994f3471463b2c1cb74c489eac72ed7ba817ef760d", // whisper
        input: {
          audio: audioUrl,
          output_format: "json" // structured output
        },
      },
      {
        headers: {
          Authorization: `Bearer ${REPLICATE_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const prediction = replicateResponse.data;
    res.json({ prediction_id: prediction.id });
  } catch (error) {
    console.error('Transcription start error:', error.message);
    res.status(500).json({ error: 'Transcription request failed' });
  }
});

// 3. Polling
app.get('/transcription/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const response = await axios.get(`https://api.replicate.com/v1/predictions/${id}`, {
      headers: {
        Authorization: `Bearer ${REPLICATE_API_TOKEN}`,
      },
    });

    const prediction = response.data;
    if (prediction.status === 'succeeded') {
      const transcript = prediction.output;
      const words = transcript.map((entry, index) => ({
        start: Math.floor(entry.start * 1000),
        end: Math.floor(entry.end * 1000),
        text: entry.text.trim(),
        index,
      }));
      return res.json({ status: 'completed', words });
    }

    if (prediction.status === 'failed') {
      return res.json({ status: 'error' });
    }

    res.json({ status: prediction.status });
  } catch (e) {
    console.error('Polling error:', e.message);
    res.status(500).json({ error: 'Polling failed' });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
