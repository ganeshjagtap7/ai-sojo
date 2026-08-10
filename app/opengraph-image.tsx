import { ImageResponse } from 'next/og';

// Social share preview image (1200×630). Next wires up og:image + twitter:image
// automatically from this file.
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Searcher — A thesis in four minutes';

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: '#FAF7F0',
          padding: 80,
          fontFamily: 'Georgia, serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, fontSize: 30, letterSpacing: 2, color: '#0E0E0C' }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 12,
              background: '#14120E',
              color: '#EFE9DB',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontStyle: 'italic',
              fontSize: 30,
            }}
          >
            S
          </div>
          SEARCHER AI
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          <div style={{ fontSize: 74, lineHeight: 1.05, color: '#0E0E0C', maxWidth: 980 }}>
            An investment committee that thinks in targets, not decks.
          </div>
          <div style={{ fontSize: 30, color: 'rgba(14,14,12,0.68)', maxWidth: 900 }}>
            A working thesis and ten companies you could call Monday morning.
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
