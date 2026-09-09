#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const ACTIONS = new Set(['navigate', 'snapshot', 'screenshot', 'close_session']);
const SECRET = /(?:authorization|cookie|token|browser(?:-|_)?id|session)\s*[:=]\s*[^\s,;]+|FAKE_SECRET_VALUE/gi;
const SECRET_TEST = /(?:authorization|cookie|token|browser(?:-|_)?id|session)\s*[:=]\s*[^\s,;]+|FAKE_SECRET_VALUE/i;
const SECRET_KEY = /authorization|cookie|token|browserid|session/i;
const CLAIM = /(?:保证.{0,8}(?:赚钱|收益|成功|有效|提升|降低|节省|转化|流量|涨粉)|稳赚|零风险|百分之百|100%|永久有效|绝对(?:安全|有效)|官方(?:排名|数据)|排名第\s*1|(?:提升|降低|节省)\s*\d+(?:\.\d+)?%|唯一官方)/;
const CONFIDENCE = new Set(['none', 'low', 'medium', 'high']);
const COMPLETE_SCOPES = new Set(['video-text-and-keyframes', 'note-body-and-image-order']);
const usage = message => Object.assign(new Error(message), { usage: true });
const clean = value => String(value ?? '').replace(SECRET, '[redacted]').replace(/\s+/g, ' ').trim();
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const writeJson = (file, value) => {
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(redactValue(value), null, 2)}\n`);
};

function redactValue(value, key = '') {
  if (SECRET_KEY.test(key)) return '[redacted]';
  if (Array.isArray(value)) return value.map(item => redactValue(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([childKey, child]) => [childKey, redactValue(child, childKey)]));
  }
  return typeof value === 'string' ? clean(value) : value;
}

function parseWork(value) {
  let url;
  try { url = new URL(value); } catch { throw usage('URL must use http or https'); }
  if (!/^https?:$/.test(url.protocol)) throw usage('URL must use http or https');
  const match = (url.hostname === 'douyin.com' || url.hostname.endsWith('.douyin.com'))
    && url.pathname.match(/^\/(video|note)\/(\d+)\/?$/);
  return match ? { url: url.toString(), workType: match[1], workId: match[2] } : null;
}

function inputCheck(input) {
  if (!input || typeof input !== 'object') throw usage('input must be a JSON object');
  if (!input.url || !input.accountPositioning?.niche || !input.accountPositioning?.audience || !input.remakeGoal?.topic) {
    throw usage('url, accountPositioning.niche, accountPositioning.audience, and remakeGoal.topic are required');
  }
  if (!Number.isInteger(input.remakeGoal.durationSec) || input.remakeGoal.durationSec < 15 || input.remakeGoal.durationSec > 180) {
    throw usage('remakeGoal.durationSec is required and must be an integer from 15 to 180');
  }
  if (typeof input.url !== 'string' || /\s/.test(input.url)) throw usage('exactly one URL is required');
  if (input.browserId !== undefined && (typeof input.browserId !== 'string' || !input.browserId)) throw usage('browserId must be a non-empty string');
  if (input.tabId !== undefined && (!Number.isInteger(input.tabId) || input.tabId <= 0)) throw usage('tabId must be a positive integer');
  const initial = parseWork(input.url);
  const host = new URL(input.url).hostname.toLowerCase();
  if (!initial && host !== 'v.douyin.com') throw usage('URL must be one Douyin work URL or a v.douyin.com share link');
  return { initial };
}

function evidenceFromVisible(visible) {
  const facts = {
    pageTitle: clean(visible.pageTitle) || null,
    workTitle: clean(visible.title) || null,
    author: clean(visible.author) || null,
    description: clean(visible.description) || null,
    hashtags: Array.isArray(visible.hashtags) ? visible.hashtags.map(clean).filter(Boolean) : [],
    visibleMetrics: Object.fromEntries(['like', 'comment', 'favorite', 'share'].map(key => [key, clean(visible.metrics?.[key]) || null])),
  };
  const valid = new Set([
    'visibleFacts.pageTitle', 'visibleFacts.workTitle', 'visibleFacts.author',
    'visibleFacts.description', 'visibleFacts.hashtags',
    ...['like', 'comment', 'favorite', 'share'].map(key => `visibleFacts.visibleMetrics.${key}`),
  ]);
  const evidence = (visible.evidence || [])
    .filter(item => item && typeof item.text === 'string' && !SECRET_TEST.test(item.text))
    .slice(0, 10)
    .map((item, index) => ({
      id: `E${index + 1}`,
      type: 'page-text',
      text: clean(item.text).slice(0, 280),
      supports: (item.supports || []).filter(key => valid.has(key)),
    }))
    .filter(item => item.text && item.supports.length);
  const supported = key => evidence.some(item => item.supports.includes(key));
  for (const key of ['pageTitle', 'workTitle', 'author', 'description']) {
    if (facts[key] && !supported(`visibleFacts.${key}`)) facts[key] = null;
  }
  if (facts.hashtags.length && !supported('visibleFacts.hashtags')) facts.hashtags = [];
  for (const key of ['like', 'comment', 'favorite', 'share']) {
    if (facts.visibleMetrics[key] && !supported(`visibleFacts.visibleMetrics.${key}`)) facts.visibleMetrics[key] = null;
  }
  if (!facts.workTitle && !facts.description) throw new Error('final page has no usable visible work text');
  if (!evidence.length) throw new Error('final page has no reviewable visible evidence');
  return { facts, evidence };
}

function realVisible(snapshot) {
  const rejected = /^(评论|推荐|搜索|大家都在搜|相关视频|下一条|为你推荐)/;
  const all = String(snapshot.text || '').split(/\r?\n/).map(clean).filter(Boolean);
  const boundary = all.findIndex(line => rejected.test(line));
  const main = (boundary < 0 ? all : all.slice(0, boundary)).filter(line => !/登录|验证码|安全验证|私密|已删除|地区限制/.test(line));
  const pageTitle = clean(snapshot.title);
  const title = pageTitle.replace(/\s*[-_|｜]\s*抖音(?:短视频)?\s*$/i, '') || null;
  const description = main.find(line => line === title || (title && line.includes(title))) || null;
  const authorLine = main.find(line => /^(作者|抖音号)[:：]/.test(line));
  const author = authorLine?.replace(/^(作者|抖音号)[:：]\s*/, '') || null;
  const tags = (description?.match(/#[\p{L}\p{N}_-]+/gu) || []).map(tag => tag.slice(1));
  const metricLine = main.find(line => /点赞|评论|收藏|分享/.test(line)) || '';
  const metric = key => metricLine.match(new RegExp(`${key}\\s*([0-9.万亿wW]+)`))?.[1] || null;
  return {
    pageTitle: pageTitle || null,
    title,
    author,
    description,
    hashtags: tags,
    metrics: { like: metric('点赞'), comment: metric('评论'), favorite: metric('收藏'), share: metric('分享') },
    evidence: [
      ...(pageTitle ? [{ text: pageTitle, supports: ['visibleFacts.pageTitle', 'visibleFacts.workTitle'] }] : []),
      ...(description ? [{ text: description, supports: ['visibleFacts.description', 'visibleFacts.hashtags'] }] : []),
      ...(author ? [{ text: `作者：${author}`, supports: ['visibleFacts.author'] }] : []),
      ...(metricLine ? [{ text: metricLine, supports: ['visibleFacts.visibleMetrics.like', 'visibleFacts.visibleMetrics.comment', 'visibleFacts.visibleMetrics.favorite', 'visibleFacts.visibleMetrics.share'] }] : []),
    ],
  };
}

function normalizeMediaEvidence(input, workType, rawMedia = {}) {
  const supplied = input.contentEvidence || {};
  if (workType === 'video') {
    const transcriptText = clean(supplied.transcript?.text || rawMedia.transcript?.text) || null;
    const transcript = transcriptText ? {
      text: transcriptText.slice(0, 12000),
      source: clean(supplied.transcript?.source || rawMedia.transcript?.source || 'user-supplied'),
    } : null;
    const sourceFrames = [...(rawMedia.keyframes || []), ...(supplied.keyframes || [])].slice(0, 12);
    const keyframes = sourceFrames.map((frame, index) => ({
      id: `M${index + 1}`,
      order: index + 1,
      timeSec: Number.isFinite(frame.timeSec) ? frame.timeSec : null,
      fileName: clean(path.basename(String(frame.fileName || frame.path || `keyframe-${index + 1}.png`))),
      sha256: /^[a-f0-9]{64}$/i.test(String(frame.sha256 || '')) ? String(frame.sha256).toLowerCase() : null,
      observation: clean(frame.observation) || null,
      source: clean(frame.source || 'user-supplied'),
    }));
    const identities = new Set(keyframes.map(frame => frame.sha256 || `${frame.fileName}:${frame.timeSec}:${frame.observation}`).filter(Boolean));
    return { transcript, keyframes, noteBody: null, noteImages: [], uniqueKeyframeCount: identities.size };
  }
  const body = clean(supplied.noteBody || rawMedia.noteBody) || null;
  const noteImages = [...(rawMedia.noteImages || []), ...(supplied.noteImages || [])].slice(0, 20).map((image, index) => ({
    id: `M${index + 1}`,
    order: Number.isInteger(image.order) ? image.order : index + 1,
    fileName: clean(path.basename(String(image.fileName || image.path || `note-image-${index + 1}.png`))),
    observation: clean(image.observation) || null,
    source: clean(image.source || 'user-supplied'),
  }));
  return { transcript: null, keyframes: [], noteBody: body, noteImages, uniqueKeyframeCount: 0 };
}

function mediaEvidenceRows(media, workType) {
  if (workType === 'video') {
    return [
      ...(media.transcript ? [{ id: 'T1', type: 'transcript', text: media.transcript.text.slice(0, 1000), supports: ['mediaEvidence.transcript'] }] : []),
      ...media.keyframes.map(frame => ({
        id: frame.id,
        type: 'keyframe',
        text: frame.observation || `关键画面 ${frame.order}，文件 ${frame.fileName}`,
        supports: ['mediaEvidence.keyframes'],
        asset: frame.fileName,
      })),
    ];
  }
  return [
    ...(media.noteBody ? [{ id: 'T1', type: 'note-body', text: media.noteBody.slice(0, 1000), supports: ['mediaEvidence.noteBody'] }] : []),
    ...media.noteImages.map(image => ({
      id: image.id,
      type: 'note-image',
      text: image.observation || `图文第 ${image.order} 张，文件 ${image.fileName}`,
      supports: ['mediaEvidence.noteImages'],
      asset: image.fileName,
    })),
  ];
}

function captureFromSnapshot(input, snapshot, isMock = true, capturedMedia = {}) {
  const { initial } = inputCheck(input);
  const raw = isMock ? snapshot : { finalUrl: snapshot.url, gateText: snapshot.text, visible: realVisible(snapshot), mediaEvidence: capturedMedia };
  if (raw.gate || /login|登录|验证码|安全验证|private|deleted|不可见|地区限制/i.test(raw.gateText || '')) throw new Error('target page is gated or unavailable');
  const final = parseWork(raw.finalUrl);
  if (!final) throw new Error('final page is not one Douyin video or note work');
  if (initial && initial.workId !== final.workId) throw new Error('final work identity does not match input');
  const { facts, evidence: pageEvidence } = evidenceFromVisible(raw.visible || {});
  const mediaEvidence = normalizeMediaEvidence(input, final.workType, raw.mediaEvidence || {});
  const orderedNoteImages = mediaEvidence.noteImages.every((image, index) => image.order === index + 1);
  const hasVisibleText = Boolean(facts.workTitle || facts.description || mediaEvidence.transcript?.text);
  const analysisScope = final.workType === 'video' && hasVisibleText && mediaEvidence.uniqueKeyframeCount >= 2
    ? 'video-text-and-keyframes'
    : final.workType === 'note' && mediaEvidence.noteBody && mediaEvidence.noteImages.length && orderedNoteImages
      ? 'note-body-and-image-order'
      : 'page-text-only';
  const evidence = [...pageEvidence, ...mediaEvidenceRows(mediaEvidence, final.workType)];
  const limitations = analysisScope === 'page-text-only'
    ? ['仅能分析页面文字；证据不足，不能判断原作品的画面、镜头、剪辑节奏或图文图片顺序。']
    : final.workType === 'video'
      ? ['视频拆解仅覆盖已保存并由宿主 Agent 检查的文字和关键画面，不代表完整视听转写。']
      : ['图文拆解仅覆盖已提供的正文和有序图片证据。'];
  return {
    schemaVersion: '1.1',
    kind: 'douyin-source-evidence',
    inputUrl: input.url,
    pageUrl: final.url,
    workId: final.workId,
    workType: final.workType,
    capturedAt: new Date().toISOString(),
    captureMethod: 'Easy WebBridge visible page snapshot',
    analysisScope,
    visibleFacts: facts,
    mediaEvidence,
    evidence,
    limitations,
  };
}

function bridgeConfig(input) {
  const url = process.env.SKILL_FACTORY_WEBBRIDGE_URL || process.env.EASY_WEBBRIDGE_URL || 'http://127.0.0.1:17777';
  const tokenFile = process.env.SKILL_FACTORY_WEBBRIDGE_TOKEN_FILE || process.env.EASY_WEBBRIDGE_TOKEN_FILE || path.join(os.homedir(), '.easy-webbridge', 'bridge-token');
  let token;
  try { token = fs.readFileSync(tokenFile, 'utf8').trim(); } catch { throw new Error('Easy WebBridge token file is unavailable'); }
  if (!token) throw new Error('Easy WebBridge token file is empty');
  return { url: url.replace(/\/$/, ''), token, browserId: input.browserId || process.env.SKILL_FACTORY_WEBBRIDGE_BROWSER_ID || null };
}

function bridgeApi(config) {
  return {
    async list() {
      const response = await fetch(`${config.url}/v1/browsers`, { headers: { authorization: `Bearer ${config.token}` } });
      if (!response.ok) throw new Error(`Easy WebBridge browser listing failed (${response.status})`);
      const payload = await response.json();
      return Array.isArray(payload) ? payload : payload.browsers || [];
    },
    async command(browserId, action, args) {
      if (!ACTIONS.has(action)) throw new Error('bridge action is not allowlisted');
      const response = await fetch(`${config.url}/v1/browsers/${encodeURIComponent(browserId)}/commands`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${config.token}` },
        body: JSON.stringify({ action, args, timeoutMs: 20000 }),
      });
      if (!response.ok) throw new Error(`Easy WebBridge command failed (${response.status})`);
      const payload = await response.json();
      return payload?.result ?? payload;
    },
  };
}

function fileHash(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

async function captureReal(input, outputFile, api = bridgeApi(bridgeConfig(input))) {
  const config = bridgeConfig(input);
  const browsers = (await api.list()).filter(browser => browser?.online);
  const chosen = config.browserId ? browsers.find(browser => browser.browserId === config.browserId) : (browsers.length === 1 ? browsers[0] : null);
  if (!chosen) throw new Error(config.browserId ? 'requested browser is not online' : 'select one exact browserId when multiple browsers are online');
  const session = `douyin-viral-remake-${Date.now()}-${process.pid}`;
  let created = false;
  const createdAssets = [];
  try {
    let tabId = input.tabId;
    if (!tabId) {
      const navigation = await api.command(chosen.browserId, 'navigate', { url: input.url, newTab: true, active: true, session, groupTitle: '抖音作品拆解' });
      tabId = navigation?.tabId;
      if (!tabId) throw new Error('Easy WebBridge did not return a task tab');
      created = true;
    }
    const deadline = Date.now() + 12_000;
    let snapshot = null;
    let lastError = new Error('Douyin work content is still loading');
    do {
      try {
        snapshot = await api.command(chosen.browserId, 'snapshot', { tabId, maxTextLength: 24000 });
        const final = parseWork(snapshot?.url);
        const visible = snapshot ? realVisible(snapshot) : null;
        if (final && (visible?.title || visible?.description)) break;
      } catch (error) {
        lastError = error;
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    } while (Date.now() < deadline);
    if (!snapshot || !parseWork(snapshot.url)) throw lastError;
    const final = parseWork(snapshot.url);
    const media = { keyframes: [] };
    if (final?.workType === 'video') {
      const outputDir = path.dirname(path.resolve(outputFile));
      fs.mkdirSync(outputDir, { recursive: true });
      for (let index = 0; index < 3; index += 1) {
        if (index) await new Promise(resolve => setTimeout(resolve, 1200));
        const requestedPath = path.join(outputDir, `keyframe-${String(index + 1).padStart(2, '0')}.png`);
        const shot = await api.command(chosen.browserId, 'screenshot', { tabId, format: 'png', fullPage: false, path: requestedPath });
        const actualPath = shot?.path || requestedPath;
        if (fs.existsSync(actualPath) && fs.statSync(actualPath).size > 0) {
          if (path.resolve(actualPath) !== path.resolve(requestedPath)) fs.copyFileSync(actualPath, requestedPath);
          createdAssets.push(requestedPath);
          media.keyframes.push({ fileName: path.basename(requestedPath), sha256: fileHash(requestedPath), timeSec: index * 1.2, source: 'browser-screenshot' });
        }
      }
    }
    return captureFromSnapshot(input, snapshot, false, media);
  } catch (error) {
    for (const file of createdAssets) fs.rmSync(file, { force: true });
    throw error;
  } finally {
    if (created) {
      try { await api.command(chosen.browserId, 'close_session', { session }); } catch {}
    }
  }
}

const norm = value => clean(value).toLowerCase().replace(/[\s\p{P}]/gu, '');
const keys = (value, required) => value && typeof value === 'object' && required.every(key => Object.hasOwn(value, key));
const iso = value => typeof value === 'string' && !Number.isNaN(Date.parse(value)) && /^\d{4}-\d\d-\d\dT/.test(value);
const hasRefs = (items, set) => Array.isArray(items) && items.every(item => Array.isArray(item?.evidenceRefs) && item.evidenceRefs.every(id => set.has(id)));

function timeline(items, duration, name) {
  if (!Array.isArray(items) || !items.length) throw new Error(`${name} is required`);
  let at = 0;
  for (const item of items) {
    if (!Number.isFinite(item.startSec) || !Number.isFinite(item.endSec) || item.startSec !== at || item.endSec <= at) throw new Error(`${name} must start at 0 and be continuous`);
    at = item.endSec;
  }
  if (at !== duration) throw new Error(`${name} must end at durationSec`);
}

function validate(source, result) {
  if (!keys(source, ['schemaVersion', 'kind', 'inputUrl', 'pageUrl', 'workId', 'workType', 'capturedAt', 'captureMethod', 'analysisScope', 'visibleFacts', 'mediaEvidence', 'evidence', 'limitations'])
    || source.schemaVersion !== '1.1' || source.kind !== 'douyin-source-evidence' || !iso(source.capturedAt)) throw new Error('invalid complete source schema');
  if (!['page-text-only', ...COMPLETE_SCOPES].includes(source.analysisScope)) throw new Error('invalid analysis scope');
  if (!Array.isArray(source.evidence) || source.evidence.some(item => !keys(item, ['id', 'type', 'text', 'supports']) || !Array.isArray(item.supports) || !item.supports.length)) throw new Error('source evidence lacks supports');
  if (!keys(result, ['schemaVersion', 'kind', 'status', 'source', 'brief', 'teardown', 'remake', 'originalityReview', 'claimReview', 'limitations'])
    || result.schemaVersion !== '1.1' || result.kind !== 'douyin-original-remake' || !['ready', 'partial'].includes(result.status)) throw new Error('invalid complete remake schema');
  if (!keys(result.source, ['inputUrl', 'pageUrl', 'workId', 'workType', 'capturedAt', 'analysisScope'])
    || ['inputUrl', 'pageUrl', 'workId', 'workType', 'capturedAt', 'analysisScope'].some(key => result.source[key] !== source[key])) throw new Error('result source does not match evidence');
  if (source.analysisScope === 'page-text-only' && result.status !== 'partial') throw new Error('page-text-only evidence must be reported as partial');
  const brief = result.brief;
  if (!keys(brief, ['niche', 'audience', 'voice', 'topic', 'verifiedClaims', 'cta', 'durationSec']) || !Array.isArray(brief.verifiedClaims)
    || !Number.isInteger(brief.durationSec) || brief.durationSec < 15 || brief.durationSec > 180) throw new Error('invalid complete brief');
  const teardown = result.teardown;
  if (!keys(teardown, ['hook', 'pace', 'visual', 'structure', 'conversionPoints', 'reusableMechanisms'])
    || !keys(teardown.hook, ['finding', 'evidenceRefs', 'confidence'])
    || !keys(teardown.pace, ['finding', 'basis', 'evidenceRefs', 'confidence'])
    || !keys(teardown.visual, ['finding', 'evidenceRefs', 'confidence'])
    || !CONFIDENCE.has(teardown.hook.confidence) || !CONFIDENCE.has(teardown.pace.confidence) || !CONFIDENCE.has(teardown.visual.confidence)
    || !['page-text-only', 'video-keyframes', 'note-image-order'].includes(teardown.pace.basis)
    || !Array.isArray(teardown.structure) || teardown.structure.some(item => !keys(item, ['stage', 'function', 'evidenceRefs', 'confidence']) || !CONFIDENCE.has(item.confidence))
    || !Array.isArray(teardown.conversionPoints) || teardown.conversionPoints.some(item => !keys(item, ['finding', 'evidenceRefs', 'confidence']) || !CONFIDENCE.has(item.confidence))) throw new Error('invalid complete teardown');
  const ids = new Set(source.evidence.map(item => item.id));
  if (!hasRefs([teardown.hook, teardown.pace, teardown.visual], ids) || !hasRefs(teardown.structure, ids) || !hasRefs(teardown.conversionPoints, ids)) throw new Error('unknown evidence reference');
  const mediaIds = new Set(source.evidence.filter(item => ['keyframe', 'note-image', 'note-body', 'transcript'].includes(item.type)).map(item => item.id));
  if (source.analysisScope === 'page-text-only') {
    if (teardown.pace.basis !== 'page-text-only' || teardown.pace.finding !== null || teardown.pace.confidence !== 'none' || teardown.pace.evidenceRefs.length
      || teardown.visual.finding !== null || teardown.visual.confidence !== 'none' || teardown.visual.evidenceRefs.length) {
      throw new Error('page-text-only evidence cannot support pace or visual findings');
    }
    if (!result.limitations.some(item => /仅能分析页面文字|page text only/i.test(item))) throw new Error('partial result must state the page-text-only limitation');
  } else {
    const expectedBasis = source.analysisScope === 'video-text-and-keyframes' ? 'video-keyframes' : 'note-image-order';
    if (teardown.pace.basis !== expectedBasis || !teardown.pace.finding || teardown.pace.confidence === 'none' || !teardown.visual.finding || teardown.visual.confidence === 'none') throw new Error('complete evidence requires supported pace and visual findings');
    if (![...teardown.pace.evidenceRefs, ...teardown.visual.evidenceRefs].some(id => mediaIds.has(id))) throw new Error('pace and visual findings must reference media evidence');
  }
  const remake = result.remake;
  if (!keys(remake, ['angle', 'hook', 'script', 'storyboard', 'cta'])
    || !keys(result.originalityReview, ['passed', 'matchedSourceSpans', 'retainedUniqueElements', 'changes', 'humanReviewRequired'])
    || result.originalityReview.passed !== true || result.originalityReview.humanReviewRequired !== true) throw new Error('invalid remake or originality review');
  timeline(remake.script, brief.durationSec, 'script');
  timeline(remake.storyboard, brief.durationSec, 'storyboard');
  if (remake.script.length !== remake.storyboard.length || remake.script.some((item, index) => !keys(item, ['startSec', 'endSec', 'voiceover', 'function'])
    || !keys(remake.storyboard[index], ['shot', 'startSec', 'endSec', 'visual', 'voiceover', 'onScreenText', 'purpose'])
    || norm(item.voiceover) !== norm(remake.storyboard[index].voiceover))) throw new Error('script and storyboard voiceovers must match');
  const generated = [remake.hook, remake.cta, ...remake.script.map(item => item.voiceover), ...remake.storyboard.flatMap(item => [item.visual, item.onScreenText])].filter(Boolean);
  const sourceSpans = source.evidence.filter(item => ['page-text', 'transcript', 'note-body'].includes(item.type)).map(item => norm(item.text)).filter(text => text.length >= 10);
  for (const text of generated) {
    const normalized = norm(text);
    const hit = sourceSpans.find(span => normalized.includes(span) || (span.includes(normalized) && normalized.length >= 10));
    if (hit) throw new Error(`source-like expression blocked: ${hit.slice(0, 10)}...`);
  }
  if ((brief.constraints || []).some(word => generated.join('\n').includes(word))) throw new Error('forbidden constraint word found');
  if (!Array.isArray(result.claimReview)) throw new Error('claimReview is required');
  const allowed = new Set(brief.verifiedClaims);
  for (const text of generated.filter(item => CLAIM.test(String(item)))) {
    const review = result.claimReview.find(item => item?.claim === text);
    if (!review || review.source !== 'user-verified' || review.status !== 'allowed' || !allowed.has(text)) throw new Error('unreviewed factual or commercial claim');
  }
  if (result.claimReview.some(item => !item || item.source !== 'user-verified' || item.status !== 'allowed' || !allowed.has(item.claim))) throw new Error('invalid claim review');
  if (SECRET_TEST.test(JSON.stringify({ source, result }))) throw new Error('sensitive value found');
  return { ok: true, workId: source.workId, status: result.status, analysisScope: source.analysisScope };
}

function markdown(source, result) {
  const factLines = Object.entries(source.visibleFacts).filter(([, value]) => value && (typeof value !== 'object' || Object.values(value).some(Boolean))).map(([key, value]) => `- ${key}：${typeof value === 'object' ? JSON.stringify(value) : value}`);
  const analysis = [
    `- 钩子：${result.teardown.hook.finding ?? '证据不足'}`,
    `- 节奏：${result.teardown.pace.finding ?? '证据不足，未判断'}`,
    `- 画面：${result.teardown.visual.finding ?? '证据不足，未判断'}`,
    ...result.teardown.structure.map(item => `- ${item.stage}：${item.function}`),
  ];
  const script = result.remake.script.map(item => `- ${item.startSec}-${item.endSec} 秒：${item.voiceover}`);
  const storyboard = result.remake.storyboard.map(item => `| ${item.shot} | ${item.startSec}-${item.endSec} 秒 | ${item.visual} | ${item.voiceover} | ${item.onScreenText} | ${item.purpose} |`);
  return `# 免费抖音作品拆解与原创改写\n\n## 1. 来源、采集时间与作品类型\n\n- 链接：${source.pageUrl}\n- 采集时间：${source.capturedAt}\n- 类型：${source.workType}\n- 证据等级：${source.analysisScope}\n\n## 2. 当前可见事实\n\n${factLines.join('\n') || '- 无'}\n\n## 3. 证据与限制\n\n${result.limitations.map(item => `- ${item}`).join('\n')}\n\n## 4. 钩子、节奏、结构和转化点拆解\n\n${analysis.join('\n')}\n\n## 5. 可借鉴的抽象机制\n\n${result.teardown.reusableMechanisms.map(item => `- ${item}`).join('\n') || '- 无'}\n\n## 6. 本次账号定位与创作目标\n\n- 领域：${result.brief.niche}\n- 受众：${result.brief.audience}\n- 主题：${result.brief.topic}\n\n## 7. 原创口播脚本\n\n${script.join('\n')}\n\n## 8. 分镜表\n\n| 镜号 | 起止时间 | 画面 | 口播 | 屏幕文字 | 功能 |\n| --- | --- | --- | --- | --- | --- |\n${storyboard.join('\n')}\n\n## 9. 事实/商业声明复核\n\n${result.claimReview.map(item => `- ${item.claim}：${item.status}`).join('\n') || '- 未使用需要核验的事实或商业声明。'}\n\n## 10. 原创化自检与人工复核提示\n\n- 自动检查：通过\n- 改动：${result.originalityReview.changes.join('；')}\n- 发布前仍需人工复核；本 Skill 不自动发布，也不承诺爆款。\n`;
}

function args(argv) {
  const allowed = new Set(['--input', '--output', '--mock', '--source', '--result', '--report']);
  const parsed = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item.startsWith('--')) {
      if (!allowed.has(item)) throw usage(`unknown argument: ${item}`);
      const key = item.slice(2);
      if (parsed[key] || !argv[index + 1]) throw usage(`invalid argument: ${item}`);
      parsed[key] = argv[++index];
    } else parsed._.push(item);
  }
  if (parsed._.length !== 1) throw usage('exactly one command is required');
  return parsed;
}

const expect = (fn, label) => { try { fn(); } catch { return; } throw new Error(`expected failure: ${label}`); };

async function selfTest() {
  const input = readJson(path.join(ROOT, 'fixtures/task-input.json'));
  const fullVideo = captureFromSnapshot(input, readJson(path.join(ROOT, 'fixtures/video-visible-snapshot.json')));
  if (fullVideo.analysisScope !== 'video-text-and-keyframes') throw new Error('complete video evidence was not recognized');
  const textOnly = captureFromSnapshot(input, readJson(path.join(ROOT, 'fixtures/video-page-text-only.json')));
  if (textOnly.analysisScope !== 'page-text-only') throw new Error('text-only video must be downgraded');
  const fullNote = captureFromSnapshot({ ...input, url: 'https://www.douyin.com/note/1234567890123456789' }, readJson(path.join(ROOT, 'fixtures/note-visible-snapshot.json')));
  if (fullNote.analysisScope !== 'note-body-and-image-order') throw new Error('complete note evidence was not recognized');
  for (const fixture of ['failure-login-gate.json', 'failure-empty-snapshot.json', 'failure-wrong-work.json']) expect(() => captureFromSnapshot(input, readJson(path.join(ROOT, 'fixtures', fixture))), fixture);
  for (const url of ['https://www.douyin.com/', 'https://www.douyin.com/search/a', 'https://x.com/video/1', 'ftp://douyin.com/video/1', 'https://www.douyin.com/video/1 https://www.douyin.com/video/2']) expect(() => inputCheck({ ...input, url }), url);
  expect(() => inputCheck({ ...input, remakeGoal: { ...input.remakeGoal, durationSec: undefined } }), 'duration required');
  const ready = readJson(path.join(ROOT, 'fixtures/valid-remake-output.json'));
  ready.source.capturedAt = fullVideo.capturedAt;
  validate(fullVideo, ready);
  const partial = readJson(path.join(ROOT, 'fixtures/valid-partial-output.json'));
  partial.source.capturedAt = textOnly.capturedAt;
  validate(textOnly, partial);
  const fakeReady = structuredClone(ready);
  fakeReady.source = { ...fakeReady.source, capturedAt: textOnly.capturedAt, analysisScope: 'page-text-only' };
  expect(() => validate(textOnly, fakeReady), 'page text reported ready');
  const inventedVisual = structuredClone(partial);
  inventedVisual.teardown.visual = { finding: '快切镜头', evidenceRefs: ['E1'], confidence: 'high' };
  expect(() => validate(textOnly, inventedVisual), 'invented visual');
  expect(() => validate(fullVideo, readJson(path.join(ROOT, 'fixtures/failure-copying-output.json'))), 'copying');
  const stale = structuredClone(ready);
  stale.source.capturedAt = '2026-09-07T00:00:00.000Z';
  expect(() => validate(fullVideo, stale), 'capturedAt');
  const unknown = structuredClone(ready);
  unknown.teardown.hook.evidenceRefs = ['E999'];
  expect(() => validate(fullVideo, unknown), 'unknown ref');
  const claims = structuredClone(ready);
  claims.remake.cta = '售价999元，并保证提升效率。';
  expect(() => validate(fullVideo, claims), 'cta claim');
  const ordinaryIncome = structuredClone(ready);
  ordinaryIncome.remake.cta = '这个方向常见月薪1.8万到3.5万。';
  validate(fullVideo, ordinaryIncome);
  const bridgeCalls = [];
  const fake = {
    async list() { return [{ browserId: 'b', online: true }]; },
    async command(id, action, commandArgs) {
      bridgeCalls.push({ id, action, args: commandArgs });
      if (action === 'navigate') return { tabId: 7 };
      if (action === 'snapshot') return { url: input.url, title: '标题', text: '这是一段足够长的页面正文内容，用于验证真实快照解析。 #标签\n作者：作者' };
      if (action === 'screenshot') { fs.mkdirSync(path.dirname(commandArgs.path), { recursive: true }); fs.writeFileSync(commandArgs.path, `png-${bridgeCalls.length}`); return { path: commandArgs.path }; }
      return {};
    },
  };
  const previous = {
    url: process.env.SKILL_FACTORY_WEBBRIDGE_URL,
    tokenFile: process.env.SKILL_FACTORY_WEBBRIDGE_TOKEN_FILE,
    browserId: process.env.SKILL_FACTORY_WEBBRIDGE_BROWSER_ID,
  };
  const tokenFile = path.join(os.tmpdir(), `bridge-token-${process.pid}`);
  const outputFile = path.join(os.tmpdir(), `douyin-remake-${process.pid}`, 'source-evidence.json');
  fs.writeFileSync(tokenFile, 'x');
  process.env.SKILL_FACTORY_WEBBRIDGE_URL = 'http://bridge.test';
  process.env.SKILL_FACTORY_WEBBRIDGE_TOKEN_FILE = tokenFile;
  process.env.SKILL_FACTORY_WEBBRIDGE_BROWSER_ID = 'b';
  const real = await captureReal(input, outputFile, fake);
  if (real.analysisScope !== 'video-text-and-keyframes' || !bridgeCalls.every(call => ACTIONS.has(call.action)) || !bridgeCalls.some(call => call.action === 'close_session')) throw new Error('bridge allowlist, evidence, or cleanup failed');
  for (const [key, value] of Object.entries(previous)) {
    const envKey = key === 'url' ? 'SKILL_FACTORY_WEBBRIDGE_URL' : key === 'tokenFile' ? 'SKILL_FACTORY_WEBBRIDGE_TOKEN_FILE' : 'SKILL_FACTORY_WEBBRIDGE_BROWSER_ID';
    if (value === undefined) delete process.env[envKey]; else process.env[envKey] = value;
  }
  fs.rmSync(tokenFile, { force: true });
  fs.rmSync(path.dirname(outputFile), { recursive: true, force: true });
  return { ok: true, tests: 33, offline: true };
}

async function main() {
  try {
    const parsed = args(process.argv.slice(2));
    const command = parsed._[0];
    if (command === 'help') { process.stdout.write(`${JSON.stringify({ commands: ['capture', 'validate', 'self-test', 'help'] })}\n`); return; }
    if (command === 'self-test') { process.stdout.write(`${JSON.stringify(await selfTest())}\n`); return; }
    if (command === 'capture') {
      if (!parsed.input || !parsed.output || parsed.source || parsed.result || parsed.report) throw usage('capture requires --input and --output only');
      const output = path.resolve(parsed.output);
      const input = readJson(parsed.input);
      try {
        fs.rmSync(output, { force: true });
        fs.rmSync(path.join(path.dirname(output), 'douyin-remake.json'), { force: true });
        fs.rmSync(path.join(path.dirname(output), 'douyin-remake.md'), { force: true });
        const result = parsed.mock ? captureFromSnapshot(input, readJson(parsed.mock)) : await captureReal(input, output);
        writeJson(output, result);
        process.stdout.write(`${JSON.stringify({ ok: true, workType: result.workType, analysisScope: result.analysisScope })}\n`);
      } catch (error) {
        fs.rmSync(output, { force: true });
        fs.rmSync(path.join(path.dirname(output), 'douyin-remake.json'), { force: true });
        fs.rmSync(path.join(path.dirname(output), 'douyin-remake.md'), { force: true });
        throw error;
      }
      return;
    }
    if (command === 'validate') {
      if (!parsed.source || !parsed.result || parsed.input || parsed.output || parsed.mock) throw usage('validate requires --source and --result; --report is optional');
      const report = path.resolve(parsed.report || path.join(path.dirname(path.resolve(parsed.result)), 'douyin-remake.md'));
      try {
        const source = readJson(parsed.source);
        const result = readJson(parsed.result);
        const summary = validate(source, result);
        fs.mkdirSync(path.dirname(report), { recursive: true });
        fs.writeFileSync(report, markdown(source, result));
        process.stdout.write(`${JSON.stringify({ ...summary, report: path.basename(report) })}\n`);
      } catch (error) {
        fs.rmSync(report, { force: true });
        throw error;
      }
      return;
    }
    throw usage(`unknown command: ${command}`);
  } catch (error) {
    process.stderr.write(`${clean(error.message)}\n`);
    process.exitCode = error.usage ? 2 : 1;
  }
}

main();
