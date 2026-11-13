import React, { useEffect, useState } from 'react';
import { Radio, ExternalLink } from 'lucide-react';
import { fetchLiveStreamAPI } from '../services/api';

export const LiveFeedTicker: React.FC = () => {
  const [events, setEvents] = useState<any[]>([]);

  useEffect(() => {
    const updateEvents = async () => {
      const items = await fetchLiveStreamAPI();
      setEvents(items);
    };

    updateEvents();
    const interval = setInterval(updateEvents, 4000);
    return () => clearInterval(interval);
  }, []);

  if (events.length === 0) return null;

  return (
    <div className="bg-obsidian-900/90 border-y border-obsidian-800 py-1.5 px-4 mb-6 overflow-hidden">
      <div className="max-w-7xl mx-auto flex items-center space-x-3 text-xs">
        <div className="flex items-center space-x-1.5 text-rose-400 font-mono font-bold shrink-0">
          <Radio className="w-3.5 h-3.5 animate-pulse text-rose-400" />
          <span>HS LIVE:</span>
        </div>
        <div className="flex items-center space-x-6 overflow-x-auto scrollbar-none whitespace-nowrap">
          {events.slice(0, 8).map((evt, idx) => (
            <a
              key={idx}
              href={evt.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center space-x-1.5 text-neutral-300 hover:text-gold-300 transition-colors group shrink-0"
            >
              <span className="text-gold-400 font-mono text-[11px]">[{evt.feed_name || evt.domain}]</span>
              <span className="truncate max-w-[280px]">{evt.title}</span>
              <ExternalLink className="w-2.5 h-2.5 opacity-40 group-hover:opacity-100" />
            </a>
          ))}
        </div>
      </div>
    </div>
  );
};
