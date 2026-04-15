import { supabase } from "@/lib/supabaseClient";

// ─── 56th Singapore National Age Group Swimming Championships 2026 ─────────────
// Long Course (LCM) · Ages 7–8, 9, 10, 11, 12, 13–14, 15–17, 18+ · Male & Female

const MEET_NAME = "56th SNAG 2026";
const COURSE = "LCM";

type Gender = "Male" | "Female";

type AgeGroup = "7-8" | "9" | "10" | "11" | "12" | "13-14" | "15-17" | "18+";

type EventRow = {
  event: string;
  male: Record<AgeGroup, string | null>;
  female: Record<AgeGroup, string | null>;
};

// "NA" entries are null — event not available for that age group
const SNAG_DATA: EventRow[] = [
  {
    event: "50 Freestyle",
    male:   { "7-8": "46.68", "9": "42.27", "10": "39.25", "11": "38.47", "12": "36.37", "13-14": "30.64", "15-17": "29.00", "18+": "27.99" },
    female: { "7-8": "50.00", "9": "45.37", "10": "41.53", "11": "38.93", "12": "35.21", "13-14": "33.25", "15-17": "32.33", "18+": "31.58" },
  },
  {
    event: "100 Freestyle",
    male:   { "7-8": "1:45.38", "9": "1:34.14", "10": "1:28.76", "11": "1:24.32", "12": "1:19.59", "13-14": "1:07.07", "15-17": "1:03.24", "18+": "1:00.92" },
    female: { "7-8": "1:54.95", "9": "1:40.38", "10": "1:31.79", "11": "1:25.78", "12": "1:20.59", "13-14": "1:11.86", "15-17": "1:09.63", "18+": "1:07.91" },
  },
  {
    event: "200 Freestyle",
    male:   { "7-8": null, "9": "3:24.50", "10": "3:12.88", "11": "3:03.45", "12": "2:53.28", "13-14": "2:27.03", "15-17": "2:18.84", "18+": "2:14.79" },
    female: { "7-8": null, "9": "3:43.09", "10": "3:21.32", "11": "3:09.55", "12": "2:56.75", "13-14": "2:37.77", "15-17": "2:32.75", "18+": "2:30.65" },
  },
  {
    event: "400 Freestyle",
    male:   { "7-8": null, "9": null, "10": null, "11": "6:26.40", "12": "6:03.77", "13-14": "5:12.42", "15-17": "4:56.61", "18+": "4:52.73" },
    female: { "7-8": null, "9": null, "10": null, "11": "6:44.86", "12": "6:15.53", "13-14": "5:33.12", "15-17": "5:26.51", "18+": "5:23.84" },
  },
  {
    event: "800 Freestyle",
    male:   { "7-8": null, "9": null, "10": null, "11": "12:48.36", "12": "12:48.36", "13-14": "11:24.67", "15-17": "10:26.95", "18+": "10:20.44" },
    female: { "7-8": null, "9": null, "10": null, "11": "12:53.83", "12": "12:53.83", "13-14": "11:33.16", "15-17": "11:22.22", "18+": "11:14.51" },
  },
  {
    event: "1500 Freestyle",
    male:   { "7-8": null, "9": null, "10": null, "11": "23:49.74", "12": "23:49.74", "13-14": "21:23.88", "15-17": "20:02.93", "18+": "19:27.42" },
    female: { "7-8": null, "9": null, "10": null, "11": "23:59.74", "12": "23:59.74", "13-14": "22:58.94", "15-17": "21:54.69", "18+": "21:14.26" },
  },
  {
    event: "50 Backstroke",
    male:   { "7-8": "55.63", "9": "49.50", "10": "46.87", "11": "44.96", "12": "42.66", "13-14": "35.87", "15-17": "33.39", "18+": "32.23" },
    female: { "7-8": "59.18", "9": "53.94", "10": "48.48", "11": "45.29", "12": "42.98", "13-14": "38.21", "15-17": "37.58", "18+": "36.70" },
  },
  {
    event: "100 Backstroke",
    male:   { "7-8": "1:59.65", "9": "1:46.93", "10": "1:41.74", "11": "1:36.84", "12": "1:31.91", "13-14": "1:18.02", "15-17": "1:11.64", "18+": "1:09.62" },
    female: { "7-8": "2:09.80", "9": "1:57.93", "10": "1:45.07", "11": "1:39.32", "12": "1:33.28", "13-14": "1:22.64", "15-17": "1:19.99", "18+": "1:19.48" },
  },
  {
    event: "200 Backstroke",
    male:   { "7-8": null, "9": null, "10": null, "11": "3:30.97", "12": "3:20.06", "13-14": "2:50.62", "15-17": "2:39.85", "18+": "2:35.13" },
    female: { "7-8": null, "9": null, "10": null, "11": "3:35.37", "12": "3:22.17", "13-14": "2:58.81", "15-17": "2:58.53", "18+": "2:55.58" },
  },
  {
    event: "50 Breaststroke",
    male:   { "7-8": "1:01.94", "9": "55.20", "10": "51.56", "11": "48.94", "12": "45.58", "13-14": "38.93", "15-17": "36.09", "18+": "34.85" },
    female: { "7-8": "1:05.59", "9": "59.17", "10": "54.17", "11": "50.29", "12": "47.75", "13-14": "42.50", "15-17": "41.62", "18+": "40.10" },
  },
  {
    event: "100 Breaststroke",
    male:   { "7-8": "2:16.17", "9": "2:01.23", "10": "1:53.66", "11": "1:48.37", "12": "1:40.39", "13-14": "1:25.13", "15-17": "1:19.16", "18+": "1:16.60" },
    female: { "7-8": "2:23.69", "9": "2:09.08", "10": "1:56.30", "11": "1:50.86", "12": "1:43.81", "13-14": "1:32.63", "15-17": "1:29.85", "18+": "1:28.91" },
  },
  {
    event: "200 Breaststroke",
    male:   { "7-8": null, "9": null, "10": null, "11": "3:51.86", "12": "3:34.65", "13-14": "3:04.70", "15-17": "2:53.03", "18+": "2:47.28" },
    female: { "7-8": null, "9": null, "10": null, "11": "3:58.54", "12": "3:44.86", "13-14": "3:20.89", "15-17": "3:14.64", "18+": "3:13.95" },
  },
  {
    event: "50 Butterfly",
    male:   { "7-8": "52.26", "9": "46.07", "10": "43.57", "11": "41.76", "12": "39.34", "13-14": "33.09", "15-17": "31.29", "18+": "29.59" },
    female: { "7-8": "56.78", "9": "49.67", "10": "44.74", "11": "41.76", "12": "39.97", "13-14": "35.45", "15-17": "34.45", "18+": "33.86" },
  },
  {
    event: "100 Butterfly",
    male:   { "7-8": "2:07.00", "9": "1:45.34", "10": "1:38.61", "11": "1:33.57", "12": "1:27.99", "13-14": "1:14.31", "15-17": "1:08.92", "18+": "1:05.69" },
    female: { "7-8": "2:13.78", "9": "1:57.98", "10": "1:46.22", "11": "1:36.55", "12": "1:30.57", "13-14": "1:18.82", "15-17": "1:16.79", "18+": "1:14.87" },
  },
  {
    event: "200 Butterfly",
    male:   { "7-8": null, "9": null, "10": null, "11": "3:35.13", "12": "3:18.79", "13-14": "2:52.26", "15-17": "2:36.68", "18+": "2:32.01" },
    female: { "7-8": null, "9": null, "10": null, "11": "3:47.74", "12": "3:30.89", "13-14": "3:00.47", "15-17": "2:55.06", "18+": "2:53.98" },
  },
  {
    event: "200 IM",
    male:   { "7-8": null, "9": "3:45.53", "10": "3:33.60", "11": "3:25.04", "12": "3:13.81", "13-14": "2:47.89", "15-17": "2:36.64", "18+": "2:33.13" },
    female: { "7-8": null, "9": "4:07.21", "10": "3:44.71", "11": "3:32.24", "12": "3:19.33", "13-14": "2:56.56", "15-17": "2:54.88", "18+": "2:55.01" },
  },
  {
    event: "400 IM",
    male:   { "7-8": null, "9": null, "10": null, "11": "7:22.78", "12": "6:55.18", "13-14": "6:04.17", "15-17": "5:38.50", "18+": "5:25.31" },
    female: { "7-8": null, "9": null, "10": null, "11": "7:26.44", "12": "7:10.74", "13-14": "6:24.21", "15-17": "6:16.92", "18+": "6:09.08" },
  },
];

// Age group → min/max age
const AGE_RANGE: Record<AgeGroup, { min: number; max: number }> = {
  "7-8":  { min: 7,  max: 8 },
  "9":    { min: 9,  max: 9 },
  "10":   { min: 10, max: 10 },
  "11":   { min: 11, max: 11 },
  "12":   { min: 12, max: 12 },
  "13-14":{ min: 13, max: 14 },
  "15-17":{ min: 15, max: 17 },
  "18+":  { min: 18, max: 99 },
};

const AGE_GROUPS: AgeGroup[] = ["7-8", "9", "10", "11", "12", "13-14", "15-17", "18+"];

// ─── Time conversion ──────────────────────────────────────────────────────────

function timeToMs(timeStr: string): number {
  const s = timeStr.trim();
  if (s.includes(":")) {
    const parts = s.split(":");
    if (parts.length === 2) {
      const [min, sec] = parts;
      const [secs, hundredths] = sec.split(".");
      return (
        Number(min) * 60_000 +
        Number(secs) * 1_000 +
        Number((hundredths ?? "0").padEnd(2, "0").slice(0, 2)) * 10
      );
    }
  }
  const [secs, hundredths] = s.split(".");
  return (
    Number(secs) * 1_000 +
    Number((hundredths ?? "0").padEnd(2, "0").slice(0, 2)) * 10
  );
}

// ─── Check if SNAG standard already exists for this user ─────────────────────

export async function snagStandardExists(userId: string): Promise<boolean> {
  const { data } = await supabase
    .from("standard_sets")
    .select("id")
    .eq("user_id", userId)
    .ilike("name", `%SNAG 2026%`)
    .limit(1);
  return !!(data && data.length > 0);
}

// ─── Seed SNAG for a specific age + gender ────────────────────────────────────

export async function seedSNAGStandard(
  userId: string,
  age: number,
  gender: Gender
): Promise<{ success: boolean; message: string }> {
  // Find the matching age group
  const ageGroup = AGE_GROUPS.find((ag) => {
    const range = AGE_RANGE[ag];
    return age >= range.min && age <= range.max;
  });

  if (!ageGroup) {
    return { success: false, message: `No SNAG standards available for age ${age}.` };
  }

  // Create standard set
  const { data: setData, error: setError } = await supabase
    .from("standard_sets")
    .insert({ user_id: userId, name: MEET_NAME, type: "IMPORTANT_MEET" })
    .select("id")
    .single();

  if (setError || !setData) {
    return { success: false, message: `Could not create standard set: ${setError?.message}` };
  }

  const setId = setData.id;
  const range = AGE_RANGE[ageGroup];

  // Build items — skip NA entries
  const items = SNAG_DATA
    .map((row) => {
      const timeStr = gender === "Male" ? row.male[ageGroup] : row.female[ageGroup];
      if (!timeStr) return null;
      return {
        standard_set_id: setId,
        user_id: userId,
        event: row.event,
        course: COURSE,
        qualifying_time_ms: timeToMs(timeStr),
        min_age: range.min,
        max_age: range.max === 99 ? null : range.max,
        gender,
      };
    })
    .filter(Boolean);

  const { error: itemsError } = await supabase.from("standard_items").insert(items);

  if (itemsError) {
    return { success: false, message: `Could not insert standards: ${itemsError.message}` };
  }

  return {
    success: true,
    message: `✓ ${MEET_NAME} standards loaded for ${gender} age group ${ageGroup} (${items.length} events)`,
  };
}

// ─── Get qualifying time for a specific swimmer ───────────────────────────────

export function getSNAGQualifyingTime(
  event: string,
  age: number,
  gender: Gender
): string | null {
  const ageGroup = AGE_GROUPS.find((ag) => {
    const range = AGE_RANGE[ag];
    return age >= range.min && age <= range.max;
  });
  if (!ageGroup) return null;

  const row = SNAG_DATA.find((r) => r.event === event);
  if (!row) return null;

  return gender === "Male" ? row.male[ageGroup] : row.female[ageGroup];
}

export const SNAG_EVENTS = SNAG_DATA.map((r) => r.event);