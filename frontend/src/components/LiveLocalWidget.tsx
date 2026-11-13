import React from 'react';
import { LiveLocalInfo } from '../types';
import { CloudSun, Wind, Droplets, Activity, Radio, AlertTriangle, Train, Clock, ShieldCheck } from 'lucide-react';

interface LiveLocalWidgetProps {
  info: LiveLocalInfo;
}

export const LiveLocalWidget: React.FC<LiveLocalWidgetProps> = ({ info }) => {
  if (!info || !info.city) return null;

  const weather = info.weather;
  const transit = info.transit_updates;
  const announcements = info.announcements;

  return (
    <div className="mb-6 rounded-2xl bg-gradient-to-r from-obsidian-900 via-obsidian-900 to-obsidian-850 border border-gold-400/30 p-4 shadow-gold-glow">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-3 border-b border-obsidian-800">
        <div className="flex items-center space-x-2">
          <div className="flex items-center space-x-1.5 px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-400 border border-rose-500/30 text-[10px] font-mono font-bold tracking-wider">
            <Radio className="w-3 h-3 animate-pulse" />
            <span>LIVE LOCAL PULSE</span>
          </div>
          <span className="font-serif font-bold text-white text-sm tracking-wide">
            {info.city}
          </span>
        </div>

        <div className="flex items-center space-x-2 text-[10px] font-mono text-neutral-400">
          <Clock className="w-3 h-3 text-gold-400/80" />
          <span>Checked: {info.freshness_label || 'Just now'}</span>
          <span className="text-neutral-600">•</span>
          <span className="text-neutral-500">{new Date(info.retrieved_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
      </div>

      {/* Grid: Weather + Transit + Announcements */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Weather Card */}
        {weather && (
          <div className="p-3 rounded-xl bg-obsidian-950/70 border border-obsidian-800/80 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-mono uppercase text-neutral-400 tracking-wider">
                Current Weather
              </span>
              <CloudSun className="w-4 h-4 text-amber-300" />
            </div>

            <div className="flex items-baseline space-x-2 mb-2">
              <span className="text-2xl font-serif font-bold text-white">
                {weather.temperature_c}°C
              </span>
              <span className="text-xs text-neutral-300 font-medium">
                {weather.condition}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-1 pt-2 border-t border-obsidian-800/60 text-[10px] font-mono text-neutral-400">
              <div className="flex items-center space-x-1">
                <Droplets className="w-3 h-3 text-cyan-400/70" />
                <span>{weather.humidity_percent}%</span>
              </div>
              <div className="flex items-center space-x-1">
                <Wind className="w-3 h-3 text-neutral-400" />
                <span>{weather.wind_kmh} km/h</span>
              </div>
              <div className="flex items-center space-x-1">
                <Activity className="w-3 h-3 text-emerald-400" />
                <span className="text-emerald-400">AQI {weather.air_quality_index}</span>
              </div>
            </div>
          </div>
        )}

        {/* Transit Status Card */}
        {transit && transit.length > 0 && (
          <div className="p-3 rounded-xl bg-obsidian-950/70 border border-obsidian-800/80">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-mono uppercase text-neutral-400 tracking-wider">
                Public Transit
              </span>
              <Train className="w-4 h-4 text-gold-400" />
            </div>

            <div className="space-y-1.5 max-h-[85px] overflow-y-auto scrollbar-none">
              {transit.map((t, idx) => (
                <div key={idx} className="flex items-center justify-between text-xs font-mono">
                  <span className="text-neutral-300 truncate max-w-[140px]">{t.line}</span>
                  <span className={`px-1.5 py-0.2 rounded text-[10px] ${
                    t.status === 'On Time' || t.status === 'Normal' 
                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' 
                      : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                  }`}>
                    {t.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Local Advisories / Civic Announcements */}
        {announcements && announcements.length > 0 && (
          <div className="p-3 rounded-xl bg-obsidian-950/70 border border-obsidian-800/80">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-mono uppercase text-neutral-400 tracking-wider">
                Local Bulletins
              </span>
              <AlertTriangle className="w-4 h-4 text-amber-400" />
            </div>

            <div className="space-y-1.5 max-h-[85px] overflow-y-auto scrollbar-none">
              {announcements.map((a, idx) => (
                <div key={idx} className="text-[11px] text-neutral-300">
                  <p className="line-clamp-2 leading-tight font-medium hover:text-gold-300">
                    {a.title}
                  </p>
                  <span className="text-[9px] font-mono text-neutral-500">
                    {a.source}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
