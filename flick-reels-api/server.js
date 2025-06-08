// server.js - Whisper Subtitle Generator using Replicate

const express = require("express");
const multer = require("multer");
const cors = require("cors");
const axios = require("axios");
const fs = require("fs");
const FormData = require("form-data");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());

const upload = multer({ dest: "uploads/" });

// POST /upload -> Upload video and return local path
app.post("/upload", upload.single("audio"), (req, res) => {
  const filePath = req.file.path;
  res.json({ upload_url: filePath });
});

// POST /transcribe -> Call Replicate Whisper API
app.post("/transcribe", async (req, res) => {
  const { audio_url } = req.body;

  try {
    const form = new FormData();
    form.append("file", fs.createReadStream(audio_url));

    const prediction = await axios.post(
      "https://api.replicate.com/v1/predictions",
      {
        version: "b89ef4f70c63532aaf0b74d07c6c735434b6e6db375774fb074d3dfcbdd9eb3d", // villesau/whisper-timestamped
        input: {
          audio: form.getBuffer().toString("base64"),
          output_format: "words_only"
        }
      },
      {
        headers: {
          Authorization: `Token ${process.env.REPLICATE_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    const predictionId = prediction.data.id;
    res.json({ transcript_id: predictionId });
  } catch (err) {
    console.error("Transcription failed", err);
    res.status(500).json({ error: "Transcription failed" });
  }
});

// GET /transcription/:id -> Poll status
app.get("/transcription/:id", async (req, res) => {
  const id = req.params.id;
  try {
    const response = await axios.get(`https://api.replicate.com/v1/predictions/${id}`, {
      headers: {
        Authorization: `Token ${process.env.REPLICATE_API_KEY}`
      }
    });

    const status = response.data.status;
    if (status === "succeeded") {
      const words = response.data.output.words.map(w => ({
        start: Math.floor(w.start * 1000),
        end: Math.floor(w.end * 1000),
        text: w.text
      }));
      return res.json({ status: "completed", words });
    } else if (status === "failed") {
      return res.json({ status: "error" });
    } else {
      return res.json({ status });
    }
  } catch (e) {
    console.error("Polling error", e);
    return res.status(500).json({ error: "Polling failed" });
  }
});

app.listen(port, () => {
  console.log(`✅ Whisper subtitle server running on port ${port}`);
});
