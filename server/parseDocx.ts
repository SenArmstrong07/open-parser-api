import type { Buffer } from "buffer";
import type { TextItem } from "../lib/parse-resume-from-pdf/types";
import { groupTextItemsIntoLines } from "../lib/parse-resume-from-pdf/group-text-items-into-lines";
import { groupLinesIntoSections } from "../lib/parse-resume-from-pdf/group-lines-into-sections";
import { extractResumeFromSections } from "../lib/parse-resume-from-pdf/extract-resume-from-sections";

export async function parseDocxBuffer(buffer: Buffer): Promise<string> {
  // dynamic import so TypeScript/tsc doesn't fail if dependency missing at compile time
  const JSZipModule = (await import("jszip")) as any;
  const JSZip = JSZipModule.default ?? JSZipModule;
  const zip = await new JSZip().loadAsync(buffer);

  // main document path inside .docx
  const docFile = zip.file("word/document.xml");
  if (!docFile) {
    throw new Error("word/document.xml not found inside docx");
  }

  const xml = await docFile.async("text");

  // Split into paragraph chunks using closing paragraph tag
  const rawParagraphs = xml.split("</w:p>");

  const paragraphs: string[] = rawParagraphs
    .map((p: string) => {
      // extract all text nodes <w:t>...</w:t> inside the paragraph
      const texts: string[] = [];
      const re = /<w:t[^>]*>([^<]*)<\/w:t>/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(p)) !== null) {
        texts.push(m[1]);
      }
      // also handle tabs and breaks represented by <w:tab/> and <w:br/>
      let paragraph = texts.join("");
      paragraph = paragraph.replace(/<w:tab[^>]*\/>/g, "\t").replace(/<w:br[^>]*\/>/g, "\n");
      // collapse whitespace and trim
      paragraph = paragraph.replace(/\s+/g, " ").trim();
      return paragraph;
    })
    .map((s: string) => s.trim())
    .filter(Boolean);

  // Join paragraphs with double newline (similar to PDF page separation)
  return paragraphs.join("\n\n");
}

// New: produce structured resume by synthesizing TextItems from DOCX runs
export async function parseDocxToStructured(buffer: Buffer): Promise<{ parsedText: string; structured: any }> {
  const JSZipModule = (await import("jszip")) as any;
  const JSZip = JSZipModule.default ?? JSZipModule;
  const zip = await new JSZip().loadAsync(buffer);

  const docFile = zip.file("word/document.xml");
  if (!docFile) throw new Error("word/document.xml not found inside docx");
  const xml = await docFile.async("text");

  // Split into paragraphs
  const rawParagraphs = xml.split("</w:p>");
  const paragraphs: string[] = [];
  const items: TextItem[] = [];

  // Synthetic layout settings
  const lineHeight = 14;
  let y = rawParagraphs.length * lineHeight + 1000;
  const baseXStep = 10;

  for (const p of rawParagraphs) {
    // collect runs (<w:r>...</w:r>) inside paragraph
    const runRe = /<w:r[^>]*>([\s\S]*?)<\/w:r>/g;
    let runMatch: RegExpExecArray | null;
    const runs: { text: string; bold: boolean }[] = [];

    while ((runMatch = runRe.exec(p)) !== null) {
      const runXml = runMatch[1];
      // detect bold: <w:b/> or <w:b>...</w:b>
      const bold = /<w:b(?:[^>]*)\/?>/.test(runXml);
      // extract text nodes <w:t>...</w:t>
      const tRe = /<w:t[^>]*>([^<]*)<\/w:t>/g;
      let tMatch: RegExpExecArray | null;
      let runText = "";
      while ((tMatch = tRe.exec(runXml)) !== null) {
        runText += tMatch[1] ?? "";
      }
      if (runText.trim() !== "") runs.push({ text: runText, bold });
    }

    // fallback: if no runs matched, try direct <w:t> in paragraph
    if (runs.length === 0) {
      const tRe = /<w:t[^>]*>([^<]*)<\/w:t>/g;
      let tMatch: RegExpExecArray | null;
      let runText = "";
      while ((tMatch = tRe.exec(p)) !== null) runText += tMatch[1] ?? "";
      if (runText.trim() !== "") runs.push({ text: runText, bold: false });
    }

    const paragraphText = runs.map((r) => r.text).join("");
    if (paragraphText.trim()) paragraphs.push(paragraphText.trim());

    // synthesize one TextItem per run (keeps ordering and boldness)
    let x = 0;
    for (const r of runs) {
      const width = Math.max(10, Math.round(r.text.length * 6));
      const fontName = r.bold ? "Synthetic-Bold" : "Synthetic-Regular";
      items.push({
        text: r.text.replace(/\s+/g, " ").trim(),
        x,
        y,
        width,
        height: 10,
        fontName,
        hasEOL: true,
      });
      x += width + baseXStep;
    }

    // move down a line for next paragraph
    y -= lineHeight * Math.max(1, Math.ceil((paragraphText.split("\n").length)));
  }

  const parsedText = paragraphs.join("\n\n");

  // reuse existing pipeline to build structured resume
  const lines = groupTextItemsIntoLines(items);
  const sections = groupLinesIntoSections(lines);
  const structured = extractResumeFromSections(sections);

  return { parsedText, structured };
}