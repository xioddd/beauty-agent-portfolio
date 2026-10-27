import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = fileURLToPath(new URL('../', import.meta.url));
const imageRoot = resolve(appRoot, process.env.ASSET_ROOT || '../../multimodal_assets');
const outputDir = join(imageRoot, 'official');
const manifestPath = join(imageRoot, 'official_crawl_manifest.json');
const pages = [
  { url: 'https://www.proya.com/home', kind: 'official_home' },
  { url: 'https://www.proya.com/star-products', kind: 'official_product_page' },
  { url: 'https://www.proya.com/brand-story', kind: 'official_brand_page' },
];
const userAgent = 'ProyaBeautyWorkbench/0.1 (+official-public-source-research)';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const decodeEscapedUrl = value => value
  .replaceAll('\\u002F', '/')
  .replaceAll('\\/', '/')
  .replaceAll('&amp;', '&');

async function fetchText(url) {
  const response = await fetch(url, { headers: { 'user-agent': userAgent }, redirect: 'follow' });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
  return response.text();
}

function titleFromHtml(html) {
  return html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, ' ').trim() || '珀莱雅官方公开页面';
}

function mediaUrlsFromHtml(html) {
  const matches = [...html.matchAll(/cdn-www\.proya\.com.{0,400}?\.(?:jpg|jpeg|png|webp|mp4)/gi)];
  return [...new Set(matches.map(match => {
    const decoded = decodeEscapedUrl(match[0]).replace(/["'<>\\].*$/, '');
    return `https://${decoded}`;
  }).filter(url => url.includes('cdn-www.proya.com')))].slice(0, 18);
}

function assetId(url, index) {
  const slug = basename(new URL(url).pathname).replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
  return `proya-official-${index + 1}-${slug || 'media'}`;
}

await mkdir(outputDir, { recursive: true });
const robotsUrl = 'https://www.proya.com/robots.txt';
const robots = await fetchText(robotsUrl);
const globalRobotsRules = robots.split(/User-agent:\s*CCBot/i)[0];
if (/^Disallow:\s*\/\s*$/im.test(globalRobotsRules)) throw new Error('robots.txt disallows the site root');

const records = [];
for (const page of pages) {
  const html = await fetchText(page.url);
  const capturedAt = new Date().toISOString();
  const title = titleFromHtml(html);
  records.push({
    sourceType: 'official_page',
    pageKind: page.kind,
    sourceUrl: page.url,
    sourceTitle: title,
    capturedAt,
    robotsUrl,
    extraction: 'HTML metadata and publicly referenced CDN media URLs',
    rightsNote: '公开官方页面素材；未声明开放许可，商用或发布前需确认珀莱雅授权。',
    officialClaimsOnly: true,
  });
  const urls = mediaUrlsFromHtml(html);
  for (const [index, mediaUrl] of urls.entries()) {
    const id = assetId(mediaUrl, index);
    const extension = new URL(mediaUrl).pathname.match(/\.(jpg|jpeg|png|webp|mp4)$/i)?.[1]?.toLowerCase() || 'bin';
    const localPath = join(outputDir, `${id}.${extension}`);
    let downloaded = false;
    try {
      const response = await fetch(mediaUrl, { headers: { 'user-agent': userAgent }, redirect: 'follow' });
      if (response.ok) {
        const bytes = new Uint8Array(await response.arrayBuffer());
        await writeFile(localPath, bytes);
        downloaded = bytes.byteLength > 0;
      }
    } catch {
      // Keep the source URL even when a CDN rejects a non-browser download.
    }
    records.push({
      assetId: id,
      type: extension === 'mp4' ? 'video' : 'image',
      subtype: /红宝石面霜|面霜/.test(decodeURIComponent(mediaUrl)) ? 'product' : 'official_media',
      product: /红宝石面霜/.test(decodeURIComponent(mediaUrl)) ? '珀莱雅红宝石面霜' : '珀莱雅官方素材',
      searchText: extension === 'mp4'
        ? `珀莱雅官方公开品牌视频 短视频 品牌影像 ${decodeURIComponent(basename(new URL(mediaUrl).pathname))}`
        : `珀莱雅官方公开图片素材 ${decodeURIComponent(basename(new URL(mediaUrl).pathname))}`,
      sourceUrl: page.url,
      sourceTitle: title,
      mediaUrl,
      capturedAt,
      localPath: downloaded ? `multimodal_assets/official/${basename(localPath)}` : '',
      downloadStatus: downloaded ? 'downloaded' : 'metadata_only',
      rightsStatus: 'official_source_review_required',
      rightsNote: '公开官方页面素材；未声明开放许可，商用或发布前需确认珀莱雅授权。',
      confidence: 0.96,
    });
    await sleep(250);
  }
  await sleep(700);
}

await mkdir(dirname(manifestPath), { recursive: true });
await writeFile(manifestPath, JSON.stringify({
  schemaVersion: '0.2',
  generatedAt: new Date().toISOString(),
  scope: '珀莱雅官网公开页面及其公开 CDN 媒体引用',
  robots: { url: robotsUrl, checked: true, note: '允许根路径抓取；遵守合理频率。' },
  sources: records.filter(record => record.sourceType === 'official_page'),
  assets: records.filter(record => record.assetId),
}, null, 2));

console.log(JSON.stringify({ manifestPath, pages: pages.length, assets: records.filter(record => record.assetId).length }, null, 2));
