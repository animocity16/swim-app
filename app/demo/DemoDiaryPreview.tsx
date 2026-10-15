// app/demo/DemoDiaryPreview.tsx
//
// Static, read-only stand-in for the Diary tab inside the demo. The real Diary
// reads and writes training entries in Supabase, so the demo deliberately does
// not render it. This card has no data, no inputs and no network calls.

export default function DemoDiaryPreview({ swimmerName }: { swimmerName: string }) {
  return (
    <div
      className="rounded-3xl p-6 text-center"
      style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" }}
    >
      <p className="mb-3 text-3xl">📓</p>
      <p className="text-sm font-semibold text-white">Training diary</p>
      <p className="mx-auto mt-2 max-w-xs text-xs leading-relaxed text-white/50">
        In Natrix, parents log training swims here: distance, stroke and time. They can then
        see how training sets compare with race results.
      </p>
      <p className="mx-auto mt-3 max-w-xs text-xs leading-relaxed text-white/35">
        The demo doesn&apos;t include sample diary entries for {swimmerName}, who is a fictional swimmer.
      </p>
    </div>
  );
}
