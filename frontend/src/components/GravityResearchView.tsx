import React, { useState } from 'react';
import { 
  Compass, GitFork, CheckCircle, AlertTriangle, ExternalLink, 
  Clock, ShieldCheck, ChevronDown, ChevronUp, FileText
} from 'lucide-react';
import { AIIntelligence } from '../types';

interface GravityResearchViewProps {
  data: AIIntelligence;
}

export const GravityResearchView: React.FC<GravityResearchViewProps> = ({ data }) => {
  const [showAudit, setShowAudit] = useState(false);

  if (!data) return null;

  return (
    <div className="mb-10 rounded-2xl bg-obsidian-900 border border-gold-400/40 p-6 shadow-gold-glow-lg">
      {/* Brand Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 mb-5 border-b border-obsidian-750">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-gold-400 to-amber-600 flex items-center justify-center text-obsidian-950 shadow-md">
            <Compass className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-serif tracking-wider text-gold-300 font-bold text-sm">
                GRAVITY RESEARCH REPORT
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-gold-400/10 text-gold-400 border border-gold-400/20">
                Multi-Source Autonomous Agent
              </span>
            </div>
            <p className="text-xs text-neutral-400">
              Cross-verified across {data.citations?.length || 0} independent sources in {data.research_duration_sec || 0.4}s
            </p>
          </div>
        </div>

        <button
          onClick={() => setShowAudit(!showAudit)}
          className="flex items-center space-x-1 text-xs text-neutral-400 hover:text-gold-300 bg-obsidian-850 px-2.5 py-1.5 rounded-lg border border-obsidian-750 transition-colors self-start sm:self-auto"
        >
          <GitFork className="w-3.5 h-3.5" />
          <span>Research Audit Trail ({data.sub_searches?.length || 0} sub-searches)</span>
          {showAudit ? <ChevronUp className="w-3 h-3 ml-1" /> : <ChevronDown className="w-3 h-3 ml-1" />}
        </button>
      </div>

      {/* Sub-Searches Audit Trail Accordion */}
      {showAudit && data.sub_searches && (
        <div className="mb-5 p-4 rounded-xl bg-obsidian-950 border border-obsidian-800 text-xs text-neutral-300 space-y-2 animate-fadeIn">
          <span className="font-mono text-neutral-400 uppercase text-[10px] tracking-widest block">
            Automated Query Decomposition:
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {data.sub_searches.map((sub, i) => (
              <div key={i} className="flex items-center justify-between p-2 rounded bg-obsidian-900 border border-obsidian-800">
                <span className="font-mono text-gold-300">"{sub.sub_query}"</span>
                <span className="text-neutral-500 font-mono text-[11px]">{sub.results_found} found</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Executive Summary */}
      <div className="mb-6">
        <h3 className="text-xs font-serif font-bold text-gold-300 uppercase tracking-widest mb-2 flex items-center space-x-1.5">
          <FileText className="w-3.5 h-3.5" />
          <span>Executive Synthesis</span>
        </h3>
        <p className="text-sm text-neutral-200 leading-relaxed bg-obsidian-850/60 p-4 rounded-xl border border-obsidian-800">
          {data.executive_summary || data.summary}
        </p>
      </div>

      {/* Cross-Source Comparative Analysis */}
      {data.cross_source_analysis && data.cross_source_analysis.length > 0 && (
        <div className="mb-6">
          <h3 className="text-xs font-serif font-bold text-gold-300 uppercase tracking-widest mb-3">
            Cross-Source Verification & Discrepancy Checks
          </h3>
          <div className="space-y-2">
            {data.cross_source_analysis.map((cs, idx) => (
              <div key={idx} className="p-3.5 rounded-xl bg-obsidian-850 border border-obsidian-750">
                <div className="flex items-center space-x-2 text-xs font-semibold text-neutral-200 mb-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-gold-400" />
                  <span>{cs.theme}</span>
                </div>
                <p className="text-xs text-neutral-300 leading-relaxed pl-3.5 mb-2">
                  {cs.assessment}
                </p>
                <div className="flex items-center space-x-1.5 pl-3.5">
                  <span className="text-[10px] text-neutral-500 font-mono">Supporting Citations:</span>
                  {cs.supporting_citations.map(cId => (
                    <span key={cId} className="px-1.5 py-0.5 rounded bg-gold-400/20 text-gold-300 font-mono text-[10px] font-bold">
                      [{cId}]
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Verified Sources & Bibliography */}
      {data.citations && data.citations.length > 0 && (
        <div>
          <h3 className="text-xs font-serif font-bold text-gold-300 uppercase tracking-widest mb-3">
            Verified Source Bibliography
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {data.citations.map((c) => (
              <a
                key={c.index}
                href={c.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start space-x-2.5 p-2.5 rounded-xl bg-obsidian-850 border border-obsidian-750 hover:border-gold-400/50 transition-all group"
              >
                <span className="w-5 h-5 rounded-full bg-gold-400/15 text-gold-400 font-mono text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5 group-hover:bg-gold-400 group-hover:text-obsidian-950 transition-colors">
                  {c.index}
                </span>
                <div className="min-w-0 flex-1">
                  <h4 className="text-xs font-medium text-neutral-200 truncate group-hover:text-gold-300 transition-colors">
                    {c.title}
                  </h4>
                  <div className="flex items-center space-x-2 text-[10px] text-neutral-500 mt-0.5">
                    <span className="font-mono text-neutral-400">{c.domain}</span>
                    {c.published_str && <span>• {c.published_str}</span>}
                  </div>
                </div>
                <ExternalLink className="w-3 h-3 text-neutral-600 group-hover:text-gold-400 shrink-0" />
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
