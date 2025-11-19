import express from "express";
import cors from "cors";
import {Buffer} from "buffer";
import path from "path";
import { pathToFileURL } from "url";

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

// New: attempt to load workspace parser and post-process extracted text
async function postProcessText(text: string, fileName?: string): Promise<any> {
  const candidates = [
    // compiled locations
    path.join(process.cwd(), "lib", "parse-resume-from-pdf", "index.js"),
    path.join(process.cwd(), "lib", "parse-resume-from-pdf", "parse-resume-from-pdf.js"),
    path.join(process.cwd(), "lib", "parse-resume-from-pdf", "extract-resume-from-sections.js"),
    // source locations (dev)
    path.join(process.cwd(), "lib", "parse-resume-from-pdf", "index.ts"),
    path.join(process.cwd(), "lib", "parse-resume-from-pdf", "parse-resume-from-pdf.ts"),
    path.join(process.cwd(), "lib", "parse-resume-from-pdf", "extract-resume-from-sections.ts"),
    // package-style require
    "lib/parse-resume-from-pdf",
    "../lib/parse-resume-from-pdf",
  ];

  for (const candidate of candidates) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require(candidate);
      if (!mod) continue;

      const fn =
        mod.parseResumeFromPdf ||
        mod.parseResumeFromText ||
        mod.parseResume ||
        mod.extractResumeFromSections ||
        mod.default;

      if (typeof fn === "function") {
        // try calling with both signatures (text) and (text, { fileName })
        try {
          return await Promise.resolve(fn(text, { fileName }));
        } catch {
          return await Promise.resolve(fn(text));
        }
      }
    } catch {
      // ignore resolution errors, try next candidate
    }
  }

  // no structured parser found — return null to indicate fallback
  return null;
}

// Try to dynamically import a repo-local parseDocx implementation (compiled or source).
async function loadRepoParseDocxModule(): Promise<any | null> {
  const candidates = [
    // dist compiled locations (when running compiled output)
    path.join(process.cwd(), "dist", "resume-parser", "parseDocx.js"),
    path.join(process.cwd(), "dist", "resume-parser", "parseDocx.mjs"),
    path.join(process.cwd(), "dist", "resume-parser", "index.js"),
    // project-root source locations (dev)
    path.join(process.cwd(), "resume-parser", "parseDocx.ts"),
    path.join(process.cwd(), "resume-parser", "parseDocx.js"),
    path.join(process.cwd(), "resume-parser", "index.ts"),
    path.join(process.cwd(), "resume-parser", "index.js"),
    // fallback plain-ish imports (Node may resolve these depending on runtime)
    path.join(process.cwd(), "resume-parser", "parseDocx"),
    path.join(process.cwd(), "resume-parser"),
  ];

  for (const candidate of candidates) {
    try {
      // try loading via file:// URL (works for Node ESM)
      try {
        const url = pathToFileURL(candidate).href;
        // dynamic import must use a specifier the loader understands
        // eslint-disable-next-line no-await-in-loop
        const mod = await import(url);
        if (mod) return mod;
      } catch {
        // try plain dynamic import as last resort
        try {
          // eslint-disable-next-line no-await-in-loop
          const mod = await import(candidate);
          if (mod) return mod;
        } catch {
          // ignore
        }
      }
    } catch {
      // ignore and try next candidate
    }
  }
  return null;
}

// helper: extract text from a DOCX buffer — tries repo parser first, otherwise fallback
async function parseDocxBuffer(buffer: Buffer): Promise<string> {
  // 1) try repo-local parser (if present)
  try {
    const mod = await loadRepoParseDocxModule();
    if (mod) {
      const fn = mod.parseDocxBuffer ?? mod.parseDocx ?? mod.default;
      if (typeof fn === "function") {
        const out = fn(buffer);
        if (out && typeof out.then === "function") {
          return await out;
        }
        return String(out ?? "");
      }
    }
  } catch {
    // fall through to built-in fallback
  }

  // 2) built-in fallback: unzip and extract word/document.xml text
  try {
    const JSZipModule = (await import("jszip")) as any;
    const JSZip = JSZipModule.default ?? JSZipModule;
    const zip = await new JSZip().loadAsync(buffer);

    const docFile = zip.file("word/document.xml");
    if (!docFile) {
      throw new Error("word/document.xml not found inside docx");
    }

    const xml = await docFile.async("text");
    const rawParagraphs = xml.split("</w:p>");
    const paragraphs: string[] = rawParagraphs
      .map((p: string) => {
        const texts: string[] = [];
        const re = /<w:t[^>]*>([^<]*)<\/w:t>/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(p)) !== null) {
          texts.push(m[1]);
        }
        let paragraph = texts.join("");
        paragraph = paragraph.replace(/<w:tab[^>]*\/>/g, "\t").replace(/<w:br[^>]*\/>/g, "\n");
        paragraph = paragraph.replace(/\s+/g, " ").trim();
        return paragraph;
      })
      .map((s: string) => s.trim())
      .filter(Boolean);

    return paragraphs.join("\n\n");
  } catch (err: any) {
    if (err instanceof Error) throw err;
    throw new Error(String(err));
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
        const structured = await postProcessText(text, fileName);
        return res.json({ parsedText: text, structured });
      }

      if (
        lower.includes("word") ||
        fileName.endsWith(".docx") ||
        mimeType ===
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      ) {
        const text = await parseDocxBuffer(buffer);
        const structured = await postProcessText(text, fileName);
        return res.json({ parsedText: text, structured });
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