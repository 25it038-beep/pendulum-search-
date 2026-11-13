import React, { useState } from 'react';
import { ExternalLink, Maximize2, X } from 'lucide-react';
import { SearchResultItem, ImageItem } from '../types';

interface ImageGridProps {
  results: SearchResultItem[];
}

export const ImageGrid: React.FC<ImageGridProps> = ({ results }) => {
  const [activeImage, setActiveImage] = useState<{ img: ImageItem; item: SearchResultItem } | null>(null);

  // Flatten all images from results
  const allImages: { img: ImageItem; item: SearchResultItem }[] = [];
  results.forEach(item => {
    (item.images || []).forEach(img => {
      allImages.push({ img, item });
    });
  });

  if (allImages.length === 0) {
    return (
      <div className="py-16 text-center text-neutral-400">
        <p className="text-sm">No images found for this query in the current index.</p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 mb-8">
        {allImages.map((entry, idx) => (
          <div
            key={idx}
            onClick={() => setActiveImage(entry)}
            className="group relative rounded-xl overflow-hidden bg-obsidian-900 border border-obsidian-800 hover:border-gold-400/50 hover:shadow-gold-glow transition-all cursor-pointer aspect-square flex flex-col"
          >
            <img
              src={entry.img.src}
              alt={entry.img.alt}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              loading="lazy"
              onError={(e) => {
                (e.target as HTMLElement).parentElement!.style.display = 'none';
              }}
            />
            {/* Overlay Info */}
            <div className="absolute inset-x-0 bottom-0 p-2.5 bg-gradient-to-t from-obsidian-950/90 via-obsidian-950/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
              <p className="text-xs font-medium text-white truncate">{entry.img.alt || entry.item.title}</p>
              <p className="text-[10px] text-gold-300 font-mono truncate">{entry.item.domain}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Lightbox Modal */}
      {activeImage && (
        <div 
          className="fixed inset-0 z-50 bg-obsidian-950/90 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setActiveImage(null)}
        >
          <div 
            className="relative max-w-4xl max-h-[90vh] bg-obsidian-900 border border-gold-400/30 rounded-2xl p-4 overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setActiveImage(null)}
              className="absolute top-4 right-4 p-2 rounded-lg bg-obsidian-800 text-neutral-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="flex-1 overflow-auto flex items-center justify-center mb-4">
              <img
                src={activeImage.img.src}
                alt={activeImage.img.alt}
                className="max-h-[70vh] rounded-lg object-contain"
              />
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-obsidian-800">
              <div>
                <h3 className="text-sm font-semibold text-white">{activeImage.img.alt || activeImage.item.title}</h3>
                <p className="text-xs text-neutral-400">{activeImage.item.domain}</p>
              </div>
              <a
                href={activeImage.item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-gold-400 text-obsidian-950 text-xs font-semibold hover:brightness-110"
              >
                <span>Visit Page</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
