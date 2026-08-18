import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { slugify } from '@/lib/slug';

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
    <div className="wrap">
      <Link href="/search" className="backLink">
        ← Search another swimmer
      </Link>

      <h1>{data.swimmerName}</h1>
      {data.team && <div className="team">{data.team}</div>}
      <p className="disclaimer">
        Showing Singapore Aquatics&ndash;sanctioned meets only. Club-only, non-sanctioned meets aren&apos;t included yet.
      </p>

      <div className="eventList">
        {data.events.map(({ eventName, pb }) => (
          <div key={eventName} className="eventRow">
            <div className="eventName">{eventName}</div>
            {pb ? (
              <div className="eventTime">
                <span className="time">{pb.finals_time_text}</span>
                <span className="meta">
                  {pb.meet_name}
                  {formatDate(pb.session_date) && ` · ${formatDate(pb.session_date)}`}
                </span>
              </div>
            ) : (
              <div className="eventMeta">No time on record</div>
            )}
          </div>
        ))}
      </div>

      <div className="ctaCard">
        <p className="ctaTitle">Track {data.swimmerName.split(' ')[0]} with Natrix</p>
        <p className="ctaSub">Full race history, PB progression and automatic new-result tracking.</p>
        <Link href="/signup" className="ctaButton">
          Track {data.swimmerName.split(' ')[0]} →
        </Link>
      </div>

      <style jsx>{`
        .wrap {
          max-width: 640px;
          margin: 0 auto;
          padding: 32px 20px 80px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          color: #0f172a;
        }
        .backLink {
          font-size: 13px;
          color: #64748b;
          text-decoration: none;
        }
        h1 {
          font-size: 26px;
          font-weight: 700;
          margin: 16px 0 2px;
          letter-spacing: -0.02em;
        }
        .team {
          color: #64748b;
          font-size: 14px;
          margin-bottom: 4px;
        }
        .disclaimer {
          color: #94a3b8;
          font-size: 11px;
          margin: 0 0 24px;
        }
        .eventList {
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          overflow: hidden;
        }
        .eventRow {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 14px 18px;
          border-bottom: 1px solid #f1f5f9;
          gap: 12px;
        }
        .eventRow:last-child {
          border-bottom: none;
        }
        .eventName {
          font-size: 14px;
          font-weight: 500;
          color: #334155;
        }
        .eventTime {
          text-align: right;
        }
        .time {
          display: block;
          font-size: 16px;
          font-weight: 700;
          font-variant-numeric: tabular-nums;
        }
        .meta {
          display: block;
          font-size: 11px;
          color: #94a3b8;
        }
        .ctaCard {
          margin-top: 28px;
          text-align: center;
          background: linear-gradient(180deg, #f0f9ff 0%, #ffffff 100%);
          border: 1px solid #bae6fd;
          border-radius: 18px;
          padding: 24px;
        }
        .ctaTitle {
          font-weight: 700;
          font-size: 16px;
          margin: 0 0 6px;
        }
        .ctaSub {
          font-size: 13px;
          color: #64748b;
          margin: 0 0 16px;
        }
        .ctaButton {
          display: inline-block;
          background: #0f172a;
          color: white;
          font-weight: 600;
          font-size: 15px;
          padding: 12px 28px;
          border-radius: 12px;
          text-decoration: none;
        }
      `}</style>
    </div>
  );
}
