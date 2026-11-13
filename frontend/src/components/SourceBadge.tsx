import React from 'react';
import { Shield, Sparkles, ExternalLink, Radio, Database } from 'lucide-react';
import { SourceType } from '../types';

interface SourceBadgeProps {
  sourceType?: SourceType | string;
  sourceProvider?: string;
  sourceAttribution?: string;
  originalPublisher?: string;
}

export const SourceBadge: React.FC<SourceBadgeProps> = ({
  sourceType = 'hs_indexed',
  sourceProvider,
  sourceAttribution,
  originalPublisher
}) => {
  // Normalize source type
  const normalizedType: SourceType = 
    sourceType === 'external_partner' ? 'external_partner' :
    sourceType === 'public_dataset' ? 'public_dataset' :
    sourceType === 'live_source' ? 'live_source' : 'hs_indexed';

  return (
    <div className="inline-flex items-center space-x-1.5 text-[10px] font-mono">
      {normalizedType === 'hs_indexed' && (
        <span 
          className="flex items-center space-x-1 px-2 py-0.5 rounded-full bg-gold-400/15 text-gold-300 border border-gold-400/30 font-semibold"
          title={sourceAttribution || 'Independently discovered and indexed by HS MegaCrawler'}
        >
          <Shield className="w-2.5 h-2.5 text-gold-400" />
          <span>HS INDEPENDENT</span>
        </span>
      )}

      {normalizedType === 'external_partner' && (
        <span 
          className="flex items-center space-x-1 px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 font-medium"
          title={sourceAttribution || 'Supplemental result from licensed external partner API'}
        >
          <ExternalLink className="w-2.5 h-2.5 text-indigo-400" />
          <span>EXTERNAL PARTNER</span>
          {sourceProvider && <span className="text-neutral-400">• {sourceProvider}</span>}
        </span>
      )}

      {normalizedType === 'public_dataset' && (
        <span 
          className="flex items-center space-x-1 px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-medium"
          title={sourceAttribution || 'Open research or public repository dataset'}
        >
          <Database className="w-2.5 h-2.5 text-cyan-400" />
          <span>PUBLIC DATASET</span>
          {originalPublisher && <span className="text-neutral-400">• {originalPublisher}</span>}
        </span>
      )}

      {normalizedType === 'live_source' && (
        <span 
          className="flex items-center space-x-1 px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-300 border border-rose-500/30 font-bold"
          title={sourceAttribution || 'Real-time sensor, weather, clock or live RSS feed'}
        >
          <Radio className="w-2.5 h-2.5 text-rose-400 animate-pulse" />
          <span>LIVE PULSE</span>
        </span>
      )}
    </div>
  );
};
