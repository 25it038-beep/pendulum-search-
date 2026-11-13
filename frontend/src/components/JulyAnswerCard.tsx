import React from 'react';
import { Sparkles, ExternalLink, CheckCircle2, ShieldCheck, MapPin } from 'lucide-react';
import { AIIntelligence, GeoMetadata } from '../types';
import { KnowledgeGraphCard } from './KnowledgeGraphCard';

interface JulyAnswerCardProps {
  data: AIIntelligence;
  geoMetadata?: GeoMetadata;
}

export const JulyAnswerCard: React.FC<JulyAnswerCardProps> = ({ data, geoMetadata }) => {
  if (!data || (!data.summary && (!data.key_takeaways || data.key_takeaways.length === 0) && !data.knowledge_graph_card && !data.direct_answer)) {
    return null;
  }

  const isGeoQuery = geoMetadata?.is_geo_query;

  return (
    <div className="mb-8 rounded-2xl bg-gradient-to-b from-obsidian-850 to-obsidian-900 border border-gold-400/30 p-5 shadow-gold-glow">
      {/* Knowledge Graph Card (if query matches an entity) */}
      {data.knowledge_graph_card && (
        <KnowledgeGraphCard card={data.knowledge_graph_card} />
      )}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-3 border-b border-obsidian-750">
        <div className="flex items-center space-x-2">
          <div className="p-1.5 rounded-lg bg-gold-400/10 text-gold-400 border border-gold-400/20">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-mono font-semibold tracking-wide text-gold-300">
                {data.model || 'JULY AI OVERVIEW'}
              </span>
              {isGeoQuery && (
                <span className="flex items-center space-x-1 px-1.5 py-0.2 rounded bg-gold-400/15 text-gold-400 border border-gold-400/30 text-[10px] font-mono">
                  <MapPin className="w-2.5 h-2.5" />
                  <span>GEOSPATIAL INTELLIGENCE</span>
                </span>
              )}
            </div>
            <span className="text-[10px] text-neutral-400">
              {data.direct_answer 
                ? 'Real-Time Knowledge' 
                : `Grounded in ${data.citations?.length || 0} indexed sources${geoMetadata?.target_place ? ` near ${geoMetadata.target_place}` : ''}`}
            </span>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {geoMetadata?.target_place && (
            <div className="hidden sm:flex items-center space-x-1 text-[11px] text-gold-300 bg-obsidian-950 border border-gold-400/30 px-2 py-0.5 rounded-full font-mono">
              <MapPin className="w-3 h-3 text-gold-400" />
              <span>{geoMetadata.target_place}</span>
              {geoMetadata.radius_km && <span className="text-neutral-500">({geoMetadata.radius_km} km)</span>}
            </div>
          )}
          <div className="flex items-center space-x-1 text-[11px] text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 px-2 py-0.5 rounded-full font-mono">
            <ShieldCheck className="w-3 h-3" />
            <span>Strictly Grounded</span>
          </div>
        </div>
      </div>

      {/* Direct Instant Answer Card */}
      {data.direct_answer && (
        <div className="mb-4 p-4 rounded-xl bg-obsidian-950 border border-gold-400/30 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-mono uppercase tracking-widest text-gold-400 block mb-1">
              Direct Real-Time Answer
            </span>
            <h2 className="text-2xl font-serif font-bold text-white tracking-wide">
              {data.direct_answer}
            </h2>
          </div>
        </div>
      )}

      {/* Summary */}
      {data.summary && (
        <p className="text-sm text-neutral-200 leading-relaxed font-sans mb-4 whitespace-pre-line">
          {data.summary}
        </p>
      )}

      {/* Key Takeaways */}
      {data.key_takeaways && data.key_takeaways.length > 0 && (
        <div className="mb-4 space-y-2">
          <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider block font-mono">
            Key Findings:
          </span>
          <div className="grid grid-cols-1 gap-2">
            {data.key_takeaways.map((point, idx) => (
              <div key={idx} className="flex items-start space-x-2 text-xs text-neutral-300 bg-obsidian-900/60 p-2.5 rounded-lg border border-obsidian-800">
                <CheckCircle2 className="w-3.5 h-3.5 text-gold-400 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{point}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Citations Footer */}
      {data.citations && data.citations.length > 0 && (
        <div className="pt-3 border-t border-obsidian-800 flex items-center space-x-2 overflow-x-auto scrollbar-none">
          <span className="text-[11px] text-neutral-500 font-mono shrink-0">Sources:</span>
          {data.citations.map((c) => (
            <a
              key={c.index}
              href={c.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center space-x-1.5 px-2 py-1 rounded bg-obsidian-950 border border-obsidian-750 hover:border-gold-400/40 text-[11px] text-neutral-300 hover:text-gold-300 transition-colors shrink-0"
            >
              <span className="w-3.5 h-3.5 rounded-full bg-gold-400/20 text-gold-400 font-mono text-[9px] flex items-center justify-center font-bold">
                {c.index}
              </span>
              <span className="truncate max-w-[140px]">{c.domain || c.title}</span>
              <ExternalLink className="w-2.5 h-2.5 opacity-60" />
            </a>
          ))}
        </div>
      )}
    </div>
  );
};
