import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseYouTubeSearchHtml,
  scoreAndRankVideos,
  videoSearchProvider,
  type VideoSearchItem
} from '../providers/mediaProviders';

test('1. parseYouTubeSearchHtml extracts ytInitialData videoRenderer metadata cleanly', () => {
  const sampleHtml = `
    <html><body><script>var ytInitialData = ${JSON.stringify({
      contents: {
        twoColumnSearchResultsRenderer: {
          primaryContents: {
            sectionListRenderer: {
              contents: [
                {
                  itemSectionRenderer: {
                    contents: [
                      {
                        videoRenderer: {
                          videoId: 'RQWpF2Gb-gU',
                          title: { runs: [{ text: "But what is quantum computing? (Grover's Algorithm)" }] },
                          ownerText: { runs: [{ text: '3Blue1Brown' }] },
                          ownerBadges: [{ metadataBadgeRenderer: { style: 'BADGE_STYLE_TYPE_VERIFIED' } }],
                          lengthText: { simpleText: '36:54' },
                          viewCountText: { simpleText: '4,260,259 views' },
                          shortViewCountText: { simpleText: '4.2M views' },
                          publishedTimeText: { simpleText: '1 year ago' },
                          detailedMetadataSnippets: [
                            { snippetText: { runs: [{ text: 'Visual explanation of quantum computing and qubits.' }] } }
                          ],
                          thumbnail: {
                            thumbnails: [{ url: 'https://i.ytimg.com/vi/RQWpF2Gb-gU/hq720.jpg' }]
                          }
                        }
                      }
                    ]
                  }
                }
              ]
            }
          }
        }
      }
    })};</script></body></html>
  `;

  const parsed = parseYouTubeSearchHtml(sampleHtml);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].videoId, 'RQWpF2Gb-gU');
  assert.equal(parsed[0].channel, '3Blue1Brown');
  assert.equal(parsed[0].verifiedChannel, true);
  assert.equal(parsed[0].duration, '36:54');
  assert.equal(parsed[0].durationSec, 36 * 60 + 54);
  assert.equal(parsed[0].viewCount, 4260259);
  assert.equal(parsed[0].views, '4.2M views');
});

test('2. scoreAndRankVideos prioritizes relevant YouTube results and filters out unrelated non-YouTube noise', () => {
  const candidates: VideoSearchItem[] = [
    {
      id: 'wm-noise',
      title: 'Computing office desk setup timelapse',
      description: 'Random timelapse desk footage.',
      url: 'https://commons.wikimedia.org/wiki/File:Desk.webm',
      watchUrl: 'https://commons.wikimedia.org/wiki/File:Desk.webm',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Desk.webm',
      domain: 'commons.wikimedia.org',
      sourceDomain: 'commons.wikimedia.org',
      publisher: 'Random',
      playerType: 'html5',
      embedType: 'html5',
      mediaUrl: 'https://upload.wikimedia.org/desk.webm',
      sourceProvider: 'Wikimedia Commons'
    },
    {
      id: 'yt-short-low',
      title: 'Quantum computing joke #shorts',
      description: 'Quick meme.',
      url: 'https://www.youtube.com/watch?v=aaaaaaaaaaa',
      watchUrl: 'https://www.youtube.com/watch?v=aaaaaaaaaaa',
      sourceUrl: 'https://www.youtube.com/watch?v=aaaaaaaaaaa',
      domain: 'youtube.com',
      sourceDomain: 'youtube.com',
      publisher: 'MemeChannel',
      playerType: 'youtube',
      embedType: 'youtube',
      embedUrl: 'https://www.youtube-nocookie.com/embed/aaaaaaaaaaa?autoplay=1&rel=0',
      duration: '0:25',
      durationSec: 25,
      viewCount: 500,
      verifiedChannel: false,
      embedAllowed: true,
      sourceProvider: 'YouTube',
      _origRank: 5
    },
    {
      id: 'yt-best',
      title: 'Quantum Computing Explained Clearly',
      description: 'Full lecture on quantum computing gates and algorithms.',
      url: 'https://www.youtube.com/watch?v=bbbbbbbbbbb',
      watchUrl: 'https://www.youtube.com/watch?v=bbbbbbbbbbb',
      sourceUrl: 'https://www.youtube.com/watch?v=bbbbbbbbbbb',
      domain: 'youtube.com',
      sourceDomain: 'youtube.com',
      publisher: 'Verified Science',
      playerType: 'youtube',
      embedType: 'youtube',
      embedUrl: 'https://www.youtube-nocookie.com/embed/bbbbbbbbbbb?autoplay=1&rel=0',
      duration: '22:10',
      durationSec: 1330,
      viewCount: 2500000,
      verifiedChannel: true,
      embedAllowed: true,
      sourceProvider: 'YouTube',
      _origRank: 0
    }
  ];

  const ranked = scoreAndRankVideos(candidates, 'quantum computing', 10);
  assert.equal(ranked[0].id, 'yt-best');
  assert.equal(ranked.some((r) => r.id === 'wm-noise'), false, 'Unrelated Wikimedia clip missing "quantum" must be filtered out');
});

test('3. Live VideoSearchProvider retrieves YouTube videos with canonical embed & player fields', async () => {
  const res = await videoSearchProvider.search('Quantum computing', 8);
  assert.ok(res.items.length > 0, 'Expected video search results');
  const ytItems = res.items.filter((v) => v.playerType === 'youtube');
  assert.ok(ytItems.length >= 3, `Expected >=3 YouTube videos, got ${ytItems.length}`);
  assert.ok(ytItems[0].embedUrl?.includes('youtube-nocookie.com/embed/'), 'YouTube result must expose official embedUrl');
  assert.ok(ytItems[0].watchUrl?.startsWith('https://www.youtube.com/watch?v='), 'YouTube result must expose watchUrl');
  assert.equal(ytItems[0].sourceProvider, 'YouTube');
});
