export type ParsedSplit = {
  distance: number;
  stroke: "FLY" | "BACK" | "BREAST" | "FREE";
  splitIndex: number;
  cumulativeMs: number;
  splitMs: number;
  displayCumulative: string;
  displaySplit: string;
};

function timeToMs(raw: string): number | null {
  const value = raw.trim().replace(/[^\d:.]/g, "");
  if (!value) return null;

  if (value.includes(":")) {
    const [minPart, secPart] = value.split(":");
    const mins = Number(minPart);
    const secs = Number(secPart);
    if (Number.isNaN(mins) || Number.isNaN(secs)) return null;
    return Math.round((mins * 60 + secs) * 1000);
  }

  const secs = Number(value);
  if (Number.isNaN(secs)) return null;
  return Math.round(secs * 1000);
}

function msToTime(ms: number): string {
  const totalSeconds = ms / 1000;
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;

  if (mins > 0) {
    return `${mins}:${secs.toFixed(2).padStart(5, "0")}`;
  }

  return secs.toFixed(2);
}

function cleanOCRTime(token: string): string {
  let t = token.trim();
  t = t.replace(/O/g, "0");
  t = t.replace(/,/g, ".");
  t = t.replace(/\s+/g, "");
  t = t.replace(/(\d)(\d{2})$/, "$1.$2");
  t = t.replace(/(\d+):(\d{2})(\d{2})$/, "$1:$2.$3");
  return t;
}

function extractTimeTokens(text: string): string[] {
  const cleaned = text
    .replace(/\r/g, "\n")
    .replace(/[|]/g, " ")
    .replace(/\t/g, " ");

  const matches =
    cleaned.match(/\b\d{1,2}:\d{2}\.?\d{0,2}\b|\b\d{1,2}\.?\d{2}\b|\b\d{4,5}\b/g) || [];

  return matches.map(cleanOCRTime);
}

function getStrokeForSplit(index: number): "FLY" | "BACK" | "BREAST" | "FREE" {
  if (index <= 2) return "FLY";
  if (index === 3) return "BACK";
  if (index === 4) return "BREAST";
  return "FREE";
}

export function parse200IMSplitsFromText(text: string): ParsedSplit[] {
  const tokens = extractTimeTokens(text);

  const cumulativeTimes: number[] = [];
  for (const token of tokens) {
    const ms = timeToMs(token);
    if (ms !== null) cumulativeTimes.push(ms);
  }

  const firstFive = cumulativeTimes.slice(0, 5);
  if (firstFive.length < 5) return [];

  const result: ParsedSplit[] = [];
  let previous = 0;

  for (let i = 0; i < firstFive.length; i++) {
    const cumulativeMs = firstFive[i];
    const splitMs = cumulativeMs - previous;

    if (splitMs <= 0) return [];

    const splitIndex = i + 1;
    const distance = splitIndex === 5 ? 200 : splitIndex * 50;
    const stroke = getStrokeForSplit(splitIndex);

    result.push({
      distance,
      stroke,
      splitIndex,
      cumulativeMs,
      splitMs,
      displayCumulative: msToTime(cumulativeMs),
      displaySplit: msToTime(splitMs),
    });

    previous = cumulativeMs;
  }

  return result;
}