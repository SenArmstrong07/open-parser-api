import { readPdf } from "../parse-resume-from-pdf/read-pdf";
import type { TextItem, TextItems } from "./types";
import { groupTextItemsIntoLines } from "./group-text-items-into-lines";
import { groupLinesIntoSections } from "./group-lines-into-sections";
import { extractResumeFromSections } from "./extract-resume-from-sections";
import { extractProfile } from "./extract-resume-from-sections/extract-profile";
import { getSectionLinesByKeywords } from "./extract-resume-from-sections/lib/get-section-lines";
import { getBulletPointsFromLines } from "./extract-resume-from-sections/lib/bullet-points";

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

  // enhance using profile extraction + heuristics
  return enhanceResumeWithProfile(sections, resume);
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
  return enhanceResumeWithProfile(sections, resume);
};

// New helper: enhance a parsed resume using profile extraction + simple heuristics
export const enhanceResumeWithProfile = (
  sections: Record<string, TextItem[][]>,
  resume: any
) => {
  try {
    const { profile: extractedProfile } = extractProfile(sections);

    resume.profile = resume.profile || {};
    // Merge basic profile fields if missing on resume
    resume.profile.name = resume.profile.name || extractedProfile.name || "";
    resume.profile.email = resume.profile.email || extractedProfile.email || "";
    resume.profile.phone = resume.profile.phone || extractedProfile.phone || "";
    resume.profile.url = resume.profile.url || extractedProfile.url || "";
    resume.profile.location =
      resume.profile.location || extractedProfile.location || "";
    resume.profile.summary =
      resume.profile.summary || extractedProfile.summary || "";

    // Gather all text strings from sections
    // Object.values(sections) has a loose type; explicitly narrow to TextItem[]
    // Explicitly flatten sections into a typed TextItem[] so TS knows element type
    const flattenedTextItems: TextItem[] = [];
    for (const lines of Object.values(sections)) {
      for (const line of lines) {
        for (const ti of line) {
          flattenedTextItems.push(ti);
        }
      }
    }
    const allTextItems = flattenedTextItems.map((ti) => ti.text || "").join(" | ");

    // --- robust email/phone/address fallbacks ---
    if (!resume.profile.email) {
      const emailMatch = allTextItems.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i);
      if (emailMatch) resume.profile.email = emailMatch[0];
    }

    if (!resume.profile.phone) {
      const phoneMatch = allTextItems.match(/(\+?\d{1,3}[\s-]?)?\(?\d{2,4}\)?[\s-]?\d{3,4}[\s-]?\d{3,4}/);
      if (phoneMatch) resume.profile.phone = phoneMatch[0].replace(/\s{2,}/g,' ').trim();
    }

    // Address: check contact section first, then general text
    if (!resume.profile.location) {
      const contactLines = getSectionLinesByKeywords(sections, ["contact", "address"]);
      let addrCandidates: string[] = [];
      if (contactLines.length) {
        addrCandidates = contactLines.flat().map((ti) => ti.text || "").filter(Boolean);
      } else {
        addrCandidates = flattenedTextItems.map((ti) => ti.text || "").filter(Boolean);
      }
      const addrLine = addrCandidates.find((t: string) =>
        /\d{1,5}\s+\w+.*(Street|St\.|Avenue|Ave|Road|Rd\.|Lane|Ln\.|Boulevard|Blvd|Dr|Brgy\.|Barangay|City\.)/i.test(t) ||
        /[A-Z][a-zA-Z\s]+,\s*[A-Z][a-zA-Z\s]+/.test(t) ||
        /\bBrgy\b|\bBarangay\b/i.test(t)
      );
      if (addrLine) resume.profile.location = addrLine.trim();
    }

    // Age heuristics (unchanged)
    const ageMatch =
      allTextItems.match(/\bAge[:\s]*([0-9]{1,3})\b/i) ||
      allTextItems.match(/\b([0-9]{1,3})\s+years?\s+old\b/i);
    if (ageMatch && ageMatch[1]) {
      const ageText = `Age: ${ageMatch[1]}`;
      if (!resume.profile.summary || resume.profile.summary.trim() === "") {
        resume.profile.summary = ageText;
      } else if (!resume.profile.summary.includes(ageText)) {
        resume.profile.summary = `${resume.profile.summary} • ${ageText}`;
      }
    }

    // --- Name fallback: look at top profile lines (1..3) for a plausible name ---
    if (!resume.profile.name || !resume.profile.name.trim()) {
      const profileLines = (sections.profile || []).slice(0, 3).flat().map((ti) => ti.text.trim());
      for (const line of profileLines) {
        // candidate: title case, <=4 words, contains letters (allow initials)
        if (/^[A-Za-z][A-Za-z\.\s'-]{1,60}$/.test(line) && line.split(/\s+/).length <= 5) {
          // avoid picking "About Me" or section keywords
          if (!/^(About|Contact|Education|Technical|Skills|Summary|Objective)$/i.test(line)) {
            resume.profile.name = line;
            break;
          }
        }
      }
    }

    // --- Skills fallback: if skills empty, look for 'technical'/'about' sections and extract bullets ---
    const skillsEmpty = !resume.skills || (Array.isArray(resume.skills.descriptions) && resume.skills.descriptions.filter(Boolean).length === 0);
    if (skillsEmpty) {
      const skillLines = getSectionLinesByKeywords(sections, ["technical", "skill", "about", "skills"]);
      if (skillLines && skillLines.length) {
        const bullets = getBulletPointsFromLines(skillLines);
        if (bullets && bullets.length) {
          resume.skills = resume.skills || { featuredSkills: [], descriptions: [] };
          // merge unique
          const merged = [...new Set([...(resume.skills.descriptions || []), ...bullets.map((b) => b.replace(/\s+/g,' ').trim())])];
          resume.skills.descriptions = merged;
        }
      }
    }

    // final normalization: trim strings
    if (resume.profile) {
      for (const k of ["name", "email", "phone", "location", "url", "summary"]) {
        if (typeof resume.profile[k] === "string") resume.profile[k] = resume.profile[k].trim();
      }
    }
  } catch (err) {
    console.error("enhanceResumeWithProfile failed:", err);
  }
  return resume;
};
