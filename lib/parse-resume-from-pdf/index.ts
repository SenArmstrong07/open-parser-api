import { readPdf } from "../parse-resume-from-pdf/read-pdf";
import type { TextItem, TextItems } from "./types";
import { groupTextItemsIntoLines } from "./group-text-items-into-lines";
import { groupLinesIntoSections } from "./group-lines-into-sections";
import { extractResumeFromSections } from "./extract-resume-from-sections";

/**
 * Resume parser util that parses a resume from a resume pdf file
 *
 * Note: The parser algorithm only works for single column resume in English language
 */
export const parseResumeFromPdf = async (fileUrl: string) => {
  // Step 1. Read a pdf resume file into text items to prepare for processing
  const textItems = await readPdf(fileUrl);

  // Step 2. Group text items into lines
  const lines = groupTextItemsIntoLines(textItems);

  // Step 3. Group lines into sections
  const sections = groupLinesIntoSections(lines);

  // Step 4. Extract resume from sections
  const resume = extractResumeFromSections(sections);

  return resume;
};

/**
 * Replace parseResumeFromText with a segment-based TextItem synthesizer
 * so the existing pipeline can extract structured info more reliably.
 */
export const parseResumeFromText = async (text: string) => {
  const paragraphs = text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const lineHeight = 14;
  let y = paragraphs.length * lineHeight + 1000;
  const items: TextItems = [];

  const isAllCaps = (s: string) => /[A-Z]/.test(s) && s === s.toUpperCase();
  const looksLikeDate = (s: string) =>
    /\b(?:19|20)\d{2}\b|Present|present|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec/.test(
      s
    );

  for (const para of paragraphs) {
    const lines = para.split(/\n/).map((l) => l.trim()).filter(Boolean);
    for (const line of lines) {
      // primary split: obvious delimiters that often separate company / date / title
      let segments = line
        .split(/(?:\s{2,}|—|–|-{2,}|•|\|)/)
        .map((s) => s.trim())
        .filter(Boolean);

      // if no useful split, try to extract trailing parenthesis date: "Company (Jan 2022 - Present)"
      if (segments.length === 1) {
        const parenDate = line.match(/^(.*?)[\s]*\(([^)]*?(?:\d{4}|Present)[^)]*?)\)\s*$/);
        if (parenDate) {
          segments = [parenDate[1].trim(), parenDate[2].trim()];
        } else {
          // try " at " or " @ " or " at " style separators for job lines
          const atSplit = line.split(/\s+at\s+/i).map((s) => s.trim()).filter(Boolean);
          if (atSplit.length > 1) segments = atSplit;
        }
      }

      // final fallback: split by "·" or comma if line is long and likely composite
      if (segments.length === 1 && line.length > 60) {
        const commaSplit = line.split(",").map((s) => s.trim()).filter(Boolean);
        if (commaSplit.length > 1) segments = commaSplit;
      }

      // synthesize x positions so different segments appear separated
      let x = 0;
      const baseXStep = 10;
      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        // if segment looks like a date, push it to far right to mimic right-aligned dates
        const segIsDate = looksLikeDate(seg);
        const segX = segIsDate ? 400 : x;
        const width = Math.max(10, Math.round(seg.length * 6));
        const fontName =
          isAllCaps(seg) || (i === 0 && isAllCaps(line)) ? "Synthetic-Bold" : "Synthetic-Regular";

        items.push({
          text: seg.replace(/\s+/g, " ").trim(),
          x: segX,
          y,
          width,
          height: 10,
          fontName,
          hasEOL: true,
        });

        // advance x for next run unless date-aligned (keep date on right)
        if (!segIsDate) x += width + baseXStep;
      }

      y -= lineHeight;
    }

    // paragraph gap
    y -= lineHeight * 0.5;
  }

  // reuse pipeline
  const lines = groupTextItemsIntoLines(items);
  const sections = groupLinesIntoSections(lines);
  const resume = extractResumeFromSections(sections);
  return resume;
};
