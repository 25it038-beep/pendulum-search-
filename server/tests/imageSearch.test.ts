import test from 'node:test';
import assert from 'node:assert/strict';
import {
  imageSearchProvider,
  normalizeAndRankDuckDuckGoImages,
  parseBingImagesAsyncHtml
} from '../providers/mediaProviders';

test('1. normalizeAndRankDuckDuckGoImages deduplicates, blocks local URLs, and ranks relevant high-res results first', () => {
  const raw = [
    {
      title: 'Unrelated icon',
      image: 'https://example.org/icon.png',
      thumbnail: 'https://tse1.mm.bing.net/th?id=icon',
      url: 'https://example.org/about',
      width: 64,
      height: 64,
      encoding_format: 'png'
    },
    {
      title: 'Blocked local image',
      image: 'http://127.0.0.1/secret.jpg',
      thumbnail: 'http://127.0.0.1/thumb.jpg',
      url: 'http://localhost/admin',
      width: 800,
      height: 600
    },
    {
      title: 'RMK Engineering College Main Campus Building',
      image: 'http://rmkec.ac.in/cam/data/images1/cse.jpg',
      thumbnail: 'https://tse3.mm.bing.net/th/id/OIP.swCXPQo6OrAZYJsvzlnzjwHaFk?r=0&pid=Api',
      url: 'https://www.rmkec.ac.in/cam/build.html',
      width: 1024,
      height: 768,
      encoding_format: 'jpeg'
    },
    {
      title: 'Duplicate campus entry',
      image: 'http://rmkec.ac.in/cam/data/images1/cse.jpg/',
      thumbnail: 'https://tse3.mm.bing.net/th/id/OIP.dup',
      url: 'https://www.rmkec.ac.in/cam/build.html',
      width: 1024,
      height: 768
    }
  ];

  const ranked = normalizeAndRankDuckDuckGoImages(raw, 'RMK Engineering College');
  assert.equal(ranked.length, 2);
  assert.equal(ranked[0].sourceProvider, 'DuckDuckGo');
  assert.equal(ranked[0].provider, 'DuckDuckGo');
  assert.equal(ranked[0].domain, 'rmkec.ac.in');
  assert.ok(ranked[0].thumbnailUrl.startsWith('https://'));
  assert.equal(ranked[0].title, 'RMK Engineering College Main Campus Building');
});

test('2. parseBingImagesAsyncHtml extracts image URLs, thumbnails, domains, and expw/exph dimensions', () => {
  const sampleHtml = `
    <a class="iusc" style="height:180px" m="{&quot;purl&quot;:&quot;https://www.rmkec.ac.in/cam/build.html&quot;,&quot;murl&quot;:&quot;http://rmkec.ac.in/cam/data/images1/gate.jpg&quot;,&quot;turl&quot;:&quot;https://ts1.mm.bing.net/th?id=OIP.test&quot;,&quot;t&quot;:&quot;RMK Engineering College Gate&quot;}" href="/images/search?view=detailV2&amp;exph=720&amp;expw=1280&amp;q=RMK"></a>
  `;
  const parsed = parseBingImagesAsyncHtml(sampleHtml, 'RMK Engineering College');
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].domain, 'rmkec.ac.in');
  assert.equal(parsed[0].width, 1280);
  assert.equal(parsed[0].height, 720);
  assert.equal(parsed[0].sourceProvider, 'Bing Web Index');
  assert.ok(parsed[0].thumbnailUrl.startsWith('https://'));
});

test('3. imageSearchProvider live search returns web image results for RMK Engineering College', async () => {
  const res = await imageSearchProvider.search('RMK Engineering College', { limit: 12 });
  assert.ok(res.items.length >= 8, `Expected >= 8 images, got ${res.items.length}`);
  const webCount = res.items.filter(
    (i) => i.sourceProvider === 'DuckDuckGo' || i.sourceProvider === 'Bing Web Index'
  ).length;
  assert.ok(webCount >= 6, `Expected >= 6 DDG/Web Index images, got ${webCount}`);
  for (const item of res.items) {
    assert.ok(item.thumbnailUrl.startsWith('http'));
    assert.ok(item.originalUrl.startsWith('http'));
    assert.ok(item.domain.length > 2);
  }
});

test('4. imageSearchProvider respects landscape orientation filter using image dimensions', async () => {
  const res = await imageSearchProvider.search('Quantum computing', {
    limit: 10,
    orientation: 'landscape'
  });
  assert.ok(res.items.length >= 4, `Expected >= 4 landscape images, got ${res.items.length}`);
  for (const item of res.items) {
    assert.ok(item.width && item.height, 'Expected width & height on orientation-filtered image');
    assert.ok((item.width || 0) / (item.height || 1) > 1.1, 'Expected landscape ratio > 1.1');
  }
});
