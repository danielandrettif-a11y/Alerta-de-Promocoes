const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');

test('envio ao WhatsApp não informa sucesso sem confirmação', () => {
  const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
  const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  const packageJson = require(path.join(root, 'package.json'));
  const whatsapp = fs.readFileSync(
    path.join(root, 'execution', 'whatsapp_client.js'),
    'utf8'
  );

  assert.match(server, /if \(!whatsappStatus\.ready\)/);
  assert.match(server, /success: failedCount === 0/);
  assert.match(server, /sentCount === 0 \? 502/);
  assert.match(app, /filter\(item => item\.success && item\.msgId\)/);
  assert.match(app, /Nenhuma oferta foi enviada/);
  assert.doesNotMatch(app, /Ofertas postadas no WhatsApp com sucesso/);
  assert.doesNotMatch(whatsapp, /120363410833991285@g\.us/);
  assert.match(whatsapp, /liveState !== 'CONNECTED'/);
  assert.match(whatsapp, /targetChat\?\.isReadOnly/);
  assert.match(packageJson.dependencies['whatsapp-web.js'], /f4ea1e3/);
  assert.match(whatsapp, /targetChat\.id\._serialized \|\| targetChat\.id\.\$1/);
  assert.match(
    whatsapp,
    /client\.sendMessage\(chatId, media, \{ caption: messageText \}\)/
  );
  assert.match(whatsapp, /client\.sendMessage\(chatId, messageText\)/);
  assert.match(whatsapp, /sentMsg\.id\._serialized \|\| sentMsg\.id\.\$1/);
  assert.doesNotMatch(whatsapp, /__alertaOriginalAsUserWidOrThrow/);
  assert.doesNotMatch(whatsapp, /sendSeen: false/);
  assert.doesNotMatch(whatsapp, /linkPreview: false/);
  assert.doesNotMatch(whatsapp, /waitUntilMsgSent: true/);
  assert.doesNotMatch(
    whatsapp,
    /scheduleReconnect\(`Falha interna durante envio: \$\{rawMessage\}`\)/
  );
  assert.match(whatsapp, /reconnectTimer \|\| reconnectInProgress/);
  assert.match(whatsapp, /await initializeClient\(\)/);
  assert.match(whatsapp, /clearTimeout\(reconnectTimer\)/);
  assert.doesNotMatch(whatsapp, /sent_success_no_id/);
  assert.match(app, /className = 'product-progress is-queued'/);
  assert.match(app, /selectedDeals: \[payloadDeals\[i\]\]/);
});
