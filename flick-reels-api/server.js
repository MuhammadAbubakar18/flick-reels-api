const express = require('express');
const multer = require('multer');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

require('dotenv').config();
const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());

const upload = multer({ dest: 'uploads/' });

app.post('/upload', upload.single('audio'), async (req, res) => {
  try {
    const audioPath = req.file.path;

    const formData = new FormData();
    formData.append('file', fs.createReadStream(audioPath));

    const uploadRes = await axios.post('https://api.replicate.com/v1/files', formData, {
      headers: {
        ...formData.getHeaders(),
        Authorization: `Token ${process.env.REPLICATE_API_TOKEN}`,
      },
    });

    fs.unlinkSync(audioPath); // clean up

    res.json({ upload_url: uploadRes.data.url });
  } catch (error) {
    console.error('Upload error:', error.message);
    res.status(500).json({ error: 'Upload failed' });
  }
});

app.post('/transcribe', async (req, res) => {
  const { audio_url } = req.body;

  try {
    const response = await axios.post(
      'https://api.replicate.com/v1/predictions',
      {
        version: 'a082c5025c62c8db845de5d1c74a1237c6c63a6e98ae51c88e1fc2b5aefc4fad',
        input: {
          audio: audio_url,
          task: 'transcribe',
          output_format: 'json',
        },
      },
      {
        headers: {
          Authorization: `Token ${process.env.REPLICATE_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const predictionId = response.data.id;

    let result;
    while (true) {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      const poll = await axios.get(`https://api.replicate.com/v1/predictions/${predictionId}`, {
        headers: { Authorization: `Token ${process.env.REPLICATE_API_TOKEN}` },
      });

      if (poll.data.status === 'succeeded') {
        result = poll.data.output;
        break;
      } else if (poll.data.status === 'failed') {
        throw new Error('Transcription failed');
      }
    }

    res.json({
      status: 'completed',
      segments: result.segments,
    });
  } catch (err) {
    console.error('Transcription error:', err.message);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

app.listen(PORT, () => console.log(`✅ Whisper API server running on port ${PORT}`));
