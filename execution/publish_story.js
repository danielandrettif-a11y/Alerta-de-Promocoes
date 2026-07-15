/**
 * publish_story.js
 * ─────────────────────────────────────────────────────────────────
 * Camada 3 — Execução (Determinística)
 * 
 * Fluxo:
 *   1. Lê as imagens da pasta /stories (ou recebe uma específica por argumento)
 *   2. Faz upload de cada imagem no imgBB para obter URL pública
 *   3. Cria um container de Story na Instagram Graph API
 *   4. Aguarda o processamento da mídia
 *   5. Publica o container como Story no Instagram
 * 
 * Uso:
 *   node execution/publish_story.js               → publica TODOS os stories da pasta
 *   node execution/publish_story.js story_1.jpg   → publica apenas o arquivo especificado
 * 
 * Variáveis de ambiente (.env):
 *   INSTAGRAM_ACCESS_TOKEN — Token de acesso do Instagram
 *   INSTAGRAM_USER_ID      — ID do usuário do Instagram (Business)
 *   IMGBB_API_KEY          — Chave da API do imgBB para hospedagem de imagens
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// ─── Carrega variáveis de ambiente do .env ────────────────────────
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) {
    throw new Error('Arquivo .env não encontrado. Configure suas credenciais.');
  }
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
  const env = {};
  lines.forEach(line => {
    const [key, ...val] = line.split('=');
    if (key && !key.startsWith('#') && val.length) {
      env[key.trim()] = val.join('=').trim();
    }
  });
  return env;
}

// ─── Faz uma requisição HTTPS e retorna JSON ──────────────────────
function httpsRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

// ─── Faz upload da imagem para o imgBB e retorna a URL pública ────
async function uploadToImgBB(imagePath, apiKey) {
  console.log(`  📤 Enviando para imgBB: ${path.basename(imagePath)}...`);

  const imageData = fs.readFileSync(imagePath);
  const base64Image = imageData.toString('base64');
  const postData = `key=${apiKey}&image=${encodeURIComponent(base64Image)}&name=${encodeURIComponent(path.basename(imagePath))}`;

  const options = {
    hostname: 'api.imgbb.com',
    path: '/1/upload',
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(postData),
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  };

  const response = await httpsRequest(options, postData);

  if (response.status !== 200 || !response.body.success) {
    const errMsg = response.body?.error?.message || JSON.stringify(response.body);
    throw new Error(`Falha no upload para imgBB: ${errMsg}`);
  }

  const url = response.body.data.url;
  console.log(`  ✅ imgBB URL: ${url}`);
  return url;
}

// ─── Cria um container de Story na Instagram Graph API ────────────
async function createInstagramStoryContainer(imageUrl, userId, accessToken) {
  console.log(`  📱 Criando container de Story no Instagram...`);

  const postData = JSON.stringify({
    image_url: imageUrl,
    media_type: 'STORIES',
    access_token: accessToken
  });

  const options = {
    hostname: 'graph.instagram.com',
    path: `/v21.0/${userId}/media`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  const response = await httpsRequest(options, postData);

  if (!response.body.id) {
    const errMsg = response.body?.error?.message || JSON.stringify(response.body);
    throw new Error(`Falha ao criar container: ${errMsg}`);
  }

  const containerId = response.body.id;
  console.log(`  ✅ Container criado: ${containerId}`);
  return containerId;
}

// ─── Aguarda o processamento do container pela Meta ───────────────
async function waitForContainerReady(containerId, accessToken, maxRetries = 10) {
  console.log(`  ⏳ Aguardando processamento do container...`);

  for (let i = 0; i < maxRetries; i++) {
    await new Promise(r => setTimeout(r, 3000)); // Espera 3 segundos entre tentativas

    const options = {
      hostname: 'graph.instagram.com',
      path: `/v21.0/${containerId}?fields=status_code&access_token=${accessToken}`,
      method: 'GET'
    };

    const response = await httpsRequest(options);
    const status = response.body.status_code;

    console.log(`  [${i + 1}/${maxRetries}] Status: ${status}`);

    if (status === 'FINISHED') {
      console.log(`  ✅ Container pronto para publicação!`);
      return true;
    }

    if (status === 'ERROR' || status === 'EXPIRED') {
      throw new Error(`Container com falha no processamento: ${status}`);
    }
  }

  throw new Error('Timeout: container não ficou pronto a tempo.');
}

// ─── Publica o container como Story no Instagram ──────────────────
async function publishInstagramStory(containerId, userId, accessToken) {
  console.log(`  🚀 Publicando Story...`);

  const postData = JSON.stringify({
    creation_id: containerId,
    access_token: accessToken
  });

  const options = {
    hostname: 'graph.instagram.com',
    path: `/v21.0/${userId}/media_publish`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  const response = await httpsRequest(options, postData);

  if (!response.body.id) {
    const errMsg = response.body?.error?.message || JSON.stringify(response.body);
    throw new Error(`Falha ao publicar Story: ${errMsg}`);
  }

  console.log(`  🎉 Story publicado com sucesso! ID: ${response.body.id}`);
  return response.body.id;
}

// ─── Função principal ─────────────────────────────────────────────
async function main() {
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║   📸 Publicador de Stories no Instagram      ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  // Carrega credenciais
  const env = loadEnv();
  const { INSTAGRAM_ACCESS_TOKEN: token, INSTAGRAM_USER_ID: userId, IMGBB_API_KEY: imgbbKey } = env;

  if (!token || !userId || !imgbbKey) {
    console.error('❌ Credenciais incompletas no .env. Verifique INSTAGRAM_ACCESS_TOKEN, INSTAGRAM_USER_ID e IMGBB_API_KEY.');
    process.exit(1);
  }

  // Parse argumentos: suporte a --delay=N (segundos entre stories)
  const args = process.argv.slice(2);
  const delayArg = args.find(a => a.startsWith('--delay='));
  const delaySeconds = delayArg ? parseInt(delayArg.split('=')[1], 10) : 5;
  const fileArgs = args.filter(a => !a.startsWith('--'));

  // Determina quais imagens publicar
  const storiesDir = path.join(__dirname, '..', 'stories');
  let imagesToPublish = [];

  if (fileArgs.length > 0 && fileArgs[0]) {
    // Arquivo específico passado como argumento
    const specificFile = path.isAbsolute(fileArgs[0])
      ? fileArgs[0]
      : path.join(storiesDir, fileArgs[0]);

    if (!fs.existsSync(specificFile)) {
      console.error(`❌ Arquivo não encontrado: ${specificFile}`);
      process.exit(1);
    }
    imagesToPublish = [specificFile];
  } else {
    // Publica todos os stories da pasta
    if (!fs.existsSync(storiesDir)) {
      console.error('❌ Pasta /stories não encontrada. Gere os stories primeiro.');
      process.exit(1);
    }
    imagesToPublish = fs.readdirSync(storiesDir)
      .filter(f => f.endsWith('.jpg') || f.endsWith('.jpeg') || f.endsWith('.png'))
      .map(f => path.join(storiesDir, f))
      .sort();
  }

  if (imagesToPublish.length === 0) {
    console.log('⚠️  Nenhuma imagem encontrada na pasta /stories. Execute a geração de stories primeiro.');
    process.exit(0);
  }

  console.log(`📋 ${imagesToPublish.length} story(ies) para publicar:\n`);
  imagesToPublish.forEach((f, i) => console.log(`  ${i + 1}. ${path.basename(f)}`));
  console.log('');

  // Resultados
  const results = [];

  for (let i = 0; i < imagesToPublish.length; i++) {
    const imagePath = imagesToPublish[i];
    const filename = path.basename(imagePath);

    console.log(`\n─── Story ${i + 1}/${imagesToPublish.length}: ${filename} ───`);

    try {
      // 1. Upload no imgBB
      const publicUrl = await uploadToImgBB(imagePath, imgbbKey);

      // 2. Criar container no Instagram
      const containerId = await createInstagramStoryContainer(publicUrl, userId, token);

      // 3. Aguardar processamento
      await waitForContainerReady(containerId, token);

      // 4. Publicar
      const publishedId = await publishInstagramStory(containerId, userId, token);

      results.push({ filename, status: 'sucesso', id: publishedId });

      // Pausa entre publicações para evitar rate limiting
      if (i < imagesToPublish.length - 1) {
        const mins = Math.floor(delaySeconds / 60);
        const secs = delaySeconds % 60;
        const timeLabel = mins > 0 ? `${mins}min${secs > 0 ? ` ${secs}s` : ''}` : `${delaySeconds}s`;
        console.log(`  ⏸️  Aguardando ${timeLabel} antes do próximo...`);
        await new Promise(r => setTimeout(r, delaySeconds * 1000));
      }

    } catch (err) {
      console.error(`  ❌ ERRO ao publicar ${filename}: ${err.message}`);
      results.push({ filename, status: 'erro', error: err.message });
    }
  }

  // Resumo final
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║                  RESUMO FINAL                ║');
  console.log('╚══════════════════════════════════════════════╝');
  const sucessos = results.filter(r => r.status === 'sucesso').length;
  const erros = results.filter(r => r.status === 'erro').length;
  console.log(`✅ Publicados com sucesso: ${sucessos}`);
  if (erros > 0) console.log(`❌ Erros: ${erros}`);
  results.forEach(r => {
    const icon = r.status === 'sucesso' ? '✅' : '❌';
    const detail = r.status === 'sucesso' ? `ID: ${r.id}` : r.error;
    console.log(`  ${icon} ${r.filename} — ${detail}`);
  });

  // Salva log de publicação
  const logPath = path.join(__dirname, '..', '.tmp', 'publish_log.json');
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  const log = {
    publishedAt: new Date().toISOString(),
    total: results.length,
    sucesso: sucessos,
    erros,
    results
  };
  fs.writeFileSync(logPath, JSON.stringify(log, null, 2));
  console.log(`\n📝 Log salvo em: .tmp/publish_log.json`);
}

main().catch(err => {
  console.error('\n💥 Erro fatal:', err.message);
  process.exit(1);
});
