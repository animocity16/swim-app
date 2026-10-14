'use client';

import { useMemo, useState } from 'react';

/* ------------------------------------------------------------------ */
/*  Training zones from personal bests (PB)                            */
/*  Drop this file in components/ and use: <TrainingZones />           */
/*  Optional: pass starting PBs, e.g.                                  */
/*  <TrainingZones initial200="2:45.00" initial400="5:50.00" />        */
/* ------------------------------------------------------------------ */

type Props = {
  initial200?: string;
  initial400?: string;
  initial100?: string;
};

// "2:45.30" or "65.2" -> seconds. Returns null if it can't be read.
function parseTime(input: string): number | null {
  const s = input.trim();
  if (!s) return null;
  const parts = s.split(':');
  if (parts.length > 2) return null;
  const nums = parts.map(Number);
  if (nums.some((n) => Number.isNaN(n) || n < 0)) return null;
  return parts.length === 2 ? nums[0] * 60 + nums[1] : nums[0];
}

// seconds -> "1:23.4"
function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds - m * 60;
  const sFixed = s.toFixed(1).padStart(4, '0');
  return m > 0 ? `${m}:${sFixed}` : s.toFixed(1);
}

type Zone = {
  key: string;
  name: string;
  purpose: string;
  color: string;
  // Offsets from CSS pace in seconds per 100m (at a reference CSS of 80s/100m)
  slowOffset: number;
  fastOffset: number;
};

const ZONES: Zone[] = [
  { key: 'Z1', name: 'Recovery', purpose: 'Easy swimming, warm-up, cool-down', color: '#7FB7E6', slowOffset: 16, fastOffset: 10 },
  { key: 'Z2', name: 'Aerobic base', purpose: 'Long steady sets, builds endurance', color: '#4CAF8A', slowOffset: 10, fastOffset: 6 },
  { key: 'Z3', name: 'Tempo', purpose: 'Strong but controlled, can talk in short bursts', color: '#8E6CC9', slowOffset: 6, fastOffset: 2 },
  { key: 'Z4', name: 'Threshold (CSS)', purpose: 'Hard, sustainable pace, e.g. 8 x 100', color: '#F28C28', slowOffset: 2, fastOffset: -1 },
  { key: 'Z5', name: 'VO2 / race pace', purpose: 'Short, fast reps with rest', color: '#E5533D', slowOffset: -1, fastOffset: -4 },
];

export default function TrainingZones({
  initial200 = '',
  initial400 = '',
  initial100 = '',
}: Props) {
  const [pb200, setPb200] = useState(initial200);
  const [pb400, setPb400] = useState(initial400);
  const [pb100, setPb100] = useState(initial100);

  const result = useMemo(() => {
    const t200 = parseTime(pb200);
    const t400 = parseTime(pb400);
    const t100 = parseTime(pb100);

    let cssPace: number | null = null; // seconds per 100m
    let method = '';

    if (t200 && t400 && t400 > t200) {
      // Critical Swim Speed: (400 - 200) metres / (T400 - T200) seconds
      const speed = (400 - 200) / (t400 - t200); // m/s
      cssPace = 100 / speed;
      method = 'Calculated from your 200 and 400 PBs (most accurate).';
    } else if (t400) {
      // Estimate: CSS is roughly 3-4% slower than a 400 race pace... in practice a bit faster
      cssPace = (t400 / 4) * 1.02;
      method = 'Estimated from your 400 PB only. Add a 200 PB for better accuracy.';
    } else if (t200) {
      cssPace = (t200 / 2) * 1.06;
      method = 'Estimated from your 200 PB only. Add a 400 PB for better accuracy.';
    } else if (t100) {
      cssPace = t100 * 1.12;
      method = 'Rough estimate from your 100 PB. Add 200 and 400 PBs for better accuracy.';
    }

    if (!cssPace) return null;

    // Bands scale with swimmer speed so slower and younger swimmers get sensible gaps
    const scale = cssPace / 80;

    const zones = ZONES.map((z) => ({
      ...z,
      slow: cssPace! + z.slowOffset * scale,
      fast: cssPace! + z.fastOffset * scale,
    }));

    const sprintBelow = cssPace + -4 * scale;

    return { cssPace, method, zones, sprintBelow, t100 };
  }, [pb200, pb400, pb100]);

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '12px 14px',
    fontSize: 16,
    border: '1px solid #D5E3EE',
    borderRadius: 10,
    fontFamily: 'inherit',
    background: '#fff',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 13,
    fontWeight: 600,
    color: '#34506B',
    marginBottom: 6,
  };

  return (
    <div
      style={{
        fontFamily: 'Montserrat, system-ui, sans-serif',
        maxWidth: 560,
        margin: '0 auto',
        padding: 16,
        color: '#10263B',
      }}
    >
      <h2 style={{ fontSize: 22, margin: '0 0 4px' }}>Training zones</h2>
      <p style={{ margin: '0 0 16px', color: '#5B7388', fontSize: 14 }}>
        Enter your freestyle PBs. Format: 2:45.30 or 65.2
      </p>

      <div style={{ display: 'grid', gap: 12, marginBottom: 20 }}>
        <div>
          <label style={labelStyle}>200m PB</label>
          <input
            style={inputStyle}
            inputMode="decimal"
            placeholder="e.g. 2:45.00"
            value={pb200}
            onChange={(e) => setPb200(e.target.value)}
          />
        </div>
        <div>
          <label style={labelStyle}>400m PB</label>
          <input
            style={inputStyle}
            inputMode="decimal"
            placeholder="e.g. 5:50.00"
            value={pb400}
            onChange={(e) => setPb400(e.target.value)}
          />
        </div>
        <div>
          <label style={labelStyle}>100m PB (optional, used for sprint pace)</label>
          <input
            style={inputStyle}
            inputMode="decimal"
            placeholder="e.g. 1:15.00"
            value={pb100}
            onChange={(e) => setPb100(e.target.value)}
          />
        </div>
      </div>

      {!result && (
        <div
          style={{
            padding: 16,
            borderRadius: 12,
            background: '#EEF6FC',
            color: '#34506B',
            fontSize: 14,
          }}
        >
          Add at least one PB to see your zones. Two PBs (200 and 400) gives the best result.
        </div>
      )}

      {result && (
        <>
          <div
            style={{
              padding: 16,
              borderRadius: 14,
              background: '#EEF6FC',
              marginBottom: 16,
            }}
          >
            <div style={{ fontSize: 13, color: '#5B7388' }}>Threshold pace (CSS)</div>
            <div style={{ fontSize: 32, fontWeight: 700, color: '#F28C28' }}>
              {formatTime(result.cssPace)}
              <span style={{ fontSize: 14, fontWeight: 500, color: '#5B7388' }}> per 100m</span>
            </div>
            <div style={{ fontSize: 12, color: '#5B7388', marginTop: 4 }}>{result.method}</div>
          </div>

          <div style={{ display: 'grid', gap: 10 }}>
            {result.zones.map((z) => (
              <div
                key={z.key}
                style={{
                  display: 'flex',
                  alignItems: 'stretch',
                  background: '#fff',
                  border: '1px solid #E1ECF4',
                  borderRadius: 12,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: 54,
                    background: z.color,
                    color: '#fff',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {z.key}
                </div>
                <div style={{ padding: '10px 14px', flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <strong style={{ fontSize: 15 }}>{z.name}</strong>
                    <span style={{ fontWeight: 700, fontSize: 15 }}>
                      {formatTime(z.fast)} – {formatTime(z.slow)}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: '#5B7388', marginTop: 2 }}>
                    {z.purpose} (per 100m)
                  </div>
                </div>
              </div>
            ))}

            <div
              style={{
                display: 'flex',
                alignItems: 'stretch',
                background: '#fff',
                border: '1px solid #E1ECF4',
                borderRadius: 12,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: 54,
                  background: '#10263B',
                  color: '#fff',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                Z6
              </div>
              <div style={{ padding: '10px 14px', flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <strong style={{ fontSize: 15 }}>Sprint</strong>
                  <span style={{ fontWeight: 700, fontSize: 15 }}>
                    {result.t100
                      ? `${formatTime(result.t100)} or faster`
                      : `faster than ${formatTime(result.sprintBelow)}`}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: '#5B7388', marginTop: 2 }}>
                  Max effort, short reps with long rest (per 100m pace)
                </div>
              </div>
            </div>
          </div>

          <p style={{ fontSize: 12, color: '#7D93A5', marginTop: 16 }}>
            Zones are a guide based on common coaching conventions. Use PBs from the last 6 to 8
            weeks, and re-test regularly as times improve.
          </p>
        </>
      )}
    </div>
  );
}
