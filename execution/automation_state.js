const fs = require('fs');
const path = require('path');

const SAO_PAULO_TIME_ZONE = 'America/Sao_Paulo';

function getDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SAO_PAULO_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts.filter(part => part.type !== 'literal')
      .map(part => [part.type, part.value])
  );
  return `${values.year}-${values.month}-${values.day}`;
}

function normalizeDealLink(link) {
  if (!link) return '';
  try {
    const parsed = new URL(link);
    return `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, '');
  } catch {
    return String(link).split(/[?#]/)[0].replace(/\/+$/, '');
  }
}

function hashText(value) {
  let hash = 0;
  for (let index = 0; index < value.length; index++) {
    hash = ((hash << 5) - hash) + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function generateDealId(deal) {
  const rawPlatform = String(deal.platform || 'unknown').toLowerCase();
  const platform = ['ml', 'mercado livre', 'mercado_livre'].includes(rawPlatform)
    ? 'mercado_livre'
    : ['amz', 'amazon'].includes(rawPlatform)
      ? 'amazon'
      : rawPlatform;
      
  // Use rawLink if available (crucial for FutFanatics/Awin links so they don't all resolve to cread.php)
  const rawLink = deal.rawLink || deal.link || deal.productLink || '';
  const normalizedLink = normalizeDealLink(rawLink);
  const itemId = normalizedLink.match(/\b(MLB\d+|B0[A-Z0-9]+)\b/i)?.[1];
  const identity = itemId || normalizedLink || String(deal.title || '').trim().toLowerCase();
  return `deal_${hashText(`${platform}:${identity}`)}`;
}

function emptyHistory() {
  return { publishedIds: [], entries: [] };
}

function normalizeHistory(history) {
  return {
    publishedIds: Array.isArray(history?.publishedIds)
      ? [...new Set(history.publishedIds)]
      : [],
    entries: Array.isArray(history?.entries) ? history.entries : []
  };
}

function loadHistory(historyPath, legacyPath) {
  for (const candidate of [historyPath, legacyPath]) {
    if (!candidate || !fs.existsSync(candidate)) continue;
    try {
      const history = normalizeHistory(
        JSON.parse(fs.readFileSync(candidate, 'utf8'))
      );
      if (candidate !== historyPath) saveHistory(historyPath, history);
      return history;
    } catch {
      // Tenta a proxima fonte e, se nenhuma for valida, retorna vazio.
    }
  }
  return emptyHistory();
}

function saveHistory(historyPath, history) {
  fs.mkdirSync(path.dirname(historyPath), { recursive: true });
  fs.writeFileSync(
    historyPath,
    JSON.stringify(normalizeHistory(history), null, 2),
    'utf8'
  );
}

function markPublishedEntryRemovedByMessageId(
  history,
  messageId,
  removal = {}
) {
  const normalized = normalizeHistory(history);
  const targetId = String(messageId || '');
  const entry = normalized.entries.find(
    entry => String(entry.msgId || '') === targetId
  );
  if (!entry) {
    return { history: normalized, updatedEntry: null };
  }
  Object.assign(entry, {
    removedFromWhatsAppAt: removal.removedFromWhatsAppAt ||
      new Date().toISOString(),
    removalReason: removal.removalReason || 'manual',
    ...removal
  });
  if (entry.dealId && !normalized.publishedIds.includes(entry.dealId)) {
    normalized.publishedIds.push(entry.dealId);
  }
  return { history: normalized, updatedEntry: entry };
}

function getTodayPublishedIds(history, now = new Date()) {
  const today = getDateKey(now);
  return new Set(
    normalizeHistory(history).entries
      .filter(entry => {
        if (!entry.publishedAt || entry.deleted) return false;
        const publishedAt = new Date(entry.publishedAt);
        return !Number.isNaN(publishedAt.getTime()) &&
          getDateKey(publishedAt) === today;
      })
      .map(entry => entry.dealId)
      .filter(Boolean)
  );
}

function countAutomaticPostsSince(history, since) {
  const sinceMs = since.getTime();
  return normalizeHistory(history).entries.filter(entry => {
    if (entry.source !== 'auto' || entry.deleted || !entry.publishedAt) {
      return false;
    }
    const publishedMs = new Date(entry.publishedAt).getTime();
    return Number.isFinite(publishedMs) && publishedMs >= sinceMs;
  }).length;
}

function selectBestUnpublished(deals, history, count = 1, now = new Date()) {
  const todayIds = getTodayPublishedIds(history, now);
  return deals
    .map(deal => ({ ...deal, dealId: generateDealId(deal) }))
    .filter(deal => !todayIds.has(deal.dealId))
    .sort((a, b) => {
      if ((b.discount || 0) !== (a.discount || 0)) {
        return (b.discount || 0) - (a.discount || 0);
      }
      return (b.rating || 0) - (a.rating || 0);
    })
    .slice(0, count);
}

function parseGeneratedAt(value) {
  if (!value) return null;
  const direct = new Date(value);
  if (!Number.isNaN(direct.getTime())) return direct;

  const match = String(value).match(
    /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/
  );
  if (!match) return null;
  const [, day, month, year, hour, minute, second] = match;
  const parsed = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second)
  );
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getFreshness(generatedAt, staleAfterMinutes = 90, now = new Date()) {
  const generatedDate = parseGeneratedAt(generatedAt);
  if (!generatedDate) {
    return {
      generatedAt: generatedAt || null,
      ageMinutes: null,
      staleAfterMinutes,
      isStale: true
    };
  }
  const ageMinutes = Math.max(
    0,
    Math.floor((now.getTime() - generatedDate.getTime()) / 60000)
  );
  return {
    generatedAt: generatedDate.toISOString(),
    ageMinutes,
    staleAfterMinutes,
    isStale: ageMinutes > staleAfterMinutes
  };
}

module.exports = {
  getDateKey,
  normalizeDealLink,
  generateDealId,
  emptyHistory,
  normalizeHistory,
  loadHistory,
  saveHistory,
  markPublishedEntryRemovedByMessageId,
  getTodayPublishedIds,
  countAutomaticPostsSince,
  selectBestUnpublished,
  parseGeneratedAt,
  getFreshness
};
