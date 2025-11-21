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
 * Convert plain text (paragraphs / newlines) into synthetic TextItems and
 * reuse existing pipeline to extract structured resume data.
 */
export const parseResumeFromText = async (text: string) => {
  // Normalize and split into paragraphs -> lines
  const paragraphs = text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const lineHeight = 14; // pt-ish spacing used as synthetic y increment
  let y = paragraphs.length * lineHeight + 1000; // start high so ordering resembles PDF (descending y)

  const items: TextItems = [];

  for (const para of paragraphs) {
    const lines = para.split(/\n/).map((l) => l.trim()).filter(Boolean);
    for (const line of lines) {
      // synthetic TextItem
      const item: TextItem = {
        text: line,
        x: 0,
        y: y,
        width: Math.max(10, line.length * 6), // rough width
        height: 10,
        fontName: "Synthetic-Regular",
        hasEOL: true,
      };
      items.push(item);
      y -= lineHeight;
    }
    // add small gap between paragraphs (keeps paragraph boundaries)
    y -= lineHeight * 0.5;
  }

  // reuse existing pipeline
  const lines = groupTextItemsIntoLines(items);
  const sections = groupLinesIntoSections(lines);
  const resume = extractResumeFromSections(sections);
  return resume;
};
