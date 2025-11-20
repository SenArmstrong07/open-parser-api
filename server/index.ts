import express from "express";
import cors from "cors";
import fs from "fs/promises";
import path from "path";
import { parseResumeFromPdf } from "../lib/parse-resume-from-pdf/index.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ limit: "20mb", extended: true }));

async function parsePdfBufferToResume(buffer: Buffer): Promise<any> {
  // Save buffer to a temp file
  const tempDir = path.join(process.cwd(), "tmp");
  await fs.mkdir(tempDir, { recursive: true });
  const tempPath = path.join(tempDir, `resume_${Date.now()}.pdf`);
  await fs.writeFile(tempPath, buffer);

  try {
    // Pass file path to parser (it expects a fileUrl)
    const resume = await parseResumeFromPdf(tempPath);
    return { parsedText: null, structured: resume };
  } finally {
    // Clean up temp file
    await fs.unlink(tempPath).catch(() => {});
  }
}

app.post("/api/parse-resume", async (req: any, res: any) => {
  try {
    if (req.body && typeof req.body.base64 === "string") {
      const { fileName = "", mimeType = "", base64 } = req.body;
      const buffer = Buffer.from(base64, "base64");
      const lower = (mimeType || fileName || "").toLowerCase();

      if (lower.includes("pdf") || fileName.endsWith(".pdf") || mimeType === "application/pdf") {
        const result = await parsePdfBufferToResume(buffer);
        return res.json(result);
      }

      if (
        lower.includes("word") ||
        fileName.endsWith(".docx") ||
        mimeType ===
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      ) {
        const text = ""; //await parseDocxBuffer(buffer);
        return res.json({ parsedText: text });
      }

      return res.status(400).json({ error: "Unsupported file type" });
    }

    // 3) Bad request if nothing usable provided
    return res.status(400).json({ error: "Provide resumeData or a base64 file payload" });
  } catch (err: any) {
    return res.status(500).json({ error: String(err && err.message ? err.message : err) });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API running on port ${PORT}`);
});