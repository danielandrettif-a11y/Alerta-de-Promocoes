const crypto = require('crypto');
const { loadJson, saveJsonAtomic } = require('./json_store.js');

function safeFileStem(value, fallback = 'oferta') {
  const safe = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return safe || fallback;
}

function csvCell(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

function buildCaption(item) {
  return [
    '🔥 OFERTA ENCONTRADA!',
    '',
    item.title,
    '',
    `❌ De: ${item.originalPrice}`,
    `✅ Por: ${item.currentPrice}`,
    `💸 ${Number(item.discount) || 0}% OFF`,
    '',
    '🛒 Comprar:',
    item.affiliateLink,
    '',
    'Preço e disponibilidade podem mudar a qualquer momento.'
  ].join('\n');
}

function createBatchRecord(queue, input, now = new Date()) {
  const requestedIds = [...new Set(
    Array.isArray(input?.itemIds) ? input.itemIds.map(String) : []
  )];
  if (requestedIds.length === 0) {
    throw new Error('Selecione pelo menos uma oferta pronta.');
  }
  const readyItems = requestedIds.map(itemId => {
    const item = queue.items.find(entry => entry.id === itemId);
    if (!item || item.status !== 'ready' || !item.affiliateLink) {
      throw new Error('O lote aceita somente ofertas prontas.');
    }
    if (!item.storyFile) {
      throw new Error(`Story ausente para "${item.title}".`);
    }
    return item;
  });
  const id = `batch_${now.toISOString().slice(0, 10)}_${crypto.randomUUID()}`;
  const name = String(input?.name || '').trim().slice(0, 80) ||
    `Lote ${now.toLocaleDateString('pt-BR')}`;
  return {
    id,
    name,
    folderName: safeFileStem(
      `lote-${now.toISOString().slice(0, 10)}-${name}`,
      `lote-${now.toISOString().slice(0, 10)}`
    ),
    downloadToken: crypto.randomBytes(24).toString('hex'),
    createdAt: now.toISOString(),
    items: readyItems.map((item, index) => ({
      id: item.id,
      order: index + 1,
      title: item.title,
      originalPrice: item.originalPrice,
      currentPrice: item.currentPrice,
      discount: Number(item.discount) || 0,
      productLink: item.productLink,
      affiliateLink: item.affiliateLink,
      storyFile: item.storyFile,
      imageFile: `${String(index + 1).padStart(2, '0')}-${safeFileStem(item.title)}.jpg`,
      status: item.status,
      caption: buildCaption(item)
    }))
  };
}

function buildLinksText(batch) {
  return batch.items.map(item =>
    `${String(item.order).padStart(2, '0')} - ${item.title}\n${item.affiliateLink}`
  ).join('\n\n') + '\n';
}

function buildOffersCsv(batch) {
  const headings = [
    'ordem',
    'titulo',
    'preco_original',
    'preco_atual',
    'desconto',
    'link_produto',
    'link_afiliado',
    'arquivo_imagem',
    'status'
  ];
  const rows = batch.items.map(item => [
    item.order,
    item.title,
    item.originalPrice,
    item.currentPrice,
    item.discount,
    item.productLink,
    item.affiliateLink,
    item.imageFile,
    item.status
  ].map(csvCell).join(','));
  return [headings.map(csvCell).join(','), ...rows].join('\n') + '\n';
}

function loadBatches(filePath) {
  const data = loadJson(filePath, { version: 1, batches: [] });
  return {
    version: 1,
    batches: Array.isArray(data?.batches) ? data.batches : []
  };
}

function saveBatches(filePath, value) {
  saveJsonAtomic(filePath, {
    version: 1,
    batches: Array.isArray(value?.batches) ? value.batches : []
  });
}

function isSafeBatchId(value) {
  return /^batch_\d{4}-\d{2}-\d{2}_[0-9a-f-]{36}$/.test(
    String(value || '')
  );
}

module.exports = {
  safeFileStem,
  buildCaption,
  createBatchRecord,
  buildLinksText,
  buildOffersCsv,
  loadBatches,
  saveBatches,
  isSafeBatchId
};
