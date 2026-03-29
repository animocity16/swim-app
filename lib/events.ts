export function canonicalEventName(input: string) {
  const raw = input.trim().toLowerCase().replace(/\s+/g, " ");

  const match = raw.match(/^(\d+)\s*(.*)$/);
  if (!match) return input.trim();

  const distance = match[1];
  let stroke = match[2].trim();

  if (["free", "freestyle", "fr"].includes(stroke)) {
    stroke = "Free";
  } else if (["fly", "butterfly", "fl"].includes(stroke)) {
    stroke = "Fly";
  } else if (["back", "backstroke", "bk"].includes(stroke)) {
    stroke = "Back";
  } else if (["breast", "breaststroke", "br"].includes(stroke)) {
    stroke = "Breast";
  } else if (["im", "individual medley"].includes(stroke)) {
    stroke = "IM";
  } else {
    return input.trim();
  }

  return `${distance} ${stroke}`;
}

export function canonicalCourse(input: string) {
  const raw = input.trim().toUpperCase();

  if (raw === "50M") return "LCM";
  if (raw === "25M") return "SCM";
  if (raw === "LONG COURSE") return "LCM";
  if (raw === "SHORT COURSE") return "SCM";

  return raw;
}

export function eventKey(event: string, course: string) {
  return `${canonicalEventName(event).toLowerCase()}|${canonicalCourse(course)}`;
}