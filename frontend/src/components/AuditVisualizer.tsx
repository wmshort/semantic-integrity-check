import { useMemo, useState } from 'react';
import { ShieldCheck, ShieldAlert, Cpu, Gauge } from 'lucide-react';
import type { DivergenceFinding, EvaluateResponse } from '../lib/types';
import { severityColor, severityLabel } from '../lib/modules';

interface Props {
  referenceText: string;
  responseText: string;
  result: EvaluateResponse | null;
}

// ---------------------------------------------------------------------------
// Radial risk gauge (1-100)
// ---------------------------------------------------------------------------
function RiskGauge({ score }: { score: number }) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.min(100, Math.max(1, score)) / 100;
  const dash = circumference * pct;
  const color =
    score >= 70 ? '#ef4444' : score >= 40 ? '#f59e0b' : score >= 20 ? '#84cc16' : '#22c55e';

  return (
    <div className="relative flex h-[140px] w-[140px] items-center justify-center">
      <svg width="140" height="140" className="-rotate-90">
        <circle
          cx="70"
          cy="70"
          r={radius}
          fill="none"
          stroke="#242836"
          strokeWidth="12"
        />
        <circle
          cx="70"
          cy="70"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
          style={{ transition: 'stroke-dasharray 700ms ease, stroke 400ms ease' }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-3xl font-bold text-gray-100">{score}</span>
        <span className="text-[10px] uppercase tracking-wide text-gray-500">
          Risk / 100
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Highlight the offending output spans
// ---------------------------------------------------------------------------
interface Segment {
  text: string;
  finding?: DivergenceFinding;
}

function buildSegments(
  text: string,
  findings: DivergenceFinding[]
): Segment[] {
  // Locate each finding's verbatim output quote and mark non-overlapping ranges.
  type Range = { start: number; end: number; finding: DivergenceFinding };
  const ranges: Range[] = [];
  const lower = text.toLowerCase();

  for (const f of findings) {
    const quote = f.evidence_output_quote?.trim();
    if (!quote) continue;
    const idx = lower.indexOf(quote.toLowerCase());
    if (idx === -1) continue;
    ranges.push({ start: idx, end: idx + quote.length, finding: f });
  }

  ranges.sort((a, b) => a.start - b.start || b.end - a.end);

  const segments: Segment[] = [];
  let cursor = 0;
  for (const r of ranges) {
    if (r.start < cursor) continue; // skip overlaps; first (most severe) wins
    if (r.start > cursor) {
      segments.push({ text: text.slice(cursor, r.start) });
    }
    segments.push({ text: text.slice(r.start, r.end), finding: r.finding });
    cursor = r.end;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor) });
  return segments;
}

function HighlightedOutput({
  text,
  findings,
  onHover,
}: {
  text: string;
  findings: DivergenceFinding[];
  onHover: (f: DivergenceFinding | null) => void;
}) {
  const segments = useMemo(() => buildSegments(text, findings), [text, findings]);

  return (
    <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-300">
      {segments.map((seg, i) =>
        seg.finding ? (
          <mark
            key={i}
            className="divergence-mark"
            style={{
              backgroundColor: severityColor(seg.finding.severity) + '33',
              borderBottom: `2px solid ${severityColor(seg.finding.severity)}`,
              color: '#f3f4f6',
            }}
            onMouseEnter={() => onHover(seg.finding!)}
            onMouseLeave={() => onHover(null)}
          >
            {seg.text}
          </mark>
        ) : (
          <span key={i}>{seg.text}</span>
        )
      )}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Finding card
// ---------------------------------------------------------------------------
function FindingCard({ finding }: { finding: DivergenceFinding }) {
  const color = severityColor(finding.severity);
  return (
    <div
      className="rounded-lg border bg-surface p-3"
      style={{ borderColor: color + '55' }}
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
            style={{ backgroundColor: color }}
          />
          <span className="text-sm font-medium text-gray-200">
            {finding.mechanism_name}
          </span>
        </div>
        <span
          className="text-xs font-semibold"
          style={{ color }}
        >
          {severityLabel(finding.severity)} &middot; {finding.severity}/5
        </span>
      </div>

      <div className="mb-2 grid gap-2 sm:grid-cols-2">
        <blockquote className="rounded border border-surface-border bg-surface-raised p-2 text-xs">
          <span className="mb-1 block text-[10px] uppercase tracking-wide text-gray-500">
            Reference
          </span>
          <span className="text-gray-300">{finding.evidence_policy_quote}</span>
        </blockquote>
        <blockquote
          className="rounded border p-2 text-xs"
          style={{ borderColor: color + '55', background: color + '11' }}
        >
          <span className="mb-1 block text-[10px] uppercase tracking-wide text-gray-500">
            Output
          </span>
          <span className="text-gray-200">{finding.evidence_output_quote}</span>
        </blockquote>
      </div>

      <p className="mb-2 text-xs leading-relaxed text-gray-400">
        {finding.explanation}
      </p>
      <p className="text-xs leading-relaxed text-emerald-300/90">
        <span className="font-semibold">Mitigation: </span>
        {finding.suggested_mitigation}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main visualizer
// ---------------------------------------------------------------------------
export function AuditVisualizer({ referenceText, responseText, result }: Props) {
  const [hovered, setHovered] = useState<DivergenceFinding | null>(null);

  if (!result) {
    return (
      <section className="flex h-full min-h-[400px] flex-col items-center justify-center rounded-xl border border-dashed border-surface-border bg-surface-raised/50 p-8 text-center">
        <Gauge size={32} className="mb-3 text-gray-600" />
        <p className="text-sm text-gray-400">
          Run an audit to see the side-by-side divergence report.
        </p>
        <p className="mt-1 max-w-sm text-xs text-gray-600">
          Offending output spans are underlined by severity; hover to see the
          matching policy rule and diagnosis.
        </p>
      </section>
    );
  }

  const { scorecard, mode } = result;
  const compliant = scorecard.is_compliant;

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-surface-border bg-surface-raised p-4 shadow-lg shadow-black/20">
      {/* Scorecard header */}
      <div className="flex flex-wrap items-center gap-5">
        <RiskGauge score={scorecard.overall_risk_score} />
        <div className="flex-1">
          <div
            className={
              'mb-2 inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold ' +
              (compliant
                ? 'bg-emerald-500/10 text-emerald-300'
                : 'bg-red-500/10 text-red-300')
            }
          >
            {compliant ? <ShieldCheck size={16} /> : <ShieldAlert size={16} />}
            {compliant ? 'Compliant' : 'Divergences detected'}
          </div>
          <p className="text-sm text-gray-400">
            {scorecard.findings.length === 0
              ? 'No medium or high-risk divergences were found between the reference and the output.'
              : `${scorecard.findings.length} divergence${
                  scorecard.findings.length === 1 ? '' : 's'
                } flagged across the active modules.`}
          </p>
          <div className="mt-2 inline-flex items-center gap-1.5 rounded border border-surface-border bg-surface px-2 py-1 text-[11px] text-gray-500">
            <Cpu size={12} />
            {mode === 'agent'
              ? 'Hybrid: deterministic parse + agentic adjudication'
              : 'Deterministic linguistic baseline (no LLM)'}
          </div>
        </div>
      </div>

      {/* Split screen */}
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-lg border border-surface-border bg-surface p-3">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Reference Documents
          </h3>
          <p className="max-h-64 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-gray-400">
            {referenceText || '— no documents uploaded —'}
          </p>
        </div>
        <div className="relative rounded-lg border border-surface-border bg-surface p-3">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            LLM Output
          </h3>
          <div className="max-h-64 overflow-y-auto">
            <HighlightedOutput
              text={responseText}
              findings={scorecard.findings}
              onHover={setHovered}
            />
          </div>
          {hovered && (
            <div className="pointer-events-none absolute inset-x-3 bottom-3 rounded-lg border border-surface-border bg-surface-raised p-3 shadow-xl">
              <div className="mb-1 flex items-center gap-2">
                <span
                  className="rounded px-1.5 py-0.5 text-[11px] font-bold"
                  style={{
                    backgroundColor: severityColor(hovered.severity) + '22',
                    color: severityColor(hovered.severity),
                  }}
                >
                  {hovered.mechanism_name}
                </span>
              </div>
              <p className="mb-1 text-xs text-gray-300">{hovered.explanation}</p>
              <p className="text-[11px] italic text-gray-500">
                Rule: &ldquo;{hovered.evidence_policy_quote}&rdquo;
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Findings detail */}
      {scorecard.findings.length > 0 && (
        <div className="flex flex-col gap-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Findings
          </h3>
          {scorecard.findings
            .slice()
            .sort((a, b) => b.severity - a.severity)
            .map((f, i) => (
              <FindingCard key={i} finding={f} />
            ))}
        </div>
      )}
    </section>
  );
}
