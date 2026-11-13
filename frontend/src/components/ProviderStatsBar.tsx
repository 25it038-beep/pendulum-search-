import React, { useState } from 'react';
import { Layers, ChevronDown, ChevronUp, CheckCircle, ShieldCheck, Zap, Activity } from 'lucide-react';
import { ProviderStats } from '../types';

interface ProviderStatsBarProps {
  sourcesUsed?: string[];
  providerStats?: ProviderStats;
  queryIntent?: string;
  queryComplexity?: string;
  executionTimeMs?: number;
}

export const ProviderStatsBar: React.FC<ProviderStatsBarProps> = ({
  sourcesUsed = [],
  providerStats = {},
  queryIntent = 'general',
  queryComplexity = 'low',
  executionTimeMs = 0
}) => {
  const [expanded, setExpanded] = useState(false);

  const providerCount = Object.keys(providerStats).length;
  if (providerCount === 0 && sourcesUsed.length === 0) return null;

  return (
    <div className="mb-4 rounded-xl bg-obsidian-900/60 border border-obsidian-800 p-2.5 text-xs font-mono">
      {/* Top Summary Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center space-x-2">
          <div className="flex items-center space-x-1.5 px-2 py-0.5 rounded-full bg-gold-400/10 text-gold-300 border border-gold-400/20 text-[10px]">
            <Layers className="w-3 h-3 text-gold-400" />
            <span>HYBRID AGGREGATOR</span>
          </div>

          {/* Query Intent Badge */}
          <span className="capitalize px-2 py-0.5 rounded bg-obsidian-850 text-neutral-300 border border-obsidian-750 text-[10px]">
            Intent: <strong className="text-white">{queryIntent}</strong>
          </span>

          {/* Complexity Badge */}
          <span className="capitalize px-1.5 py-0.5 rounded bg-obsidian-950 text-neutral-400 text-[10px]">
            {queryComplexity} complexity
          </span>
        </div>

        {/* Right side: Active providers pills + toggle */}
        <div className="flex items-center space-x-2">
          <div className="hidden sm:flex items-center space-x-1.5">
            {sourcesUsed.map((src, idx) => (
              <span 
                key={idx}
                className="px-1.5 py-0.2 rounded bg-obsidian-950 border border-obsidian-750 text-neutral-400 text-[9px] flex items-center space-x-1"
              >
                <CheckCircle className="w-2.5 h-2.5 text-emerald-400" />
                <span>{src}</span>
              </span>
            ))}
          </div>

          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center space-x-1 text-[10px] text-neutral-400 hover:text-gold-300 transition-colors px-1.5 py-0.5 rounded hover:bg-obsidian-850"
            title="Toggle Provider Telemetry Details"
          >
            <span>{providerCount} Sources</span>
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </div>
      </div>

      {/* Expanded Telemetry Drawer */}
      {expanded && (
        <div className="mt-2.5 pt-2 border-t border-obsidian-800 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
          {Object.entries(providerStats).map(([name, stat], idx) => {
            const isOk = stat.status === 'ok';
            return (
              <div 
                key={idx} 
                className="p-2 rounded-lg bg-obsidian-950 border border-obsidian-800 flex items-center justify-between text-[11px]"
              >
                <span className="text-neutral-300 truncate max-w-[150px]">{name}</span>
                <div className="flex items-center space-x-1.5">
                  <span className="text-neutral-500 font-mono">{stat.count} items</span>
                  <span className={`w-2 h-2 rounded-full ${isOk ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
