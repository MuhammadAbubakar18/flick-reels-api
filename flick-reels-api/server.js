// server.js - Node server for AssemblyAI integration (Render-ready)
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 5000;
const upload = multer({ dest: 'uploads/' });
const ASSEMBLY_API_KEY = process.env.ASSEMBLY_API_KEY;

app.use(cors());
app.use(express.json());

// Upload video/audio file to AssemblyAI
app.post('/upload', upload.single('audio'), async (req, res) => {
  const filePath = req.file.path;
  try {
    const response = await axios({
      method: 'post',
      url: 'https://api.assemblyai.com/v2/upload',
      headers: {
        authorization: ASSEMBLY_API_KEY,
        'transfer-encoding': 'chunked',
      },
      data: fs.createReadStream(filePath),
    });

    fs.unlinkSync(filePath);
    res.json({ upload_url: response.data.upload_url });
  } catch (err) {
    console.error(err);
    res.status(500).send('Upload failed');
  }
});

// Request transcription
app.post('/transcribe', async (req, res) => {
  const { audio_url } = req.body;
  try {
    const response = await axios.post(
      'https://api.assemblyai.com/v2/transcript',
      { audio_url, punctuate: true, format_text: true },
      {
        headers: {
          authorization: ASSEMBLY_API_KEY,
          'content-type': 'application/json',
        },
      }
    );
    res.json({ transcript_id: response.data.id });
  } catch (err) {
    console.error(err);
    res.status(500).send('Transcription request failed');
  }
});

// Poll transcription
app.get('/transcription/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const response = await axios.get(`https://api.assemblyai.com/v2/transcript/${id}` , {
      headers: { authorization: ASSEMBLY_API_KEY },
    });
    res.json(response.data);
  } catch (err) {
    console.error(err);
    res.status(500).send('Polling failed');
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
