import React from 'react';
import { Network, ExternalLink, Cpu, Building2, User, Box, Lightbulb } from 'lucide-react';
import { KnowledgeGraphCard as KGCardType } from '../types';

interface KnowledgeGraphCardProps {
  card: KGCardType;
}

export const KnowledgeGraphCard: React.FC<KnowledgeGraphCardProps> = ({ card }) => {
  if (!card) return null;

  const getTypeIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case 'person': return <User className="w-3.5 h-3.5 text-gold-400" />;
      case 'company':
      case 'organization': return <Building2 className="w-3.5 h-3.5 text-gold-400" />;
      case 'product': return <Box className="w-3.5 h-3.5 text-gold-400" />;
      case 'technology': return <Cpu className="w-3.5 h-3.5 text-gold-400" />;
      default: return <Lightbulb className="w-3.5 h-3.5 text-gold-400" />;
    }
  };

  return (
    <div className="mb-6 p-4 rounded-2xl bg-gradient-to-r from-obsidian-900 via-obsidian-850 to-obsidian-900 border border-gold-400/40 shadow-gold-glow">
      <div className="flex items-center justify-between pb-2 mb-3 border-b border-obsidian-750">
        <div className="flex items-center space-x-2">
          <div className="p-1 rounded-lg bg-gold-400/20 border border-gold-400/30">
            <Network className="w-4 h-4 text-gold-300" />
          </div>
          <span className="text-[11px] font-mono uppercase tracking-widest text-gold-400 font-bold">
            HS Knowledge Graph Entity
          </span>
        </div>
        <div className="flex items-center space-x-1.5 px-2 py-0.5 rounded-full bg-obsidian-950 border border-obsidian-750 text-[10px] font-mono text-neutral-300 capitalize">
          {getTypeIcon(card.entity_type)}
          <span>{card.entity_type}</span>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-3">
        <div>
          <h2 className="text-xl font-serif font-bold text-white tracking-wide mb-1">
            {card.name}
          </h2>
          {card.description && (
            <p className="text-xs text-neutral-300 leading-relaxed font-sans">
              {card.description}
            </p>
          )}
        </div>

        {card.source_url && (
          <a
            href={card.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center space-x-1 text-xs text-gold-300 hover:text-gold-200 shrink-0 self-start mt-1"
          >
            <span>Verified Record</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>

      {/* Relations Subgraph */}
      {card.relations && card.relations.length > 0 && (
        <div className="pt-3 border-t border-obsidian-800">
          <span className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest block mb-2">
            Connected Knowledge Relationships:
          </span>
          <div className="flex flex-wrap gap-2">
            {card.relations.map((rel, idx) => (
              <div
                key={idx}
                className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-obsidian-950 border border-obsidian-750 text-xs"
              >
                <span className="text-[10px] font-mono font-bold text-gold-400">
                  {rel.type}
                </span>
                <span className="text-neutral-400">→</span>
                <span className="font-semibold text-neutral-200">
                  {rel.target}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
