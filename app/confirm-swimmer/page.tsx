'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

type Candidate = {
  matched_name: string;
  team_name: string | null;
  best_similarity: number;
  club_match: boolean | null;
  result_count: number;
};

function toDisplayName(hyTekName: string): string {
  const [last, rest] = hyTekName.split(',').map((s) => s.trim());
  if (!rest) return hyTekName;
  return `${rest} ${last}`;
}

export default function ConfirmSwimmerPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const swimmerId = searchParams.get('swimmer_id');

  const [loading, setLoading] = useState(true);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [actingOn, setActingOn] = useState<string | null>(null);
  const [confirmedName, setConfirmedName] = useState<string | null>(null);

  useEffect(() => {
    if (!swimmerId) {
      setError('Missing swimmer. Go back and add your swimmer first.');
      setLoading(false);
      return;
    }
    loadCandidates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [swimmerId]);

  async function loadCandidates() {
    setLoading(true);
    const { data, error } = await supabase.rpc('get_pending_swimmer_matches', {
      p_swimmer_id: Number(swimmerId),
    });
    if (error) {
      setError("We couldn't check for matches right now. You can still use the app — try again later from your swimmer's profile.");
    } else {
      setCandidates((data || []) as Candidate[]);
    }
    setLoading(false);
  }

  async function handleAction(matchedName: string, action: 'confirm' | 'reject') {
    setActingOn(matchedName);
    const { error } = await supabase.rpc('confirm_swimmer_match', {
      p_swimmer_id: Number(swimmerId),
      p_matched_name: matchedName,
      p_action: action,
    });
    setActingOn(null);

    if (error) {
      setError('Something went wrong saving that. Try again.');
      return;
    }

    if (action === 'confirm') {
      setConfirmedName(matchedName);
    } else {
      setCandidates((prev) => prev.filter((c) => c.matched_name !== matchedName));
    }
  }

  if (loading) {
    return (
      <div className="wrap">
        <p className="statusMsg">Checking meet records for matches…</p>
        <style jsx>{styles}</style>
      </div>
    );
  }

  if (confirmedName) {
    return (
      <div className="wrap">
        <div className="successIcon">✓</div>
        <h1 className="center">You&apos;re all set</h1>
        <p className="sub center">
          {toDisplayName(confirmedName)}&apos;s full history is now in your account. You&apos;ll get notified automatically
          when new results come in.
        </p>
        <button className="ctaButton" onClick={() => router.push('/dashboard')}>
          Go to dashboard
        </button>
        <style jsx>{styles}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div className="wrap">
        <p className="statusMsg">{error}</p>
        <button className="ctaButton" onClick={() => router.push('/dashboard')}>
          Continue to dashboard
        </button>
        <style jsx>{styles}</style>
      </div>
    );
  }

  if (candidates.length === 0) {
    return (
      <div className="wrap">
        <h1>No matches found yet</h1>
        <p className="sub">
          We couldn&apos;t find this swimmer in our meet records yet. That&apos;s fine — as soon as a matching result gets
          scraped in, we&apos;ll suggest it to you automatically.
        </p>
        <button className="ctaButton" onClick={() => router.push('/dashboard')}>
          Continue to dashboard
        </button>
        <style jsx>{styles}</style>
      </div>
    );
  }

  return (
    <div className="wrap">
      <h1>Is this your swimmer?</h1>
      <p className="sub">
        We found {candidates.length === 1 ? 'this swimmer' : 'these swimmers'} in our meet records. Confirm to link their
        results to your account.
      </p>

      {candidates.map((c) => (
        <div key={c.matched_name} className="matchCard">
          <div className="name">{toDisplayName(c.matched_name)}</div>
          {c.team_name && <div className="meta">{c.team_name}</div>}
          <div className="statLine">
            {c.result_count} result{c.result_count === 1 ? '' : 's'} found
            {c.club_match ? ' · club matches' : ''}
          </div>
          <div className="btnRow">
            <button
              className="btnNo"
              disabled={actingOn === c.matched_name}
              onClick={() => handleAction(c.matched_name, 'reject')}
            >
              Not them
            </button>
            <button
              className="btnYes"
              disabled={actingOn === c.matched_name}
              onClick={() => handleAction(c.matched_name, 'confirm')}
            >
              {actingOn === c.matched_name ? 'Saving…' : "Yes, that's them"}
            </button>
          </div>
        </div>
      ))}

      <style jsx>{styles}</style>
    </div>
  );
}

const styles = `
  .wrap {
    max-width: 480px;
    margin: 0 auto;
    padding: 48px 20px 80px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    color: #0f172a;
  }
  h1 { font-size: 24px; font-weight: 700; margin: 0 0 8px; letter-spacing: -0.02em; }
  h1.center { text-align: center; }
  .sub { color: #64748b; font-size: 14px; margin: 0 0 24px; line-height: 1.5; }
  .sub.center { text-align: center; }
  .statusMsg { text-align: center; color: #64748b; font-size: 15px; }
  .matchCard {
    border: 2px solid #0ea5e9; border-radius: 18px; padding: 20px; background: #f0f9ff; margin-bottom: 16px;
  }
  .matchCard .name { font-size: 18px; font-weight: 700; margin: 0 0 2px; }
  .matchCard .meta { font-size: 13px; color: #64748b; margin-bottom: 10px; }
  .matchCard .statLine { font-size: 13px; color: #0369a1; font-weight: 600; }
  .btnRow { display: flex; gap: 10px; margin-top: 18px; }
  .btnRow button { flex: 1; padding: 13px; border-radius: 12px; font-weight: 600; font-size: 14px; cursor: pointer; border: none; }
  .btnRow button:disabled { opacity: 0.6; cursor: default; }
  .btnYes { background: #0f172a; color: white; }
  .btnNo { background: white; color: #64748b; border: 1px solid #e2e8f0 !important; }
  .successIcon {
    width: 56px; height: 56px; border-radius: 50%; background: #dcfce7; color: #16a34a;
    display: flex; align-items: center; justify-content: center; font-size: 28px; margin: 0 auto 16px;
  }
  .ctaButton {
    display: block; width: 100%; background: #0f172a; color: white; font-weight: 600; font-size: 15px;
    padding: 14px; border-radius: 12px; border: none; cursor: pointer; margin-top: 8px; text-align: center;
  }
`;
