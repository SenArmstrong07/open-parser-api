import type { Buffer } from "buffer";

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