import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, relative, resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const imageRoot = resolve(root, process.env.ASSET_ROOT || '../../multimodal_assets');
const manifestFiles = [
  join(imageRoot, 'official_crawl_manifest.json'),
  join(imageRoot, 'asset_knowledge_base_manifest.json'),
];
const imageManifestFile = join(imageRoot, 'image_knowledge_manifest.json');
const allowedOrigins = new Set((process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173')
  .split(',').map(value => value.trim()).filter(Boolean));
const maxChatPerHour = Number(process.env.CHAT_LIMIT_PER_HOUR || 30);
const maxConcurrentChats = Number(process.env.CHAT_MAX_CONCURRENT || 2);
let chatWindowStart = Date.now();
let chatRequests = 0;
let activeChats = 0;
const fallback = { assets: [], sources: [] };
const platforms = ['小红书', '抖音', '天猫'];

function planCard(id, lane, kind, title, subtitle, body, status) {
  return { id, lane, kind, title, subtitle, body, time: status };
}

function platformFromPrompt(prompt, fallbackPlatform) {
  if (/抖音/.test(prompt)) return '抖音';
  if (/天猫|淘宝/.test(prompt)) return '天猫';
  if (/小红书/.test(prompt)) return '小红书';
  return platforms.includes(fallbackPlatform) ? fallbackPlatform : '小红书';
}

function generatePlan({ scenario, prompt, platform }) {
  const product = planCard('product', '新品 Brief', '产品', '珀莱雅红宝石面霜', '产品信息', '版本、备案功效与官方卖点需绑定品牌资料后确认。', '来源待接入');
  const sku = planCard('sku', '新品 Brief', 'SKU / 版本', 'SKU 与版本', '避免版本混用', '红宝石面霜 4.0（演示输入，发布前核对）', '版本待官方确认');
  const audience = planCard('audience', '新品 Brief', '人群', '目标人群', '用户需求与顾虑', '30+ 油敏肌女性；关注日常抗皱护理和轻薄肤感。', '示例信息');
  const proof = planCard('proof', '新品 Brief', '依据', '卖点依据', '产品事实及溯源', '关联备案信息、官方产品资料或可核验来源；不生成未经核实的功效承诺。', '来源待绑定');
  const goal = /转化|下单|商品页/.test(prompt) ? '转化' : '种草';
  const platformCard = planCard('platform', '内容策略', '平台', '目标平台', '渠道与内容形态', platform, '预览同步');
  const goalCard = planCard('goal', '内容策略', '目标', '内容目标', '本次沟通目的', goal, '策略设置');
  const campaignText = /双11|双十一/.test(prompt)
    ? '双11预热；权益、价格和活动机制以官方活动页为准。'
    : '活动信息待补充；请提供时间、权益及官方规则。';
  const campaign = planCard('campaign', '内容策略', '活动', '活动信息', '节点与权益', campaignText, '官方规则待核实');
  const tone = /专业|可信/.test(prompt) ? '专业可信' : '生活化表达';
  const angle = planCard('angle', '内容策略', '表达', '内容语气', '语气将联动正文', tone, '策略设置');
  const formatText = platform === '抖音' ? '短视频脚本' : platform === '天猫' ? '商品详情页' : '图文笔记';
  const format = planCard('format', '内容创作', '形式', '内容形式', '随目标平台适配', formatText, '平台适配');
  const headlineText = platform === '抖音'
    ? '30+油敏肌挑面霜，先别忽略自己的肤感'
    : platform === '天猫'
      ? '珀莱雅红宝石面霜｜产品信息与使用参考'
      : '30+油敏肌的秋冬面霜功课：先确认版本再看肤感';
  const headline = planCard('headline', '内容创作', '文案', '发布标题', '同步到平台预览', headlineText, '可编辑标题');
  const copyText = platform === '抖音'
    ? '开场：30+油敏肌挑面霜，先别只看热门推荐。\n内容：先核对产品版本和官方说明，再结合自己的肤质、习惯与实际肤感做判断。\n收尾：具体信息请以品牌官方资料为准。'
    : platform === '天猫'
      ? '产品信息：珀莱雅红宝石面霜（版本请以所选 SKU 与官方商品页为准）。\n适用参考：结合自身肤质和护理需求选择。\n产品卖点、规格和活动机制以官方商品页为准。'
      : '最近在做秋冬面霜功课，我会先确认产品版本，再结合自己的肤质和日常护理习惯慢慢挑。具体产品信息与功效表达，以品牌官方资料为准。';
  const copy = planCard('copy', '内容创作', '文案', '正文草稿', '同步到平台预览', copyText, '演示文案 · 可编辑');
  const visual = planCard('visual', '内容创作', '视觉', '封面副标题', '平台预览文字', '先看版本，再结合肤质和日常护理习惯', '可编辑');
  const asset = planCard('asset', '平台适配', '素材', '平台素材组', '封面图 · 质地图 · 场景图', '上传并选择本次企划素材。未上传图片时，预览显示占位。', '尚未添加素材');
  const check = planCard('check', '平台适配', '校验', '发布前检查', '平台规范与品牌表达', '核对版本、功效依据、活动权益、素材授权与平台格式。', '发布前检查');
  const plans = {
    brief: {
      assistantText: '已创建新品 Brief。画布列出了产品、SKU/版本、人群与卖点依据；产品来源和版本状态仍待官方资料确认。',
      cards: [product, sku, audience, proof],
    },
    content: {
      assistantText: `已按${platform}生成内容草稿，标题、正文、目标平台与内容形式都已放入画布；编辑后右侧预览会同步更新。`,
      cards: [product, sku, audience, proof, platformCard, goalCard, campaign, angle, format, headline, copy, visual, asset, check],
    },
    review: {
      assistantText: '检查结果已生成：活动权益、产品来源和素材授权信息尚未核实，画布中已标出待确认项；当前预览不虚构价格或促销权益。',
      cards: [product, sku, proof, platformCard, goalCard, campaign, angle, format, headline, copy, asset, check],
    },
  };
  const result = plans[scenario] || { assistantText: '已收到补充需求。请使用左侧三个示例运行 Brief、内容生成或发布前检查。', cards: [] };
  return { ...result, scenario, prompt, platform, goal, generatedAt: new Date().toISOString(), engine: 'local_demo_rules' };
}

async function loadKnowledgeBase() {
  const all = [];
  for (const file of manifestFiles) {
    try {
      const data = JSON.parse(await readFile(file, 'utf8'));
      all.push(...(data.assets || []));
    } catch {
      // An unrun crawler is a valid empty state.
    }
  }
  return { ...fallback, assets: all };
}

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  let raw = '';
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 65536) throw Object.assign(new Error('请求内容过大。'), { status: 413 });
    raw += chunk;
  }
  try {
    const parsed = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    return parsed;
  } catch {
    throw Object.assign(new Error('请输入有效的 JSON 对象。'), { status: 400 });
  }
}

function chatConfigured() {
  return Boolean(process.env.COZE_PAT && process.env.COZE_BOT_ID);
}

function score(asset, query) {
  const haystack = [asset.searchText, asset.product, asset.sku, asset.version, asset.subtype, ...(asset.tags || []), ...(asset.scene || []), ...(asset.platforms || [])].join(' ').toLowerCase();
  const normalized = query.trim().toLowerCase();
  if (!normalized) return 0;
  const tokens = normalized.split(/\s+/).filter(Boolean);
  const keywords = normalized.match(/红宝石面霜|红宝石|面霜|双11|双十一|抖音|小红书|天猫|视频|图片|素材|质地|油敏肌|官方|活动|产品/g) || [];
  return [...new Set([...tokens, ...keywords])].reduce((sum, token) => sum + (haystack.includes(token) ? 1 : 0), 0);
}

async function loadImageKnowledge() {
  try {
    return JSON.parse(await readFile(imageManifestFile, 'utf8')).assets || [];
  } catch {
    return [];
  }
}

function scoreImage(asset, query) {
  const text = [asset.imageId, asset.productId, asset.product, asset.sku, asset.version, asset.imageType, asset.versionStatus, asset.visibleText, asset.verification, ...(asset.scenes || []), ...(asset.platforms || [])].join(' ').toLowerCase();
  const normalized = query.trim().toLowerCase();
  if (!normalized) return 0;
  const compact = normalized.replace(/[\s，。、“”！？,.!?/]+/g, '');
  const concepts = ['红宝石面霜', '红宝石精华', '红宝石', '体验装', '多sku', '套装', '组合图', '双抗精华', '源力精华', '能量面霜', '功效', '证明', '版本', '2.0', '3.0', '4.0', '主图'];
  const matched = concepts.filter(term => normalized.includes(term) && text.includes(term));
  const explicitProduct = concepts.filter(term => ['红宝石面霜', '红宝石精华', '双抗精华', '源力精华', '能量面霜'].includes(term) && normalized.includes(term));
  const productScore = explicitProduct.some(term => asset.product.toLowerCase().includes(term)) ? 5 : 0;
  const conceptScore = matched.reduce((sum, term) => sum + (['红宝石面霜', '红宝石精华', '双抗精华', '源力精华', '能量面霜'].includes(term) ? 3 : 1), 0);
  const phraseScore = compact.length > 3 && text.replace(/[\s/]+/g, '').includes(compact) ? 2 : 0;
  if (explicitProduct.length && !productScore) return 0;
  return productScore + conceptScore + phraseScore;
}

async function handle(req, res) {
  res.setHeader('x-content-type-options', 'nosniff');
  const origin = req.headers.origin;
  if (origin) {
    if (!allowedOrigins.has(origin)) return json(res, 403, { error: 'origin_not_allowed' });
    res.setHeader('access-control-allow-origin', origin);
    res.setHeader('vary', 'Origin');
    res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
    res.setHeader('access-control-allow-headers', 'Content-Type');
  }
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  const url = new URL(req.url, 'http://localhost');
  const kb = await loadKnowledgeBase();
  if (url.pathname === '/api/chat/stream' && req.method === 'POST') {
    if (!chatConfigured()) return json(res, 503, { error: 'Coze API 未配置，请在服务端环境变量中设置 COZE_PAT 和 COZE_BOT_ID。' });
    const body = await readJson(req);
    const prompt = String(body.prompt || '').trim();
    if (!prompt) return json(res, 400, { error: '请输入对话内容。' });
    if (prompt.length > 6000) return json(res, 400, { error: '单次输入请控制在 6000 字以内。' });
    if (Date.now() - chatWindowStart >= 3600000) { chatWindowStart = Date.now(); chatRequests = 0; }
    if (chatRequests >= maxChatPerHour || activeChats >= maxConcurrentChats) {
      res.setHeader('retry-after', '60');
      return json(res, 429, { error: '演示服务当前调用较多，请稍后再试。' });
    }
    chatRequests += 1;
    activeChats += 1;
    let released = false;
    const release = () => { if (!released) { released = true; activeChats -= 1; } };
    res.once('finish', release);
    res.once('close', release);

    const controller = new AbortController();
    res.on('close', () => { if (!res.writableEnded) controller.abort(); });
    const endpoint = new URL('/v3/chat', process.env.COZE_API_BASE || 'https://api.coze.cn');
    if (body.conversationId) endpoint.searchParams.set('conversation_id', String(body.conversationId));
    const upstream = await fetch(endpoint, {
      method: 'POST',
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(120000)]),
      headers: {
        Authorization: `Bearer ${process.env.COZE_PAT}`,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({
        bot_id: process.env.COZE_BOT_ID,
        user_id: String(body.userId || 'beauty-workbench-local'),
        stream: true,
        auto_save_history: true,
        additional_messages: [{ role: 'user', content: prompt, content_type: 'text' }],
      }),
    });
    if (!upstream.ok) {
      await upstream.text();
      return json(res, upstream.status, { error: `Coze API 请求失败（${upstream.status}），请检查服务端授权和 Agent API 发布状态。` });
    }
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });
    if (!upstream.body) return res.end();
    for await (const chunk of upstream.body) {
      if (controller.signal.aborted || res.destroyed) break;
      if (!res.write(chunk)) await new Promise(resolve => res.once('drain', resolve));
    }
    if (!res.writableEnded) res.end();
    return;
  }
  if (url.pathname === '/api/image-knowledge/search' && req.method === 'POST') {
    const body = await readJson(req);
    const query = body.query || '';
    const images = await loadImageKnowledge();
    const hits = images
      .map(asset => ({ ...asset, matchScore: scoreImage(asset, query), previewUrl: `/api/image-knowledge/files/${encodeURIComponent(asset.imageId)}` }))
      .filter(asset => asset.matchScore > 0 || !query.trim())
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, Math.min(Number(body.limit) || 10, 30));
    const claimBoundary = /功效|证明|疗效/.test(query)
      ? '图片只能作为视觉素材或可见文字线索，不能单独证明产品功效；请核对产品事实库、备案信息或官方来源。'
      : '当前使用人工整理的图片元数据检索，尚未运行视觉模型、OCR 或图片向量检索。';
    return json(res, 200, { query, total: hits.length, retrieval: 'curated_metadata', claimBoundary, hits });
  }
  if (url.pathname.startsWith('/api/image-knowledge/files/')) {
    const id = decodeURIComponent(url.pathname.split('/').pop());
    const images = await loadImageKnowledge();
    const asset = images.find(item => item.imageId === id);
    if (!asset) return json(res, 404, { error: 'image_not_found' });
    const file = resolve(imageRoot, asset.localPath);
    const imageRelative = relative(imageRoot, file);
    if (imageRelative.startsWith('..') || isAbsolute(imageRelative)) return json(res, 400, { error: 'invalid_image_path' });
    try {
      const buffer = await readFile(file);
      const type = extname(file).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg';
      res.writeHead(200, { 'content-type': type, 'cache-control': 'public, max-age=3600' });
      return res.end(buffer);
    } catch {
      return json(res, 404, { error: 'image_file_missing' });
    }
  }
  if (url.pathname === '/api/health') return json(res, 200, { ok: true, knowledgeBaseAssets: kb.assets.length, retrieval: 'text_metadata', cozeConfigured: chatConfigured() });
  if (url.pathname === '/api/assets/search' && req.method === 'POST') {
    const body = await readJson(req);
    const query = body.text || '';
    const types = body.types || [];
    const hits = kb.assets
      .filter(asset => !types.length || types.includes(asset.type))
      .filter(asset => !body.product || `${asset.product} ${asset.sku}`.includes(body.product))
      .filter(asset => !body.platform || (asset.platforms || []).includes(body.platform))
      .map(asset => ({ ...asset, matchScore: score(asset, query) }))
      .filter(asset => asset.matchScore > 0 || !query.trim())
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, Math.min(Number(body.limit) || 12, 50));
    return json(res, 200, { query, filters: body, hits, total: hits.length, searchMode: 'text_metadata' });
  }
  if (url.pathname === '/api/brief/generate' && req.method === 'POST') {
    const body = await readJson(req);
    const prompt = body.prompt || '';
    const platform = platformFromPrompt(prompt, body.platform);
    const scenario = ['brief', 'content', 'review'].includes(body.scenario)
      ? body.scenario
      : /检查|核对|是否齐全|风险|校验/.test(prompt) ? 'review'
        : /生成|标题|正文|内容稿|脚本/.test(prompt) ? 'content'
          : /完善|brief|新品资料/i.test(prompt) ? 'brief' : 'chat';
    const query = body.assetQuery || body.userMessage || prompt;
    const types = /视频|短视频/.test(query) ? ['video'] : /图片|图片素材|封面|产品图/.test(query) ? ['image'] : [];
    const assets = kb.assets
      .filter(asset => !types.length || types.includes(asset.type))
      .map(asset => ({ ...asset, matchScore: score(asset, query) }))
      .filter(asset => asset.matchScore > 0)
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, 6);
    const effectiveScenario = assets.length && scenario === 'chat' ? 'content' : scenario;
    const result = generatePlan({ scenario: effectiveScenario, prompt, platform });
    const cards = result.cards.map(card => card.id === 'asset' && assets.length
      ? { ...card, body: `${assets.length} 项官方素材已匹配；授权状态请在发布前复核。` }
      : card);
    const assistantText = assets.length
      ? `已按官方公开来源整理 ${assets.length} 项素材，并同步到企划节点。当前检索模式为 text_metadata；官方媒体下载状态和授权范围会在查看依据中保留。`
      : result.assistantText;
    return json(res, 200, { ...result, scenario: effectiveScenario, cards, assetHits: assets, assistantText });
  }
  if (url.pathname.startsWith('/api/assets/') && req.method === 'GET') {
    const id = decodeURIComponent(url.pathname.split('/').pop());
    const asset = kb.assets.find(item => item.assetId === id);
    return asset ? json(res, 200, asset) : json(res, 404, { error: 'asset_not_found', assetId: id });
  }
  if (url.pathname === '/api/content/generate' && req.method === 'POST') {
    const body = await readJson(req);
    const query = body.assetQuery || body.userMessage || '';
    const hits = kb.assets.filter(asset => score(asset, query) > 0).slice(0, 6);
    return json(res, 200, {
      runId: `local-${Date.now()}`,
      briefPatch: { source: 'official_public_pages', assetCount: hits.length },
      preview: { platform: body.brief?.platform || 'xiaohongshu', selectedAssets: hits.map(asset => asset.assetId) },
      evidence: hits.map(asset => ({ assetId: asset.assetId, sourceUrl: asset.sourceUrl, sourceTitle: asset.sourceTitle, capturedAt: asset.capturedAt, rightsStatus: asset.rightsStatus })),
      risks: hits.some(asset => asset.rightsStatus === 'official_source_review_required') ? ['官方素材公开可见，但授权范围仍待确认'] : [],
      assetHits: hits,
    });
  }
  if (url.pathname === '/api/hello') return json(res, 200, { message: '美妆内容运营后端已启动' });
  return json(res, 404, { error: 'not_found' });
}

const port = Number(process.env.PORT || 8787);
createServer((req, res) => handle(req, res).catch(error => {
  if (res.headersSent) return res.destroy(error);
  const status = error.status || 500;
  return json(res, status, { error: status === 500 ? '服务暂不可用，请稍后重试。' : error.message });
})).listen(port, process.env.HOST || '127.0.0.1', () => {
  console.log(`beauty workbench API listening on port ${port}`);
});
