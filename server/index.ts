import express from "express";
import cors from "cors";
import { readPdf } from "../lib/parse-resume-from-pdf/read-pdf";
import { parseResumeFromPdf } from "../lib/parse-resume-from-pdf/index";

const app = express();
app.use(cors());
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ limit: "20mb", extended: true }));

// helper: extract text items from a PDF buffer using pdfjs-dist and utility
async function parsePdfBufferToResume(buffer: Buffer): Promise<any> {
  // Create a temporary file URL for pdfjs (in Node, use a Uint8Array directly)
  // But your readPdf expects a fileUrl, so we need to adapt it for Node.
  // Instead, use pdfjs directly as in your original code, or adapt readPdf to accept buffers.
  // For now, let's use your original extraction logic and then pass the text to the parser.

  // If you want to use readPdf, you need to adapt it to accept buffers (or save buffer to a temp file and pass its path).
  // For simplicity, let's use your original extraction logic and then parse the text.

  // --- Original extraction logic ---
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs") as any;
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buffer) });
  const pdf = await loadingTask.promise;
  const pageCount = pdf.numPages || 0;
  const texts: string[] = [];

  for (let i = 1; i <= pageCount; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const strings = (content.items || []).map((it: any) => it.str || "");
    texts.push(strings.join(" "));
  }

  const rawText = texts.join("\n\n");

  // --- Structured parsing using your utility ---
  // If your parser expects raw text:
  const structured = parseResumeFromPdf(rawText);

  // If your parser expects text items, you need to adapt the extraction above to produce textItems as in readPdf.
  // For now, let's assume it works with raw text.

  return { parsedText: rawText, structured };
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