import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import styles from './page.module.css';

// Server Component — runs at request time, so this page is fully readable
// by Google and shareable as a real link (unlike the client-side /search
// page, which only shows results after someone types). This is what turns
// "search your kid's name" into a growing set of indexable pages, the same
// way swimming-times.com's individual swimmer pages work.

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);

type ResultRow = {
  matched_name: string;
  team_name: string | null;
  match_similarity: number;
  event_name: string;
  finals_time_text: string | null;
  finals_time_ms: number | null;
  meet_name: string | null;
  session_date: string | null;
  event_result_count: number;
};

function slugToQuery(slug: string): string {
  return slug.replace(/-/g, ' ');
}

function toDisplayName(hyTekName: string): string {
  const [last, rest] = hyTekName.split(',').map((s) => s.trim());
  if (!rest) return hyTekName;
  return `${rest} ${last}`;
}

function formatDate(d: string | null) {
  if (!d) return null;
  return new Date(d + 'T00:00:00').toLocaleDateString('en-SG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

async function getSwimmerData(slug: string) {
  const { data, error } = await supabase.rpc('search_public_swimmer', {
    p_query: slugToQuery(slug),
  });

  if (error || !data || data.length === 0) return null;

  const rows = data as ResultRow[];
  // Guard against a low-confidence match landing on a stale/shared link.
  if (rows[0].match_similarity < 0.5) return null;

  const events = Array.from(new Set(rows.map((r) => r.event_name))).map((eventName) => {
    const eventRows = rows.filter((r) => r.event_name === eventName && r.finals_time_ms !== null);
    const pb = [...eventRows].sort((a, b) => (a.finals_time_ms ?? 0) - (b.finals_time_ms ?? 0))[0];
    return { eventName, pb };
  });

  return {
    swimmerName: toDisplayName(rows[0].matched_name),
    team: rows[0].team_name,
    events,
  };
}

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const data = await getSwimmerData(params.slug);
  if (!data) return { title: 'Swimmer not found — Natrix' };

  const title = `${data.swimmerName}'s Swim Results — Natrix`;
  const description = data.team
    ? `${data.swimmerName} (${data.team}) — ${data.events.length} events on record. Real competition results, tracked automatically by Natrix.`
    : `${data.swimmerName} — ${data.events.length} events on record. Real competition results, tracked automatically by Natrix.`;

  return {
    title,
    description,
    openGraph: { title, description },
  };
}

export default async function SwimmerPublicPage({ params }: { params: { slug: string } }) {
  const data = await getSwimmerData(params.slug);
  if (!data) return notFound();

  return (
    <div className={styles.wrap}>
      <Link href="/search" className={styles.backLink}>
        ← Search another swimmer
      </Link>

      <h1 className={styles.h1}>{data.swimmerName}</h1>
      {data.team && <div className={styles.team}>{data.team}</div>}
      <p className={styles.disclaimer}>
        Showing Singapore Aquatics&ndash;sanctioned meets only. Club-only, non-sanctioned meets aren&apos;t included yet.
      </p>

      <div className={styles.eventList}>
        {data.events.map(({ eventName, pb }) => (
          <div key={eventName} className={styles.eventRow}>
            <div className={styles.eventName}>{eventName}</div>
            {pb ? (
              <div className={styles.eventTime}>
                <span className={styles.time}>{pb.finals_time_text}</span>
                <span className={styles.meta}>
                  {pb.meet_name}
                  {formatDate(pb.session_date) && ` · ${formatDate(pb.session_date)}`}
                </span>
              </div>
            ) : (
              <div className={styles.eventMeta}>No time on record</div>
            )}
          </div>
        ))}
      </div>

      <div className={styles.ctaCard}>
        <p className={styles.ctaTitle}>Track {data.swimmerName.split(' ')[0]} with Natrix</p>
        <p className={styles.ctaSub}>Full race history, PB progression and automatic new-result tracking.</p>
        <Link href="/signup" className={styles.ctaButton}>
          Track {data.swimmerName.split(' ')[0]} →
        </Link>
      </div>
    </div>
  );
}
