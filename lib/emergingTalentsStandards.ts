import { supabase } from "@/lib/supabaseClient";

// ─── Singapore Aquatics Emerging Talents Championship 2026 ────────────────────
// Short Course (SCM) · Ages 10–12 · Male & Female

const MEET_NAME = "Emerging Talents Championship 2026";
const COURSE = "SCM";

type AgeGroup = 10 | 11 | 12;
type Gender = "Male" | "Female";

type StandardEntry = {
  event: string;
  times: Record<AgeGroup, Record<Gender, string>>;
};

const ETC_STANDARDS: StandardEntry[] = [
  {
    event: "50 Freestyle",
    times: {
      10: { Male: "39.25", Female: "41.53" },
      11: { Male: "38.47", Female: "38.93" },
      12: { Male: "36.37", Female: "35.21" },
    },
  },
  {
    event: "50 Backstroke",
    times: {
      10: { Male: "46.87", Female: "48.48" },
      11: { Male: "44.96", Female: "45.29" },
      12: { Male: "42.66", Female: "42.98" },
    },
  },
  {
    event: "50 Breaststroke",
    times: {
      10: { Male: "51.56", Female: "54.17" },
      11: { Male: "48.94", Female: "50.29" },
      12: { Male: "45.58", Female: "47.75" },
    },
  },
  {
    event: "50 Butterfly",
    times: {
      10: { Male: "43.57", Female: "44.74" },
      11: { Male: "41.76", Female: "41.76" },
      12: { Male: "39.34", Female: "39.97" },
    },
  },
];

function timeToMs(timeStr: string): number {
  const [secs, hundredths] = timeStr.split(".");
  return (
    Number(secs) * 1_000 +
    Number((hundredths ?? "0").padEnd(2, "0").slice(0, 2)) * 10
  );
}

// ─── Check if ETC standard already exists for this user ──────────────────────

export async function etcStandardExists(userId: string): Promise<boolean> {
  const { data } = await supabase
    .from("standard_sets")
    .select("id")
    .eq("user_id", userId)
    .ilike("name", `%${MEET_NAME}%`)
    .limit(1);
  return !!(data && data.length > 0);
}

// ─── Seed ETC standards for a specific age + gender ──────────────────────────

export async function seedETCStandard(
  userId: string,
  age: number,
  gender: Gender
): Promise<{ success: boolean; message: string }> {
  const validAge = [10, 11, 12].includes(age) ? (age as AgeGroup) : null;

  if (!validAge) {
    return {
      success: false,
      message: `No ETC standards available for age ${age} — this meet is for ages 10, 11 and 12 only.`,
    };
  }

  // Create the standard set
  const { data: setData, error: setError } = await supabase
    .from("standard_sets")
    .insert({
      user_id: userId,
      name: MEET_NAME,
      type: "IMPORTANT_MEET",
    })
    .select("id")
    .single();

  if (setError || !setData) {
    return { success: false, message: `Could not create standard set: ${setError?.message}` };
  }

  const setId = setData.id;

  // Insert each event's qualifying time
  const items = ETC_STANDARDS.map((entry) => ({
    standard_set_id: setId,
    user_id: userId,
    event: entry.event,
    course: COURSE,
    qualifying_time_ms: timeToMs(entry.times[validAge][gender]),
    min_age: validAge,
    max_age: validAge,
    gender,
  }));

  const { error: itemsError } = await supabase
    .from("standard_items")
    .insert(items);

  if (itemsError) {
    return { success: false, message: `Could not insert standards: ${itemsError.message}` };
  }

  return {
    success: true,
    message: `✓ ${MEET_NAME} standards loaded for ${gender} age ${validAge}`,
  };
}

// ─── Get the qualifying time for a specific swimmer ───────────────────────────

export function getETCQualifyingTime(
  event: string,
  age: number,
  gender: Gender
): string | null {
  const validAge = [10, 11, 12].includes(age) ? (age as AgeGroup) : null;
  if (!validAge) return null;
  const entry = ETC_STANDARDS.find((e) => e.event === event);
  return entry?.times[validAge][gender] ?? null;
}

// ─── List of events in this meet ─────────────────────────────────────────────

export const ETC_EVENTS = ETC_STANDARDS.map((e) => e.event);
export const ETC_AGE_GROUPS: AgeGroup[] = [10, 11, 12];