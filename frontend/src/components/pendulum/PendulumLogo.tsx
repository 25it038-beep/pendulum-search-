import React from 'react';

interface PendulumLogoProps {
  variant?: 'hero' | 'compact';
  onClick?: () => void;
}

export const PendulumLogo: React.FC<PendulumLogoProps> = ({ variant = 'compact', onClick }) => {
  if (variant === 'hero') {
    return (
      <div className="flex flex-col items-center text-center select-none">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-gold-200/20 via-obsidian-900 to-obsidian-950 border border-gold-400/40 flex items-center justify-center mb-4 shadow-gold-glow">
          <svg viewBox="0 0 24 24" className="w-6 h-6 text-gold-400" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="2.5" x2="12" y2="14" />
            <circle cx="12" cy="17.5" r="3.2" fill="currentColor" stroke="none" />
            <path d="M5 5.5c2.2-1.8 11.8-1.8 14 0" opacity="0.65" />
          </svg>
        </div>
        <h1 className="font-display font-extrabold tracking-tight text-4xl sm:text-5xl md:text-6xl bg-gradient-to-b from-[#fffaf0] via-[#f0dcae] to-[#d2b477] bg-clip-text text-transparent">
          Pendulum Search
        </h1>
        <p className="mt-2.5 text-sm sm:text-base text-[#9a9da3] max-w-lg">
          Explore the web, discover knowledge and get useful answers.
        </p>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex items-center gap-2.5 text-left focus:outline-none shrink-0"
      title="Return to Pendulum Search Home"
    >
      <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-gold-200/20 via-obsidian-900 to-obsidian-950 border border-gold-400/40 group-hover:border-gold-400/75 flex items-center justify-center transition-colors shadow-gold-glow">
        <svg viewBox="0 0 24 24" className="w-4 h-4 text-gold-400" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="2.5" x2="12" y2="14" />
          <circle cx="12" cy="17.5" r="3.2" fill="currentColor" stroke="none" />
          <path d="M5 5.5c2.2-1.8 11.8-1.8 14 0" opacity="0.65" />
        </svg>
      </div>
      <div className="hidden sm:flex flex-col leading-none">
        <span className="font-display font-bold text-[15px] tracking-tight text-[#f3f0e9] group-hover:text-gold-200 transition-colors">
          Pendulum
        </span>
        <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-[#9a9da3]">
          Search
        </span>
      </div>
    </button>
  );
};
