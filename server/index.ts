import express from "express";
import cors from "cors";
import {Buffer} from "buffer";
import { parseDocxBuffer } from "../resume-parser/parseDocx";

const app = express();
app.use(cors());
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ limit: "20mb", extended: true }));


// helper: extract text from a PDF buffer using pdfjs-dist
async function parsePdfBuffer(buffer: Buffer): Promise<string> {
  try {
    // dynamically import the pdfjs module in an ESM-friendly way
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

    return texts.join("\n\n");
  } catch (err) {
    if (err instanceof Error) {
      throw new Error("PDF parsing failed: " + err.message);
    }
    else
    {
      throw new Error("PDF parsing failed:" + String(err));
    }
  }
}

app.post("/api/parse-resume", async (req: any, res: any) => {
  try {
    // 1) If client sent plain resumeData text, keep echo/placeholder behavior
    if (req.body && typeof req.body.resumeData === "string") {
      const { resumeData } = req.body;
      // TODO: plug into your structured parser if you have one
      return res.json({ parsed: resumeData });
    }

    // 2) If client sent a base64 file payload:
    // { fileName: "foo.pdf", mimeType: "application/pdf", base64: "..." }
    if (req.body && typeof req.body.base64 === "string") {
      const { fileName = "", mimeType = "", base64 } = req.body;
      const buffer = Buffer.from(base64, "base64");
      const lower = (mimeType || fileName || "").toLowerCase();

      if (lower.includes("pdf") || fileName.endsWith(".pdf") || mimeType === "application/pdf") {
        const text = await parsePdfBuffer(buffer);
        // TODO: optionally call your higher-level resume extraction routine here
        return res.json({ parsedText: text });
      }

      if (
        lower.includes("word") ||
        fileName.endsWith(".docx") ||
        mimeType ===
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      ) {
        const text = await parseDocxBuffer(buffer);
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