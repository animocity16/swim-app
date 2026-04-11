import { supabase } from "@/lib/supabaseClient";
import type { ParsedSwimResult } from "@/lib/ocrMultiEventParser";

type SaveOCRResult =
  | {
      ok: true;
      swimmer: any;
      swim: any;
      row: ParsedSwimResult;
    }
  | {
      ok: false;
      reason: string;
      row: ParsedSwimResult;
    };

type NormalizedSplit = {
  split_label: string;
  split_order: number;
  split_distance: number | null;
  split_time_ms: number | null;
  cumulative_time_ms: number | null;
};

type InsertSplitRow = {
  swim_time_id: number;
  swimmer_id: number;
  event: string;
  course: "LCM" | "SCM" | "SCY" | "UNKNOWN";
  split_label: string;
  split_order: number;
  split_distance: number | null;
  split_time_ms: number;
  cumulative_time_ms: number | null;
};

function cleanName(name: string) {
  return name.trim().replace(/\s+/g, " ");
}

function normalizeDistanceFromLabel(label?: string | null) {
  if (!label) return null;
  const match = label.match(/\d+/);
  return match ? Number(match[0]) : null;
}

function getEventDistance(event: string): number | null {
  const match = event.match(/\d+/);
  return match ? Number(match[0]) : null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function roughlyEqualMs(a: number, b: number, toleranceMs = 4000) {
  return Math.abs(a - b) <= toleranceMs;
}

function sanitizeAndValidateSplits(
  rawSplits: ParsedSwimResult["splits"] | undefined,
  raceTimeMs: number,
  event: string
): NormalizedSplit[] {
  if (!Array.isArray(rawSplits) || rawSplits.length === 0) return [];

  const eventDistance = getEventDistance(event);

  const normalized: NormalizedSplit[] = rawSplits
    .map((split, index) => {
      const splitLabel =
        typeof split.label === "string" && split.label.trim()
          ? split.label.trim()
          : `Split ${index + 1}`;

      const splitOrder =
        isFiniteNumber(split.order) ? split.order : index + 1;

      const splitDistance =
        isFiniteNumber(split.distance)
          ? split.distance
          : normalizeDistanceFromLabel(splitLabel);

      const splitTimeMs = isFiniteNumber(split.splitMs) ? split.splitMs : null;
      const cumulativeTimeMs = isFiniteNumber(split.cumulativeMs)
        ? split.cumulativeMs
        : null;

      return {
        split_label: splitLabel,
        split_order: splitOrder,
        split_distance: splitDistance,
        split_time_ms: splitTimeMs,
        cumulative_time_ms: cumulativeTimeMs,
      };
    })
    .filter((split) => {
      if (!isFiniteNumber(split.split_distance)) return false;
      if (!isFiniteNumber(split.split_time_ms)) return false;

      // much more forgiving for OCR
      if (split.split_time_ms < 5_000) return false;

      if (split.split_time_ms > raceTimeMs) return false;

      if (
        split.cumulative_time_ms != null &&
        split.cumulative_time_ms > raceTimeMs + 5_000
      ) {
        return false;
      }

      if (eventDistance != null && split.split_distance > eventDistance) {
        return false;
      }

      return true;
    })
    .sort((a, b) => {
      const aDistance = a.split_distance ?? 9999;
      const bDistance = b.split_distance ?? 9999;
      if (aDistance !== bDistance) return aDistance - bDistance;

      const aOrder = a.split_order ?? 9999;
      const bOrder = b.split_order ?? 9999;
      return aOrder - bOrder;
    });

  if (normalized.length === 0) return [];

  const deduped: NormalizedSplit[] = [];
  const seen = new Set<string>();

  for (const split of normalized) {
    const key = `${split.split_distance}|${split.split_time_ms}|${split.cumulative_time_ms ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(split);
  }

  if (deduped.length === 0) return [];

  const repaired: NormalizedSplit[] = [];

  for (let i = 0; i < deduped.length; i++) {
    const current = { ...deduped[i] };

    if (i > 0) {
      const prev = repaired[i - 1];

      if (
        current.cumulative_time_ms != null &&
        prev.cumulative_time_ms != null &&
        current.cumulative_time_ms <= prev.cumulative_time_ms
      ) {
        current.cumulative_time_ms = null;
      }

      if (
        current.split_distance != null &&
        prev.split_distance != null &&
        current.split_distance <= prev.split_distance
      ) {
        continue;
      }
    }

    repaired.push(current);
  }

  if (repaired.length === 0) return [];

  const withDerivedCumulative = repaired.map((split, index) => {
    if (split.cumulative_time_ms != null) return split;

    let running = 0;
    for (let i = 0; i <= index; i++) {
      running += repaired[i].split_time_ms ?? 0;
    }

    return {
      ...split,
      cumulative_time_ms: running > 0 ? running : null,
    };
  });

  const hasFinalDistance =
    eventDistance != null &&
    withDerivedCumulative.some(
      (split) => split.split_distance === eventDistance
    );

  const lastWithCumulative = [...withDerivedCumulative]
    .reverse()
    .find((split) => split.cumulative_time_ms != null);

  const sumOfSplits = withDerivedCumulative.reduce(
    (acc, split) => acc + (split.split_time_ms ?? 0),
    0
  );

  const cumulativeMatches =
    lastWithCumulative?.cumulative_time_ms != null &&
    roughlyEqualMs(lastWithCumulative.cumulative_time_ms, raceTimeMs);

  const sumMatches = roughlyEqualMs(sumOfSplits, raceTimeMs);

  // allow even 1 usable split to survive
  if (withDerivedCumulative.length === 0) {
    return [];
  }

  if (hasFinalDistance || cumulativeMatches || sumMatches) {
    return withDerivedCumulative.map((split, index) => ({
      ...split,
      split_order: index + 1,
    }));
  }

  // fallback: keep believable partial OCR splits
  return withDerivedCumulative.map((split, index) => ({
    ...split,
    split_order: index + 1,
  }));
}

async function findSwimmerByIdOrName(swimmerId: number, swimmerName: string) {
  const { data: byId, error: byIdError } = await supabase
    .from("swimmers")
    .select("*")
    .eq("id", swimmerId)
    .maybeSingle();

  if (byIdError) throw byIdError;
  if (byId) return byId;

  const clean = cleanName(swimmerName);

  const { data: byName, error: byNameError } = await supabase
    .from("swimmers")
    .select("*")
    .ilike("name", clean)
    .limit(1)
    .maybeSingle();

  if (byNameError) throw byNameError;
  if (byName) return byName;

  const { data: created, error: createError } = await supabase
    .from("swimmers")
    .insert({
      name: clean,
    })
    .select()
    .single();

  if (createError) throw createError;

  return created;
}

export async function saveOCRResultsForSwimmer(
  swimmerId: number,
  swimmerName: string,
  rows: ParsedSwimResult[]
): Promise<SaveOCRResult[]> {
  const swimmer = await findSwimmerByIdOrName(swimmerId, swimmerName);
  const output: SaveOCRResult[] = [];

  for (const row of rows) {
    try {
      if (!row.event || row.timeMs == null) {
        output.push({
          ok: false,
          reason: "Missing event or time",
          row,
        });
        continue;
      }

      const insertPayload: {
        swimmer_id: number;
        event: string;
        course: "LCM" | "SCM" | "SCY" | "UNKNOWN";
        time_ms: number;
        swam_at: string | null;
        place?: number | null;
      } = {
        swimmer_id: swimmer.id,
        event: row.event,
        course: row.course,
        time_ms: row.timeMs,
        swam_at: row.swamAt ?? null,
      };

      if (row.place != null) {
        insertPayload.place = row.place;
      }

      const { data: swimTimeRow, error: swimError } = await supabase
        .from("swim_times")
        .insert(insertPayload)
        .select()
        .single();

      if (swimError) {
        output.push({
          ok: false,
          reason: swimError.message,
          row,
        });
        continue;
      }

      const cleanedSplits = sanitizeAndValidateSplits(
        row.splits,
        row.timeMs,
        row.event
      );

      if (cleanedSplits.length > 0) {
        const validSplits: InsertSplitRow[] = cleanedSplits
          .filter(
            (split): split is NormalizedSplit & { split_time_ms: number } =>
              typeof split.split_time_ms === "number" &&
              Number.isFinite(split.split_time_ms)
          )
          .map((split, index): InsertSplitRow => ({
            swim_time_id: swimTimeRow.id,
            swimmer_id: swimmer.id,
            event: row.event,
            course: row.course,
            split_label: split.split_label,
            split_order: index + 1,
            split_distance: split.split_distance,
            split_time_ms: split.split_time_ms,
            cumulative_time_ms: split.cumulative_time_ms ?? null,
          }));

        if (validSplits.length > 0) {
          const { error: splitError } = await supabase
            .from("swim_splits")
            .insert(validSplits);

          if (splitError) {
            output.push({
              ok: false,
              reason: `Swim saved but split save failed: ${splitError.message}`,
              row,
            });
            continue;
          }
        }
      }

      output.push({
        ok: true,
        swimmer,
        swim: swimTimeRow,
        row,
      });
    } catch (error: any) {
      output.push({
        ok: false,
        reason: error?.message || "Unknown save error",
        row,
      });
    }
  }

  return output;
}