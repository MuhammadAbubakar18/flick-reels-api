const express = require("express");
const multer = require("multer");
const fs = require("fs");
const axios = require("axios");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ dest: "uploads/" });

const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN; // already added in Render

// --- 1. Upload Endpoint ---
app.post("/upload", upload.single("audio"), async (req, res) => {
  try {
    const filePath = req.file.path;

    // Upload file to Replicate via their CDN
    const fileData = fs.readFileSync(filePath);
    const uploadRes = await axios.post(
      "https://dreambooth-api-experimental.replicate.com/v1/upload",
      fileData,
      {
        headers: {
          Authorization: `Token ${REPLICATE_API_TOKEN}`,
          "Content-Type": "application/octet-stream",
        },
        params: {
          filename: req.file.originalname,
        },
      }
    );

    fs.unlinkSync(filePath); // Delete local file
    return res.json({ upload_url: uploadRes.data.upload_url });
  } catch (err) {
    console.error("Upload Error:", err.message);
    return res.status(500).json({ error: "Failed to upload file" });
  }
});

// --- 2. Transcribe Endpoint ---
app.post("/transcribe", async (req, res) => {
  const { audio_url } = req.body;

  try {
    const response = await axios.post(
      "https://api.replicate.com/v1/predictions",
      {
        version: "d2e072d33b6094b3e13e5c99f15c8f2b168740b87acb9b3fdfb7c2c347d6c7b0", // Whisper model
        input: {
          audio: audio_url,
          task: "transcribe",
        },
      },
      {
        headers: {
          Authorization: `Token ${REPLICATE_API_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    return res.json({ transcript_id: response.data.id });
  } catch (err) {
    console.error("Transcription Start Error:", err.response?.data || err.message);
    return res.status(500).json({ error: "Failed to start transcription" });
  }
});

// --- 3. Poll Endpoint ---
app.get("/transcription/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const pollRes = await axios.get(`https://api.replicate.com/v1/predictions/${id}`, {
      headers: {
        Authorization: `Token ${REPLICATE_API_TOKEN}`,
      },
    });

    const status = pollRes.data.status;

    if (status === "succeeded") {
      const output = pollRes.data.output;
      const segments = output.segments || [];

      const words = segments.map((seg) => ({
        start: Math.floor(seg.start * 1000),
        end: Math.floor(seg.end * 1000),
        text: seg.text.trim(),
      }));

      return res.json({ status: "completed", words });
    } else if (status === "failed") {
      console.error("Replicate failed:", pollRes.data.error);
      return res.json({ status: "error", message: pollRes.data.error });
    } else {
      return res.json({ status }); // still processing
    }
  } catch (err) {
    console.error("Polling Error:", err.message);
    return res.status(500).json({ error: "Failed to fetch transcription status" });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
