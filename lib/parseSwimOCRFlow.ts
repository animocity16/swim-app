// ─── parseSwimOCRFlow.ts ──────────────────────────────────────────────────────
// This file re-exports the two public functions that SwimScan.tsx and scan/page
// depend on. The underlying logic lives in ocrMultiEventParser and saveOCRResults.
// ─────────────────────────────────────────────────────────────────────────────

import { parseSwimOCRText } from "@/lib/ocrMultiEventParser";
import { saveOCRResultsForSwimmer } from "@/lib/saveOCRResults";

// ── Types ────────────────────────────────────────────────────────────────────

type ParseAndSaveOptions = {
  swimmerId: number;
  swimmerName: string;
  defaultCourse?: "LCM" | "SCM" | "SCY" | "UNKNOWN";
};

type ParseAndSaveResult = {
  savedCount: number;
  splitSavedCount: number;
  errors: string[];
};

// ── detectMeetType ────────────────────────────────────────────────────────────
// Tags a saved result as NSG, SNAG, or CLUB based on OCR text + optional hint.
// Fully synchronous — no Supabase needed.

export function detectMeetType(rawText: string, hint: string | null): string {
  const combined = ((hint ?? "") + " " + rawText).toLowerCase();
  if (/\bnsg\b|national school games/i.test(combined)) return "NSG";
  if (/\bsnag\b|singapore national age group|national age group/i.test(combined)) return "SNAG";
  return "CLUB";
}

// ── parseAndSaveSwimOCR ───────────────────────────────────────────────────────
// Parses raw OCR text and saves results to Supabase for the given swimmer.
// Returns a summary of what was saved and any errors encountered.

export async function parseAndSaveSwimOCR(
  rawText: string,
  options: ParseAndSaveOptions
): Promise<ParseAndSaveResult> {
  const { swimmerId, swimmerName, defaultCourse = "LCM" } = options;

  const parsed = parseSwimOCRText(rawText, { swimmerName, defaultCourse });

  if (parsed.length === 0) {
    return {
      savedCount: 0,
      splitSavedCount: 0,
      errors: ["No swim results detected in the screenshot."],
    };
  }

  const results = await saveOCRResultsForSwimmer(swimmerId, swimmerName, parsed);

  let savedCount = 0;
  let splitSavedCount = 0;
  const errors: string[] = [];

  for (const result of results) {
    if (result.ok) {
      savedCount++;
      // Count splits if the saved row had any
      const splits = result.row?.splits;
      if (Array.isArray(splits)) {
        splitSavedCount += splits.length;
      }
    } else {
      errors.push(result.reason);
    }
  }

  return { savedCount, splitSavedCount, errors };
}