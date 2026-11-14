import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Sparkles, ChevronDown, ChevronUp, Copy, Check, RefreshCw, Volume2, VolumeX,
  ThumbsUp, ThumbsDown, Send, ExternalLink, AlertTriangle, HelpCircle,
  Square, Trash2, Download, Loader2, CornerDownRight, ArrowUpRight
} from 'lucide-react';
import type {
  AiFollowupStyle,
  AiModelSelection,
  PendulumCitation,
  PendulumFollowupTurn,
  PendulumOverview,
  PendulumResultItem,
  PendulumUserSettings
} from '../../types';
import {
  postAiFollowupAPI,
  postAiOverviewAPI,
  sendFeedbackAPI,
  streamAiFollowupSSE
} from '../../services/api';

interface JulyOverviewPanelProps {
  query: string;
  queryIntent?: string;
  overview: PendulumOverview | null;
  streamText: string;
  isStreaming: boolean;
  citations: PendulumCitation[];
  relatedQuestions: string[];
  resultsPool: PendulumResultItem[];
  aiModel: AiModelSelection;
  settings: PendulumUserSettings;
  onSelectQuery: (newQuery: string) => void;
  onOverviewUpdated: (nextOverview: PendulumOverview, nextRelated?: string[]) => void;
}

const SESSION_STORAGE_PREFIX = 'pendulum_ai_followup_session_v1:';

function formatDisagreements(val?: string | string[] | null): string {
  if (!val) return '';
  if (Array.isArray(val)) return val.filter(Boolean).join(' ').trim();
  return String(val).trim();
}

function getSessionStorageKey(query: string): string {
  return `${SESSION_STORAGE_PREFIX}${query.toLowerCase().trim()}`;
}

function loadPersistedTurns(query: string): PendulumFollowupTurn[] {
  if (typeof window === 'undefined' || !query.trim()) return [];
  try {
    const raw = window.sessionStorage.getItem(getSessionStorageKey(query));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((t) => t && typeof t.question === 'string' && typeof t.answer === 'string')
      .map((t) => ({ ...t, isStreaming: false }));
  } catch {
    return [];
  }
}

function savePersistedTurns(query: string, turns: PendulumFollowupTurn[]) {
  if (typeof window === 'undefined' || !query.trim()) return;
  try {
    const settled = turns.filter((t) => !t.isStreaming && (t.answer || t.error));
    if (settled.length === 0) {
      window.sessionStorage.removeItem(getSessionStorageKey(query));
    } else {
      window.sessionStorage.setItem(getSessionStorageKey(query), JSON.stringify(settled.slice(-12)));
    }
  } catch {}
}

function renderSafeMarkdownWithCitations(
  rawText: string,
  citations: PendulumCitation[]
): React.ReactNode[] {
  if (!rawText) return [];

  const citationMap = new Map<number, PendulumCitation>();
  citations.forEach((c, idx) => citationMap.set(c.index || idx + 1, c));

  const formatInline = (line: string, keyPrefix: string): React.ReactNode[] => {
    const parts: React.ReactNode[] = [];
    const tokenRegex = /(\[\d+\]|\*\*[^*]+\*\*|`[^`]+`)/g;
    let lastIdx = 0;
    let match: RegExpExecArray | null;
    let partIdx = 0;

    while ((match = tokenRegex.exec(line)) !== null) {
      if (match.index > lastIdx) {
        parts.push(line.slice(lastIdx, match.index));
      }
      const token = match[0];
      if (token.startsWith('[') && token.endsWith(']')) {
        const num = Number(token.slice(1, -1));
        const cit = citationMap.get(num);
        parts.push(
          cit ? (
            <a
              key={`${keyPrefix}-cit-${partIdx++}`}
              href={cit.url}
              target="_blank"
              rel="noopener noreferrer"
              title={`${cit.title} (${cit.domain})`}
              className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 mx-0.5 rounded bg-gold-400/20 text-gold-200 hover:bg-gold-400 hover:text-[#090a0c] font-mono text-[10px] font-bold align-baseline transition-colors tabular-nums"
            >
              {num}
            </a>
          ) : (
            <span
              key={`${keyPrefix}-cit-${partIdx++}`}
              className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 mx-0.5 rounded bg-white/10 text-[#c5c7ca] font-mono text-[10px] tabular-nums"
            >
              {num}
            </span>
          )
        );
      } else if (token.startsWith('**') && token.endsWith('**')) {
        parts.push(
          <strong key={`${keyPrefix}-b-${partIdx++}`} className="font-semibold text-[#fffaf0]">
            {token.slice(2, -2)}
          </strong>
        );
      } else if (token.startsWith('`') && token.endsWith('`')) {
        parts.push(
          <code
            key={`${keyPrefix}-c-${partIdx++}`}
            className="px-1.5 py-0.5 rounded bg-white/[0.06] text-gold-200 font-mono text-[12px]"
          >
            {token.slice(1, -1)}
          </code>
        );
      }
      lastIdx = match.index + token.length;
    }

    if (lastIdx < line.length) {
      parts.push(line.slice(lastIdx));
    }
    return parts;
  };

  const lines = rawText.split(/\r?\n/);
  const nodes: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const trimmed = lines[i].trim();
    if (!trimmed) {
      i++;
      continue;
    }

    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) {
        tableLines.push(lines[i].trim());
        i++;
      }
      const cleanRows = tableLines.filter((r) => !/^\|(?:\s*:?-+:?\s*\|)+$/.test(r));
      if (cleanRows.length > 0) {
        const headerCells = cleanRows[0].split('|').slice(1, -1).map((c) => c.trim());
        const bodyRows = cleanRows.slice(1).map((r) => r.split('|').slice(1, -1).map((c) => c.trim()));
        nodes.push(
          <div key={`tbl-${i}`} className="overflow-x-auto my-3">
            <table className="w-full text-left border-collapse text-xs sm:text-[13px]">
              <thead>
                <tr className="border-b border-white/15 bg-white/[0.03]">
                  {headerCells.map((hc, hi) => (
                    <th key={hi} className="px-3 py-2 font-semibold text-gold-200">
                      {formatInline(hc, `th-${i}-${hi}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bodyRows.map((row, ri) => (
                  <tr key={ri} className="border-b border-white/5">
                    {row.map((cell, ci) => (
                      <td key={ci} className="px-3 py-2 text-[#e8e5de]">
                        {formatInline(cell, `td-${i}-${ri}-${ci}`)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        continue;
      }
    }

    if (trimmed.startsWith('### ') || trimmed.startsWith('## ')) {
      const headingText = trimmed.replace(/^#{2,3}\s+/, '');
      nodes.push(
        <h4 key={`h-${i}`} className="font-display font-bold text-sm text-gold-200 mt-3 mb-1.5">
          {formatInline(headingText, `h-${i}`)}
        </h4>
      );
      i++;
      continue;
    }

    if (/^[-*•]\s+/.test(trimmed)) {
      const listItems: string[] = [];
      while (i < lines.length && /^[-*•]\s+/.test(lines[i].trim())) {
        listItems.push(lines[i].trim().replace(/^[-*•]\s+/, ''));
        i++;
      }
      nodes.push(
        <ul key={`ul-${i}`} className="list-disc pl-5 space-y-1.5 my-2 text-[14px] leading-relaxed text-[#ece9e2]">
          {listItems.map((li, liIdx) => (
            <li key={liIdx}>{formatInline(li, `ul-${i}-${liIdx}`)}</li>
          ))}
        </ul>
      );
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const listItems: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        listItems.push(lines[i].trim().replace(/^\d+\.\s+/, ''));
        i++;
      }
      nodes.push(
        <ol key={`ol-${i}`} className="list-decimal pl-5 space-y-1.5 my-2 text-[14px] leading-relaxed text-[#ece9e2]">
          {listItems.map((li, liIdx) => (
            <li key={liIdx}>{formatInline(li, `ol-${i}-${liIdx}`)}</li>
          ))}
        </ol>
      );
      continue;
    }

    nodes.push(
      <p key={`p-${i}`} className="text-[14px] sm:text-[15px] leading-[1.68] text-[#ece9e2] my-2">
        {formatInline(trimmed, `p-${i}`)}
      </p>
    );
    i++;
  }

  return nodes;
}

export const JulyOverviewPanel: React.FC<JulyOverviewPanelProps> = ({
  query,
  queryIntent,
  overview,
  streamText,
  isStreaming,
  citations,
  relatedQuestions,
  resultsPool,
  aiModel,
  settings,
  onSelectQuery,
  onOverviewUpdated
}) => {
  const isNavigational = queryIntent === 'navigational';
  const [expanded, setExpanded] = useState(!isNavigational);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [feedbackSent, setFeedbackSent] = useState<'up' | 'down' | null>(null);

  // Follow-up session controls
  const [sessionModel, setSessionModel] = useState<AiModelSelection>(aiModel || 'auto');
  const [followupStyle, setFollowupStyle] = useState<AiFollowupStyle>('auto');
  const [followupInput, setFollowupInput] = useState('');
  const [followupLoading, setFollowupLoading] = useState(false);
  const [followupThread, setFollowupThread] = useState<PendulumFollowupTurn[]>(() => loadPersistedTurns(query));
  const [openSourcesTurnId, setOpenSourcesTurnId] = useState<string | null>(null);

  const followupAbortRef = useRef<AbortController | null>(null);
  const threadEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setSessionModel(aiModel || 'auto');
  }, [aiModel]);

  useEffect(() => {
    followupAbortRef.current?.abort();
    setExpanded(queryIntent !== 'navigational');
    setFollowupThread(loadPersistedTurns(query));
    setFollowupInput('');
    setFollowupLoading(false);
    setOpenSourcesTurnId(null);
    setFeedbackSent(null);
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      setSpeakingId(null);
    }
    return () => {
      followupAbortRef.current?.abort();
    };
  }, [query, queryIntent]);

  useEffect(() => {
    savePersistedTurns(query, followupThread);
  }, [query, followupThread]);

  const answerText = streamText || overview?.answer || '';
  const renderedAnswer = useMemo(
    () => renderSafeMarkdownWithCitations(answerText, citations),
    [answerText, citations]
  );

  if (!isStreaming && !answerText && !overview?.insufficientEvidence) {
    return null;
  }

  const handleCopyText = async (id: string, text: string) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId((curr) => (curr === id ? null : curr)), 1800);
    } catch {}
  };

  const handleSpeakText = (id: string, text: string) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    if (speakingId === id) {
      window.speechSynthesis.cancel();
      setSpeakingId(null);
      return;
    }
    window.speechSynthesis.cancel();
    const cleanText = text.replace(/\[\d+\]/g, '').replace(/[*#`|]/g, '');
    if (!cleanText.trim()) return;
    const utt = new SpeechSynthesisUtterance(cleanText);
    utt.onend = () => setSpeakingId(null);
    utt.onerror = () => setSpeakingId(null);
    setSpeakingId(id);
    window.speechSynthesis.speak(utt);
  };

  const handleRegenerate = async () => {
    setRegenerating(true);
    try {
      const data = await postAiOverviewAPI({
        query,
        model: sessionModel,
        regenerate: true,
        settings
      });
      if (data?.overview) {
        onOverviewUpdated(data.overview, data.relatedQuestions);
      }
    } catch {}
    setRegenerating(false);
  };

  const buildConversationHistory = (turnsToInclude: PendulumFollowupTurn[]) => [
    { role: 'user' as const, content: query },
    ...(answerText ? [{ role: 'assistant' as const, content: answerText }] : []),
    ...turnsToInclude
      .filter((t) => t.answer && !t.error)
      .flatMap((t) => [
        { role: 'user' as const, content: t.question },
        { role: 'assistant' as const, content: t.answer }
      ])
  ];

  const runFollowupTurn = async (
    questionText: string,
    opts?: { replaceTurnId?: string; regenerate?: boolean; overrideStyle?: AiFollowupStyle; overrideModel?: AiModelSelection }
  ) => {
    const fq = questionText.trim();
    if (!fq || followupLoading) return;

    followupAbortRef.current?.abort();
    const ctrl = new AbortController();
    followupAbortRef.current = ctrl;

    const turnId = opts?.replaceTurnId || `turn-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const activeModel = opts?.overrideModel || sessionModel;
    const activeStyle = opts?.overrideStyle || followupStyle;

    const priorTurns = opts?.replaceTurnId
      ? followupThread.slice(0, Math.max(0, followupThread.findIndex((t) => t.id === opts.replaceTurnId)))
      : followupThread;

    const history = buildConversationHistory(priorTurns);

    const placeholderTurn: PendulumFollowupTurn = {
      id: turnId,
      question: fq,
      answer: '',
      sources: citations,
      style: activeStyle,
      isStreaming: true,
      error: null,
      createdAt: new Date().toISOString()
    };

    setFollowupLoading(true);
    setExpanded(true);
    setFollowupThread((prev) => {
      if (opts?.replaceTurnId) {
        return prev.map((t) => (t.id === opts.replaceTurnId ? placeholderTurn : t));
      }
      return [...prev, placeholderTurn];
    });
    if (!opts?.replaceTurnId) {
      setFollowupInput('');
    }

    setTimeout(() => {
      threadEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 60);

    try {
      await streamAiFollowupSSE(
        {
          query,
          followupQuery: fq,
          history,
          existingSources: resultsPool,
          model: activeModel,
          responseStyle: activeStyle,
          regenerate: Boolean(opts?.regenerate),
          settings
        },
        {
          onSources: (meta) => {
            setFollowupThread((prev) =>
              prev.map((t) =>
                t.id === turnId
                  ? {
                      ...t,
                      resolvedQuery: meta.resolvedQuery,
                      usedContextRewrite: meta.usedContextRewrite,
                      sources: meta.sources && meta.sources.length > 0 ? meta.sources : t.sources,
                      modelUsed: meta.modelUsed,
                      modelLabel: meta.modelLabel
                    }
                  : t
              )
            );
          },
          onDelta: (delta) => {
            setFollowupThread((prev) =>
              prev.map((t) => (t.id === turnId ? { ...t, answer: t.answer + delta } : t))
            );
          },
          onDone: (finalPayload) => {
            setFollowupThread((prev) =>
              prev.map((t) =>
                t.id === turnId
                  ? {
                      ...t,
                      resolvedQuery: finalPayload.resolvedQuery || t.resolvedQuery,
                      usedContextRewrite: finalPayload.usedContextRewrite ?? t.usedContextRewrite,
                      answer: finalPayload.overview?.answer || t.answer || 'No additional verified answer could be synthesized.',
                      directAnswer: finalPayload.overview?.directAnswer,
                      keyPoints: finalPayload.overview?.keyPoints,
                      confidence: finalPayload.overview?.confidence,
                      modelUsed: finalPayload.overview?.modelUsed || t.modelUsed,
                      modelLabel: finalPayload.overview?.modelLabel || t.modelLabel,
                      disagreements: finalPayload.overview?.disagreements,
                      insufficientEvidence: finalPayload.overview?.insufficientEvidence,
                      sources: finalPayload.sources && finalPayload.sources.length > 0 ? finalPayload.sources : t.sources,
                      relatedQuestions: finalPayload.relatedQuestions || [],
                      isStreaming: false,
                      error: null
                    }
                  : t
              )
            );
          }
        },
        ctrl.signal
      );
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        setFollowupThread((prev) =>
          prev.map((t) =>
            t.id === turnId
              ? {
                  ...t,
                  isStreaming: false,
                  answer: t.answer || 'Response stopped by user.'
                }
              : t
          )
        );
        setFollowupLoading(false);
        return;
      }

      // Fallback to non-streaming JSON follow-up once if SSE transport fails
      try {
        const res = await postAiFollowupAPI(
          {
            query,
            followupQuery: fq,
            history,
            existingSources: resultsPool,
            model: activeModel,
            responseStyle: activeStyle,
            regenerate: Boolean(opts?.regenerate),
            settings
          },
          ctrl.signal
        );
        setFollowupThread((prev) =>
          prev.map((t) =>
            t.id === turnId
              ? {
                  ...t,
                  resolvedQuery: res.resolvedQuery,
                  usedContextRewrite: res.usedContextRewrite,
                  answer: res.overview?.answer || 'No additional verified answer could be synthesized.',
                  directAnswer: res.overview?.directAnswer,
                  keyPoints: res.overview?.keyPoints,
                  confidence: res.overview?.confidence,
                  modelUsed: res.overview?.modelUsed,
                  modelLabel: res.overview?.modelLabel,
                  disagreements: res.overview?.disagreements,
                  insufficientEvidence: res.overview?.insufficientEvidence,
                  sources: res.sources || t.sources,
                  relatedQuestions: res.relatedQuestions || [],
                  isStreaming: false,
                  error: null
                }
              : t
          )
        );
      } catch (fallbackErr: any) {
        if (fallbackErr?.name !== 'AbortError') {
          setFollowupThread((prev) =>
            prev.map((t) =>
              t.id === turnId
                ? {
                    ...t,
                    isStreaming: false,
                    error: fallbackErr?.message || 'Unable to generate follow-up response.'
                  }
                : t
            )
          );
        }
      }
    } finally {
      setFollowupLoading(false);
    }
  };

  const handleFollowupSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    runFollowupTurn(followupInput);
  };

  const handleStopStreaming = () => {
    followupAbortRef.current?.abort();
    setFollowupLoading(false);
  };

  const handleClearSession = () => {
    followupAbortRef.current?.abort();
    setFollowupThread([]);
    setOpenSourcesTurnId(null);
    setFollowupLoading(false);
    if (typeof window !== 'undefined') {
      try {
        window.sessionStorage.removeItem(getSessionStorageKey(query));
      } catch {}
    }
  };

  const handleExportSession = () => {
    const lines: string[] = [
      `# Pendulum Search AI Session: ${query}`,
      '',
      `## Initial Overview (${overview?.modelLabel || 'July AI'})`,
      answerText,
      ''
    ];
    if (citations.length > 0) {
      lines.push('### Initial Citations');
      citations.forEach((c, idx) => lines.push(`[${c.index || idx + 1}] ${c.title} — ${c.url}`));
      lines.push('');
    }
    followupThread.forEach((t, idx) => {
      lines.push(`## Follow-up Turn ${idx + 1}: ${t.question}`);
      if (t.resolvedQuery && t.usedContextRewrite) {
        lines.push(`*Searched: ${t.resolvedQuery}*`);
      }
      lines.push('', t.answer, '');
      if (t.sources.length > 0) {
        lines.push('### Turn Citations');
        t.sources.forEach((s, si) => lines.push(`[${s.index || si + 1}] ${s.title} — ${s.url}`));
        lines.push('');
      }
    });
    handleCopyText('export-session', lines.join('\n'));
  };

  const modelTitle = overview?.modelLabel || (aiModel === 'gravity' ? 'Gravity Deep Research' : 'July AI Overview');
  const overviewDisagreements = formatDisagreements(overview?.disagreements);

  // Active next follow-up suggestions come from the latest completed turn if available, otherwise initial overview
  const latestSettledTurn = [...followupThread].reverse().find((t) => !t.isStreaming && !t.error);
  const activeFollowupSuggestions =
    latestSettledTurn?.relatedQuestions && latestSettledTurn.relatedQuestions.length > 0
      ? latestSettledTurn.relatedQuestions
      : relatedQuestions;

  return (
    <section
      aria-label="July AI Overview"
      className="mb-6 rounded-2xl bg-[#111316]/95 border border-gold-400/25 overflow-hidden"
    >
      {/* Header Row */}
      <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3.5 border-b border-white/[0.07] bg-gradient-to-r from-gold-400/[0.07] via-transparent to-transparent">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-gold-400/15 border border-gold-400/35 flex items-center justify-center text-gold-300 shrink-0">
            <Sparkles className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs sm:text-sm font-display font-bold text-[#f3f0e9]">
              <span className="truncate">{modelTitle}</span>
              {isStreaming && (
                <span className="inline-flex items-center gap-1 text-[11px] font-mono text-gold-300 font-normal">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>Synthesizing</span>
                </span>
              )}
              {!isStreaming && overview?.confidence && (
                <span className="text-[11px] font-mono text-[#9a9da3] font-normal tabular-nums">
                  · {overview.confidence} confidence
                </span>
              )}
              {followupThread.length > 0 && (
                <span className="text-[11px] font-mono text-gold-300/90 font-normal tabular-nums">
                  · {followupThread.length} follow-up {followupThread.length === 1 ? 'turn' : 'turns'}
                </span>
              )}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-[#c5c7ca] hover:text-gold-200 hover:bg-white/[0.04] flex items-center gap-1 shrink-0 whitespace-nowrap transition-colors"
        >
          <span>{expanded ? 'Collapse' : 'Show overview'}</span>
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>

      {expanded && (
        <div className="p-4 sm:p-5 space-y-4">
          {/* Insufficient Evidence Notice */}
          {overview?.insufficientEvidence && (
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-500/10 border border-amber-400/25 text-xs text-amber-200">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-300" />
              <span>
                Insufficient verified sources were retrieved for a confident synthesis. Review the results below or refine your query.
              </span>
            </div>
          )}

          {/* Direct Answer Highlight */}
          {overview?.directAnswer && (
            <div className="px-3.5 py-2.5 rounded-xl bg-gold-400/[0.08] border border-gold-400/25 text-sm font-semibold text-gold-100">
              {overview.directAnswer}
            </div>
          )}

          {/* Streaming / Synthesized Body */}
          {isStreaming && !answerText ? (
            <div className="space-y-2.5 py-2">
              <div className="h-3.5 bg-white/[0.06] rounded w-11/12" />
              <div className="h-3.5 bg-white/[0.06] rounded w-5/6" />
              <div className="h-3.5 bg-white/[0.05] rounded w-3/4" />
            </div>
          ) : (
            <div className="pendulum-markdown">{renderedAnswer}</div>
          )}

          {/* Key Points */}
          {overview?.keyPoints && overview.keyPoints.length > 0 && !isStreaming && (
            <div className="pt-2 border-t border-white/[0.06]">
              <div className="text-[11px] font-mono uppercase tracking-[0.12em] text-gold-300/90 mb-2">
                Key Points
              </div>
              <ul className="space-y-1.5 text-[13px] text-[#d6d3cb]">
                {overview.keyPoints.slice(0, 4).map((kp, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="text-gold-400 mt-0.5">•</span>
                    <span>{kp}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Disagreement Notice */}
          {overviewDisagreements && (
            <div className="p-3 rounded-xl bg-[#171a1e] border border-white/10 text-xs text-[#c5c7ca]">
              <span className="font-semibold text-gold-200">Source nuances: </span>
              {overviewDisagreements}
            </div>
          )}

          {/* Grounded Source Cards */}
          {citations.length > 0 && (
            <div className="pt-3 border-t border-white/[0.07]">
              <div className="text-[11px] font-mono uppercase tracking-[0.12em] text-[#9a9da3] mb-2 tabular-nums">
                Cited Sources ({citations.length})
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {citations.slice(0, 6).map((c, idx) => (
                  <a
                    key={`${c.url}-${idx}`}
                    href={c.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex items-start gap-2.5 p-2.5 rounded-xl bg-[#171a1e] hover:bg-[#1d2127] border border-white/10 hover:border-gold-400/40 transition-colors"
                  >
                    <span className="w-5 h-5 rounded bg-gold-400/15 text-gold-200 font-mono text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5 tabular-nums">
                      {c.index || idx + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium text-[#f3f0e9] group-hover:text-gold-200 line-clamp-1">
                        {c.title}
                      </div>
                      <div className="text-[11px] font-mono text-[#9a9da3] truncate mt-0.5">
                        {c.domain}
                      </div>
                    </div>
                    <ExternalLink className="w-3 h-3 text-[#6f747d] group-hover:text-gold-300 shrink-0 mt-1" />
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Enhanced Multi-Turn Follow-up Session Thread */}
          {followupThread.length > 0 && (
            <div className="pt-4 border-t border-white/[0.08] space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] font-mono uppercase tracking-[0.12em] text-gold-300/90 tabular-nums">
                  Follow-up Session ({followupThread.length})
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleExportSession}
                    className="px-2.5 py-1 rounded-lg border border-white/10 hover:border-gold-400/35 text-[11px] font-medium text-[#c5c7ca] hover:text-gold-200 flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
                  >
                    {copiedId === 'export-session' ? (
                      <>
                        <Check className="w-3 h-3 text-[#a9c6a5]" />
                        <span>Copied transcript</span>
                      </>
                    ) : (
                      <>
                        <Download className="w-3 h-3" />
                        <span>Export thread</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={handleClearSession}
                    className="px-2.5 py-1 rounded-lg border border-white/10 hover:border-rose-400/40 text-[11px] font-medium text-[#c5c7ca] hover:text-rose-300 flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Clear session</span>
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                {followupThread.map((item, idx) => {
                  const turnDisagreement = formatDisagreements(item.disagreements);
                  const sourcesOpen = openSourcesTurnId === item.id;
                  const turnCitations = item.sources && item.sources.length > 0 ? item.sources : citations;
                  const turnNodes = renderSafeMarkdownWithCitations(item.answer, turnCitations);

                  return (
                    <div
                      key={item.id}
                      className="rounded-xl bg-[#15181c] border border-white/10 overflow-hidden"
                    >
                      {/* Turn Question + Metadata Header */}
                      <div className="px-3.5 py-2.5 border-b border-white/[0.06] bg-white/[0.02] flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <div className="flex items-center gap-2 text-xs sm:text-[13px] font-semibold text-gold-100">
                            <CornerDownRight className="w-3.5 h-3.5 text-gold-400 shrink-0" />
                            <span className="text-[11px] font-mono text-gold-300/80 shrink-0 tabular-nums">
                              Turn {idx + 1}
                            </span>
                            <span className="text-white/25">·</span>
                            <span className="break-words">{item.question}</span>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 pl-5 text-[11px] font-mono text-[#8d9198] tabular-nums">
                            {item.usedContextRewrite && item.resolvedQuery && (
                              <span>Searched: {item.resolvedQuery}</span>
                            )}
                            {item.modelLabel && (
                              <span>
                                {item.usedContextRewrite && item.resolvedQuery ? '· ' : ''}
                                {item.modelLabel}
                              </span>
                            )}
                            {item.confidence && !item.isStreaming && (
                              <span>· {item.confidence} confidence</span>
                            )}
                            {item.isStreaming && (
                              <span className="inline-flex items-center gap-1 text-gold-300">
                                · <Loader2 className="w-3 h-3 animate-spin" /> Streaming
                              </span>
                            )}
                          </div>
                        </div>

                        {!item.isStreaming && !item.error && (
                          <div className="flex items-center gap-0.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleCopyText(item.id, item.answer)}
                              title="Copy follow-up answer"
                              className="p-1.5 rounded-lg text-[#9a9da3] hover:text-gold-200 hover:bg-white/[0.05]"
                            >
                              {copiedId === item.id ? (
                                <Check className="w-3.5 h-3.5 text-[#a9c6a5]" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSpeakText(item.id, item.answer)}
                              title={speakingId === item.id ? 'Stop reading' : 'Read follow-up aloud'}
                              className="p-1.5 rounded-lg text-[#9a9da3] hover:text-gold-200 hover:bg-white/[0.05]"
                            >
                              {speakingId === item.id ? (
                                <VolumeX className="w-3.5 h-3.5 text-gold-300" />
                              ) : (
                                <Volume2 className="w-3.5 h-3.5" />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                runFollowupTurn(item.question, {
                                  replaceTurnId: item.id,
                                  regenerate: true
                                })
                              }
                              disabled={followupLoading}
                              title="Regenerate this follow-up"
                              className="p-1.5 rounded-lg text-[#9a9da3] hover:text-gold-200 hover:bg-white/[0.05] disabled:opacity-40"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Turn Body */}
                      <div className="px-3.5 py-3 space-y-2.5">
                        {item.error ? (
                          <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-rose-500/10 border border-rose-400/25 text-xs text-rose-200">
                            <span>{item.error}</span>
                            <button
                              type="button"
                              onClick={() =>
                                runFollowupTurn(item.question, {
                                  replaceTurnId: item.id,
                                  regenerate: true
                                })
                              }
                              className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-medium text-white shrink-0 whitespace-nowrap"
                            >
                              Retry
                            </button>
                          </div>
                        ) : (
                          <>
                            {item.insufficientEvidence && !item.isStreaming && (
                              <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-400/25 text-xs text-amber-200">
                                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-300" />
                                <span>Limited grounded sources matched this follow-up query.</span>
                              </div>
                            )}

                            {item.isStreaming && !item.answer ? (
                              <div className="space-y-2 py-1">
                                <div className="h-3 bg-white/[0.06] rounded w-10/12" />
                                <div className="h-3 bg-white/[0.05] rounded w-3/4" />
                              </div>
                            ) : (
                              <div className="text-xs sm:text-[13px] text-[#e8e5de] leading-relaxed">
                                {turnNodes}
                              </div>
                            )}

                            {item.keyPoints && item.keyPoints.length > 0 && !item.isStreaming && (
                              <div className="pt-2 border-t border-white/[0.06]">
                                <div className="text-[10px] font-mono uppercase tracking-[0.12em] text-[#9a9da3] mb-1">
                                  Key Takeaways
                                </div>
                                <ul className="space-y-1 text-xs text-[#d6d3cb]">
                                  {item.keyPoints.slice(0, 3).map((kp, kIdx) => (
                                    <li key={kIdx} className="flex items-start gap-1.5">
                                      <span className="text-gold-400">•</span>
                                      <span>{kp}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {turnDisagreement && !item.isStreaming && (
                              <div className="p-2.5 rounded-lg bg-[#111316] border border-white/10 text-[11px] text-[#c5c7ca]">
                                <span className="font-semibold text-gold-200">Source nuances: </span>
                                {turnDisagreement}
                              </div>
                            )}

                            {turnCitations.length > 0 && (
                              <div className="pt-1.5 border-t border-white/[0.06]">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setOpenSourcesTurnId((curr) => (curr === item.id ? null : item.id))
                                  }
                                  className="text-[11px] font-mono text-[#9a9da3] hover:text-gold-200 flex items-center gap-1.5 transition-colors tabular-nums"
                                >
                                  <span>
                                    {sourcesOpen ? 'Hide' : 'View'} turn sources ({turnCitations.length})
                                  </span>
                                  {sourcesOpen ? (
                                    <ChevronUp className="w-3 h-3" />
                                  ) : (
                                    <ChevronDown className="w-3 h-3" />
                                  )}
                                </button>

                                {sourcesOpen && (
                                  <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                                    {turnCitations.slice(0, 6).map((tc, tcIdx) => (
                                      <a
                                        key={`${tc.url}-${tcIdx}`}
                                        href={tc.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="group flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-[#111316] hover:bg-[#1a1d22] border border-white/[0.08] hover:border-gold-400/35 text-xs transition-colors"
                                      >
                                        <span className="w-4 h-4 rounded bg-gold-400/15 text-gold-200 font-mono text-[10px] font-bold flex items-center justify-center shrink-0 tabular-nums">
                                          {tc.index || tcIdx + 1}
                                        </span>
                                        <div className="min-w-0 flex-1">
                                          <div className="text-[11px] text-[#e8e5de] group-hover:text-gold-200 truncate">
                                            {tc.title}
                                          </div>
                                          <div className="text-[10px] font-mono text-[#8d9198] truncate">
                                            {tc.domain}
                                          </div>
                                        </div>
                                        <ExternalLink className="w-3 h-3 text-[#6f747d] group-hover:text-gold-300 shrink-0" />
                                      </a>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
                <div ref={threadEndRef} />
              </div>
            </div>
          )}

          {/* Contextual Suggested Follow-ups (Continue in thread or open new search) */}
          {activeFollowupSuggestions.length > 0 && !isStreaming && !followupLoading && (
            <div className="pt-3 border-t border-white/[0.07]">
              <div className="text-[11px] font-mono uppercase tracking-[0.12em] text-[#9a9da3] mb-2">
                {followupThread.length > 0 ? 'Suggested Next Follow-ups' : 'Ask a Follow-up or Explore'}
              </div>
              <div className="flex flex-wrap gap-2">
                {activeFollowupSuggestions.slice(0, 4).map((rq, idx) => (
                  <div
                    key={idx}
                    className="inline-flex items-stretch rounded-xl bg-[#171a1e] border border-white/10 hover:border-gold-400/40 overflow-hidden transition-colors"
                  >
                    <button
                      type="button"
                      onClick={() => runFollowupTurn(rq)}
                      title="Continue in this AI session"
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-[#e8e5de] hover:text-gold-200 hover:bg-[#20242a] text-left transition-colors"
                    >
                      <HelpCircle className="w-3 h-3 text-gold-400 shrink-0" />
                      <span>{rq}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onSelectQuery(rq)}
                      title={`Search web for "${rq}"`}
                      aria-label={`Search web for ${rq}`}
                      className="px-2 border-l border-white/10 text-[#8d9198] hover:text-gold-200 hover:bg-[#20242a] flex items-center justify-center transition-colors shrink-0"
                    >
                      <ArrowUpRight className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Follow-up Composer + Session Controls */}
          <div className="pt-3 border-t border-white/[0.07] space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#9a9da3]">
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1.5">
                  <span className="font-mono uppercase tracking-[0.08em] text-[#8d9198]">Model</span>
                  <select
                    value={sessionModel}
                    onChange={(e) => setSessionModel(e.target.value as AiModelSelection)}
                    aria-label="Follow-up AI model"
                    className="h-7 px-2 rounded-lg bg-[#171a1e] border border-white/10 text-[11px] text-[#f3f0e9] focus:border-gold-400/50 focus:outline-none"
                  >
                    <option value="auto" className="bg-[#111316]">Auto Router</option>
                    <option value="july" className="bg-[#111316]">July Fast</option>
                    <option value="gravity" className="bg-[#111316]">Gravity Deep</option>
                  </select>
                </label>

                <label className="flex items-center gap-1.5">
                  <span className="font-mono uppercase tracking-[0.08em] text-[#8d9198]">Depth</span>
                  <select
                    value={followupStyle}
                    onChange={(e) => setFollowupStyle(e.target.value as AiFollowupStyle)}
                    aria-label="Follow-up response style"
                    className="h-7 px-2 rounded-lg bg-[#171a1e] border border-white/10 text-[11px] text-[#f3f0e9] focus:border-gold-400/50 focus:outline-none"
                  >
                    <option value="auto" className="bg-[#111316]">Balanced</option>
                    <option value="concise" className="bg-[#111316]">Concise</option>
                    <option value="detailed" className="bg-[#111316]">Detailed</option>
                    <option value="compare" className="bg-[#111316]">Compare Table</option>
                  </select>
                </label>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => handleCopyText('initial-overview', answerText)}
                  title="Copy overview"
                  className="p-1.5 rounded-lg text-[#9a9da3] hover:text-gold-200 hover:bg-white/[0.04]"
                >
                  {copiedId === 'initial-overview' ? (
                    <Check className="w-3.5 h-3.5 text-[#a9c6a5]" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => handleSpeakText('initial-overview', answerText)}
                  title={speakingId === 'initial-overview' ? 'Stop reading' : 'Read overview aloud'}
                  className="p-1.5 rounded-lg text-[#9a9da3] hover:text-gold-200 hover:bg-white/[0.04]"
                >
                  {speakingId === 'initial-overview' ? (
                    <VolumeX className="w-3.5 h-3.5 text-gold-300" />
                  ) : (
                    <Volume2 className="w-3.5 h-3.5" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleRegenerate}
                  disabled={regenerating || isStreaming}
                  title="Regenerate overview"
                  className="p-1.5 rounded-lg text-[#9a9da3] hover:text-gold-200 hover:bg-white/[0.04] disabled:opacity-40"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${regenerating ? 'animate-spin' : ''}`} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFeedbackSent('up');
                    sendFeedbackAPI(true);
                  }}
                  title="Helpful"
                  className={`p-1.5 rounded-lg hover:bg-white/[0.04] ${
                    feedbackSent === 'up' ? 'text-[#a9c6a5]' : 'text-[#9a9da3] hover:text-[#a9c6a5]'
                  }`}
                >
                  <ThumbsUp className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFeedbackSent('down');
                    sendFeedbackAPI(false);
                  }}
                  title="Not helpful"
                  className={`p-1.5 rounded-lg hover:bg-white/[0.04] ${
                    feedbackSent === 'down' ? 'text-rose-400' : 'text-[#9a9da3] hover:text-rose-300'
                  }`}
                >
                  <ThumbsDown className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <form onSubmit={handleFollowupSubmit} className="flex items-center gap-2">
              <input
                type="text"
                value={followupInput}
                onChange={(e) => setFollowupInput(e.target.value)}
                placeholder={
                  followupThread.length > 0
                    ? 'Ask another follow-up in this session...'
                    : 'Ask July a follow-up question (supports pronouns like "their fees", "compare it")...'
                }
                className="flex-1 h-9 px-3 rounded-xl bg-[#171a1e] border border-white/10 focus:border-gold-400/60 focus:outline-none text-xs text-[#f3f0e9] placeholder-[#7d828b]"
              />
              {followupLoading ? (
                <button
                  type="button"
                  onClick={handleStopStreaming}
                  className="h-9 px-3.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-400/35 text-xs font-medium text-rose-200 flex items-center gap-1.5 shrink-0 whitespace-nowrap transition-colors"
                >
                  <Square className="w-3 h-3 fill-current" />
                  <span>Stop</span>
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!followupInput.trim()}
                  className="h-9 px-3.5 rounded-xl bg-gold-400/15 hover:bg-gold-400/25 border border-gold-400/35 text-xs font-medium text-gold-200 flex items-center gap-1.5 disabled:opacity-40 shrink-0 whitespace-nowrap transition-colors"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Ask</span>
                </button>
              )}
            </form>
          </div>
        </div>
      )}
    </section>
  );
};
