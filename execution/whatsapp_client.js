/**
 * execution/whatsapp_client.js
 * ─────────────────────────────────────────────────────────────────
 * Camada 3 — Execução (Determinística)
 *
 * Biblioteca de integração do WhatsApp que gerencia a sessão localmente
 * e envia ofertas (imagem + texto) para um grupo específico.
 */

const fs = require('fs');
const path = require('path');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcodeTerminal = require('qrcode-terminal');
const { TAXONOMY, inferCategoryAndSub } = require('./category_helper.js');

function findBrowserPath() {
  const possiblePaths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(process.env.USERPROFILE || 'C:\\Users\\danie', 'AppData\\Local\\Google\\Chrome\\Application\\chrome.exe'),
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser'
  ];

  for (const executablePath of possiblePaths) {
    if (fs.existsSync(executablePath)) {
      return executablePath;
    }
  }
  return null;
}

// Configuração do Cliente
const sessionPath = path.join(__dirname, '..', '.tmp', 'wpp_session');
fs.mkdirSync(sessionPath, { recursive: true });

const browserPath = findBrowserPath();

const client = new Client({
  authStrategy: new LocalAuth({
    clientId: 'ml-affiliates',
    dataPath: sessionPath
  }),
  puppeteer: {
    executablePath: browserPath || undefined,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu'
    ]
  }
});

// Eventos de Autenticação
client.on('qr', (qr) => {
  console.log('\n======================================================================');
  console.log('🔒 AUTENTICAÇÃO DO WHATSAPP REQUERIDA');
  console.log('Escaneie o QR Code abaixo usando o aplicativo WhatsApp no seu celular:');
  console.log('======================================================================\n');
  qrcodeTerminal.generate(qr, { small: true });
});

client.on('ready', async () => {
  console.log('✅ Conexão com o WhatsApp estabelecida com sucesso!');
  
  // Tenta fechar qualquer modal de novidades/anúncios do WhatsApp Web que possa bloquear o envio
  try {
    const page = client.pupPage;
    const modalClosed = await page.evaluate(() => {
      const closeBtn = document.querySelector('button[aria-label*="fechar" i], button[aria-label*="close" i], div[role="button"][aria-label*="fechar" i], div[role="button"][aria-label*="close" i]');
      if (closeBtn) {
        closeBtn.click();
        return 'closed_via_x_button';
      }
      
      const buttons = Array.from(document.querySelectorAll('button, div[role="button"]'));
      const greenBtn = buttons.find(b => {
        const text = b.textContent?.toLowerCase() || '';
        return text.includes('entendi') || text.includes('continuar') || text.includes('fechar') || text.includes('ok');
      });
      
      if (greenBtn) {
        greenBtn.click();
        return 'closed_via_green_button';
      }
      
      return 'no_modal_found';
    });
    console.log(`🤖 Fechamento de modal automático do WhatsApp Web: ${modalClosed}`);
  } catch (err) {
    console.warn('⚠️ Erro ao tentar fechar modal do WhatsApp Web:', err.message);
  }
});

client.on('auth_failure', (msg) => {
  console.error('❌ Falha na autenticação do WhatsApp:', msg);
});

client.on('disconnected', (reason) => {
  console.log('⚠️ Sessão do WhatsApp desconectada:', reason);
});

// Escuta de reações para moderação (foguinho 🔥 apaga o post para todos)
client.on('message_reaction', async (reaction) => {
  if (!reaction || !reaction.msgId) return;

  try {
    const chatId = reaction.msgId.remote._serialized || reaction.msgId.remote;
    const msgSerialized = reaction.msgId._serialized || `${reaction.msgId.fromMe}_${chatId}_${reaction.msgId.id}`;

    console.log(`🤖 [WhatsApp Reaction] Reação recebida: "${reaction.reaction}" de ${reaction.senderId} na msg: ${msgSerialized}`);

    if (reaction.reaction === '🔥') {
      console.log(`🔥 Reação de foguinho detectada no chat: ${chatId}. Processando exclusão via wwebjs...`);
      
      try {
        const message = await client.getMessageById(msgSerialized);
        if (message) {
          if (message.fromMe) {
            console.log(`   Apagando mensagem ID: ${msgSerialized} para todos no grupo...`);
            await message.delete(true);
            console.log('   ✅ [Moderação] Mensagem excluída com sucesso via reação!');
          } else {
            console.log('   ⚠️ [Moderação] A mensagem reagida não foi enviada pelo bot. Ignorando.');
          }
        } else {
          console.warn(`   ⚠️ [Moderação] Mensagem não encontrada no cache do WhatsApp para exclusão.`);
        }
      } catch (errEx) {
        console.error(`   ❌ [Moderação] Erro ao deletar mensagem via wwebjs:`, errEx.message);
      }
    }
  } catch (err) {
    console.error('   ❌ Erro no processamento da reação:', err);
  }
});

// Helper para mesclar ofertas locais de Mercado Livre e Shopee
function getMergedDeals() {
  const mlPath = path.join(__dirname, '..', 'mercado_livre_deals_report.json');
  const amazonPath = path.join(__dirname, '..', 'amazon_deals_report.json');
  let deals = [];
  
  if (fs.existsSync(mlPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(mlPath, 'utf-8'));
      if (Array.isArray(data.deals)) {
        deals = deals.concat(data.deals.map(d => ({ ...d, platform: 'Mercado Livre' })));
      }
    } catch (e) {}
  }
  
  if (fs.existsSync(amazonPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(amazonPath, 'utf-8'));
      if (Array.isArray(data.deals)) {
        deals = deals.concat(data.deals.map(d => ({ ...d, platform: 'Amazon' })));
      }
    } catch (e) {}
  }
  
  // Ordena decrescente por desconto
  return deals.sort((a, b) => b.discount - a.discount);
}

// Inferência de categoria via Helper unificado
function inferCategoryLocal(title) {
  const info = inferCategoryAndSub(title);
  return `${info.icon} ${info.category} > ${info.subcategory}`;
}

// Listener de mensagens recebidas para comandos interativos do @antigravity
client.on('message', async (msg) => {
  const body = msg.body || '';
  if (body.toLowerCase().includes('@antigravity')) {
    // Evita loop: ignora se a mensagem foi enviada pelo próprio bot
    if (msg.fromMe) return;

    console.log(`🤖 [WhatsApp Command] Menção recebida de ${msg.from}: "${body}"`);

    // Limpa a menção para ler o comando
    const cleanMsg = body.replace(/@antigravity/gi, '').trim().toLowerCase();

    try {
      if (cleanMsg === 'ajuda' || cleanMsg === 'comandos' || cleanMsg === '') {
        const helpText = `🤖 *ROBÔ ANTIGRAVITY - GUIA DE COMANDOS*

Comande o robô diretamente marcando *@antigravity* com os seguintes comandos:

1. 🎟️ *atualizar* ou *varrer*
   Faz a varredura concorrente de Mercado Livre e Amazon, e atualiza os cupons.

2. 📦 *[quantidade]* (ex: \`5\` ou \`enviar 3\`)
   Posta as melhores X ofertas gerais do momento (ML + Amazon unificados) com Stories e links diretos.

3. 🏷️ *[categoria ou subcategoria]* (ex: \`celulares\`, \`cozinha\`, \`suplementos\` ou \`fone\`)
   Posta a melhor oferta ativa daquela categoria ou subcategoria específica.

4. ⚡ *status*
   Exibe a integridade da conexão do robô.`;
        await msg.reply(helpText);
        console.log('   ✅ Resposta de ajuda enviada.');
      } 
      else if (cleanMsg === 'status') {
        const uptime = process.uptime();
        const hrs = Math.floor(uptime / 3600);
        const mins = Math.floor((uptime % 3600) / 60);
        const uptimeStr = `${hrs}h ${mins}m`;
        const mlActive = fs.existsSync(path.join(__dirname, '..', 'mercado_livre_deals_report.json'));
        const amazonActive = fs.existsSync(path.join(__dirname, '..', 'amazon_deals_report.json'));
        
        const statusText = `🤖 *STATUS DO ROBÔ*

🔌 Conexão WhatsApp: *ONLINE* ✅
🛍️ Base Mercado Livre: *${mlActive ? 'ATIVA ✅' : 'INATIVA ❌'}*
🟡 Base Amazon: *${amazonActive ? 'ATIVA ✅' : 'INATIVA ❌'}*
⏱️ Servidor Online: *${uptimeStr}*`;
        await msg.reply(statusText);
        console.log('   ✅ Resposta de status enviada.');
      }
      else if (cleanMsg === 'apagar' || cleanMsg === 'apaga' || cleanMsg === 'deletar' || cleanMsg === 'excluir') {
        if (msg.hasQuotedMsg) {
          const quotedMsg = await msg.getQuotedMessage();
          const quotedSerialized = quotedMsg.id._serialized;
          
          console.log(`🔥 [Comando Apagar] Solicitada exclusão da mensagem citada: ${quotedSerialized}`);
          
          const result = await client.pupPage.evaluate(async (msgId) => {
            try {
              if (!window.Store || !window.Store.Msg || !window.Store.Cmd) {
                return { success: false, error: 'Store do WhatsApp Web não disponível no browser' };
              }
              const msg = window.Store.Msg.get(msgId);
              if (!msg) {
                return { success: false, error: 'Mensagem não encontrada no cache do navegador' };
              }
              if (!msg.id.fromMe) {
                return { success: false, error: 'A mensagem reagida não foi enviada pelo bot (fromMe === false)' };
              }
              await window.Store.Cmd.sendDeleteMsgs(msg.chat, [msg], true);
              return { success: true };
            } catch (e) {
              return { success: false, error: e.message };
            }
          }, quotedSerialized);

          if (result && result.success) {
            console.log(`   ✅ [Comando Apagar] Mensagem citada excluída com sucesso!`);
            // Tenta apagar a mensagem de comando do usuário para limpar o chat
            try {
              await msg.delete(true);
            } catch (errDeleteCmd) {
              console.log('   ⚠️ Não foi possível apagar a mensagem de comando (o bot não é admin do grupo).');
            }
          } else {
            console.warn(`   ⚠️ [Comando Apagar] Falha ao excluir:`, result ? result.error : 'Sem resposta');
            await msg.reply('⚠️ Não consegui apagar essa mensagem. Verifique se ela foi enviada por mim e se não é muito antiga.');
          }
        } else {
          await msg.reply('⚠️ Para apagar uma oferta, responda (reply) a ela no grupo marcando: `@antigravity apagar`.');
        }
      }
      else if (cleanMsg.startsWith('atualizar') || cleanMsg.startsWith('varrer')) {
        await msg.reply('⏳ *Entendido!* Iniciando varredura concorrente no Mercado Livre e Amazon...\nIsso pode levar cerca de 30 segundos. Mandarei o resumo ao terminar.');
        
        const { exec } = require('child_process');
        
        // Executa scrapers concorrentes
        const mlPromise = new Promise((resolve) => {
          exec('node execution/mercado_livre_deals.js', (err) => resolve(!err));
        });
        const amazonPromise = new Promise((resolve) => {
          exec('node execution/amazon_deals.js', (err) => resolve(!err));
        });

        Promise.all([mlPromise, amazonPromise]).then(async (results) => {
          const mlSuccess = results[0];
          const amazonSuccess = results[1];
          
          let statusReport = `✅ *VARREDURA COMPLETA!*\n\n`;
          statusReport += `🛍️ Mercado Livre: ${mlSuccess ? '*Sucesso* ✅' : '*Falha* ❌'}\n`;
          statusReport += `🟡 Amazon: ${amazonSuccess ? '*Sucesso* ✅' : '*Falha* ❌'}\n\n`;

          const deals = getMergedDeals();
          if (deals.length === 0) {
            statusReport += `⚠️ Nenhuma oferta ativa localizada nas bases locais.`;
          } else {
            const sorted = deals.slice(0, 3);
            statusReport += `*Top 3 Maiores Descontos do Dia:*\n`;
            sorted.forEach((d, idx) => {
              statusReport += `\n*${idx + 1}. [${d.platform}] ${d.title.substring(0, 45)}...*\n🔥 *${d.discount}% OFF* | Por: *${d.currentPrice}*\n`;
            });
          }
          await msg.reply(statusReport);
        });
      }
      else {
        // Verifica se é pedido de quantidade (ex: "5", "enviar 3", "mandar 10")
        const numMatch = cleanMsg.match(/(?:enviar|mandar|gerar)?\s*(\d+)/i);
        if (numMatch) {
          const qty = parseInt(numMatch[1], 10);
          if (qty <= 0 || qty > 10) {
            await msg.reply('⚠️ *Quantidade inválida.* Digite um número de 1 a 10.');
            return;
          }

          await msg.reply(`⏳ *Processando:* Buscando as top ${qty} ofertas unificadas e gerando os Stories...`);
          
          const deals = getMergedDeals();
          if (deals.length === 0) {
            await msg.reply('❌ Nenhuma oferta localizada nas bases locais. Use `@antigravity atualizar` antes.');
            return;
          }

          const selected = deals.slice(0, qty);
          const { execSync } = require('child_process');
          const storiesDir = path.join(__dirname, '..', 'stories');

          for (let i = 0; i < selected.length; i++) {
            const deal = selected[i];
            const dealId = `wpp_deal_${Math.abs(deal.title.length + deal.discount)}_${i}`;
            const singleSelectionPath = path.join(__dirname, '..', '.tmp', `wpp_single_deal_${dealId}.json`);
            
            try {
              // 1. Prepara dados e gera story (Puppeteer no backend de fallback)
              const tempSelectionData = {
                generatedAt: new Date().toISOString(),
                deals: [{ ...deal, link: deal.link }],
                selectedCoupon: null
              };
              fs.writeFileSync(singleSelectionPath, JSON.stringify(tempSelectionData, null, 2), 'utf-8');

              // Limpa diretório de stories temporariamente
              if (fs.existsSync(storiesDir)) {
                fs.readdirSync(storiesDir)
                  .filter(f => f.endsWith('.jpg'))
                  .forEach(f => {
                    try { fs.unlinkSync(path.join(storiesDir, f)); } catch (e) {}
                  });
              }

              // Roda gerador
              execSync(`node execution/generate_stories.js "${singleSelectionPath}"`, {
                cwd: path.join(__dirname, '..'),
                stdio: 'ignore'
              });
              
              try { fs.unlinkSync(singleSelectionPath); } catch (e) {}

              const generatedFiles = fs.readdirSync(storiesDir).filter(f => f.endsWith('.jpg'));
              if (generatedFiles.length > 0) {
                const storyImagePath = path.join(storiesDir, generatedFiles[0]);
                const media = MessageMedia.fromFilePath(storyImagePath);
                
                // Formata a legenda com a tag da plataforma
                const platformTag = deal.platform === 'Amazon' ? '🟡 *AMAZON*' : '🛍️ *MERCADO LIVRE*';
                const category = inferCategoryLocal(deal.title);
                
                const wppMessage = `🔥 *OFERTA ENCONTRADA!* \n\n*${deal.title}*\n\n🔥 *${deal.discount}% OFF*\nDe: ~~${deal.originalPrice}~~\nPor: *${deal.currentPrice}*\n\n👉 *Compre pelo link:* ${deal.link}\n\n📌 _Categoria: ${category}_\nPlataforma: ${platformTag}`;
                
                // Envia
                await client.sendMessage(msg.from, media, { caption: wppMessage });
                console.log(`   ✅ Oferta ${i+1}/${qty} enviada via comando de quantidade.`);
              }
            } catch (err) {
              console.error(`Erro ao gerar/enviar story para o item ${i}:`, err.message);
            }
            // Intervalo curto de segurança entre mensagens
            await new Promise(r => setTimeout(r, 2500));
          }
          return;
        }

        // Caso contrário, tenta identificar uma categoria ou subcategoria (ex: "celulares", "cozinha", "suplementos")
        let targetCategory = '';
        let targetSubcategory = '';
        let displayLabel = '';

        const categoryInput = cleanMsg.trim().toLowerCase();

        // Busca se bate com categoria ou subcategoria na taxonomia
        for (const [catName, catData] of Object.entries(TAXONOMY)) {
          const catNameLower = catName.toLowerCase();
          if (catNameLower.includes(categoryInput) || categoryInput.includes(catNameLower)) {
            targetCategory = catName;
            displayLabel = `${catData.icon} ${catName}`;
            break;
          }

          for (const [subName, keywords] of Object.entries(catData.subcategories)) {
            const subNameLower = subName.toLowerCase();
            if (subNameLower.includes(categoryInput) || categoryInput.includes(subNameLower) || keywords.some(k => categoryInput.includes(k) || k.includes(categoryInput))) {
              targetCategory = catName;
              targetSubcategory = subName;
              displayLabel = `${catData.icon} ${catName} > ${subName}`;
              break;
            }
          }
          if (targetCategory) break;
        }

        if (targetCategory) {
          await msg.reply(`⏳ *Processando:* Buscando a melhor oferta de *${displayLabel}*...`);
          
          const deals = getMergedDeals();
          const categoryDeals = deals.filter(d => {
            const info = inferCategoryAndSub(d.title);
            if (targetSubcategory) {
              return info.subcategory === targetSubcategory;
            }
            return info.category === targetCategory;
          });

          if (categoryDeals.length === 0) {
            await msg.reply(`⚠️ *Nenhuma oferta ativa* de *${displayLabel}* foi encontrada. Tente rodar \`@antigravity atualizar\` antes.`);
            return;
          }

          // Melhor oferta da categoria/subcategoria
          const bestDeal = categoryDeals[0];
          const dealId = `wpp_cat_${Math.abs(bestDeal.title.length + bestDeal.discount)}`;
          const singleSelectionPath = path.join(__dirname, '..', '.tmp', `wpp_single_deal_${dealId}.json`);
          const storiesDir = path.join(__dirname, '..', 'stories');
          const { execSync } = require('child_process');

          try {
            const tempSelectionData = {
              generatedAt: new Date().toISOString(),
              deals: [{ ...bestDeal, link: bestDeal.link }],
              selectedCoupon: null
            };
            fs.writeFileSync(singleSelectionPath, JSON.stringify(tempSelectionData, null, 2), 'utf-8');

            if (fs.existsSync(storiesDir)) {
              fs.readdirSync(storiesDir)
                .filter(f => f.endsWith('.jpg'))
                .forEach(f => {
                  try { fs.unlinkSync(path.join(storiesDir, f)); } catch (e) {}
                });
            }

            execSync(`node execution/generate_stories.js "${singleSelectionPath}"`, {
              cwd: path.join(__dirname, '..'),
              stdio: 'ignore'
            });

            try { fs.unlinkSync(singleSelectionPath); } catch (e) {}

            const generatedFiles = fs.readdirSync(storiesDir).filter(f => f.endsWith('.jpg'));
            if (generatedFiles.length > 0) {
              const storyImagePath = path.join(storiesDir, generatedFiles[0]);
              const media = MessageMedia.fromFilePath(storyImagePath);
              
              const platformTag = bestDeal.platform === 'Amazon' ? '🟡 *AMAZON*' : '🛍️ *MERCADO LIVRE*';
              const bestDealCategoryStr = inferCategoryLocal(bestDeal.title);
              const wppMessage = `🔥 *OFERTA ENCONTRADA!* \n\n*${bestDeal.title}*\n\n🔥 *${bestDeal.discount}% OFF*\nDe: ~~${bestDeal.originalPrice}~~\nPor: *${bestDeal.currentPrice}*\n\n👉 *Compre pelo link:* ${bestDeal.link}\n\n📌 _Categoria: ${bestDealCategoryStr}_\nPlataforma: ${platformTag}`;
              
              await client.sendMessage(msg.from, media, { caption: wppMessage });
              console.log(`   ✅ Oferta da categoria ${displayLabel} enviada.`);
            }
          } catch (err) {
            console.error('Erro ao gerar story para categoria:', err.message);
            await msg.reply(`❌ *Erro ao processar story:* ${err.message}`);
          }
          return;
        }

        // Se nada coincidir
        await msg.reply('🤖 *Comando não reconhecido.* Marque *@antigravity ajuda* para ver a lista de comandos.');
      }
    } catch (err) {
      console.error('Erro no processamento da mensagem:', err.message);
      await msg.reply(`❌ *Erro interno:* ${err.message}`);
    }
  }
});

// Função principal para envio de ofertas
async function sendOffer(groupNameOrId, messageText, imagePath = null) {
  return new Promise(async (resolve, reject) => {
    try {
      let chatId = null;

      // Se for um ID válido do WhatsApp (termina com @g.us ou @c.us)
      if (groupNameOrId.includes('@')) {
        chatId = groupNameOrId;
      } else if (groupNameOrId === 'Alerta de Descontos') {
        chatId = '120363410833991285@g.us';
      } else {
        console.log(`📡 Buscando chat pelo nome "${groupNameOrId}"...`);
        const chats = await client.getChats();
        const groupChat = chats.find(chat => chat.name === groupNameOrId);
        if (groupChat) {
          chatId = groupChat.id._serialized;
        }
      }

      if (!chatId) {
        return reject(new Error(`Chat ou Grupo "${groupNameOrId}" não foi localizado nos chats ativos.`));
      }

      console.log(`📌 Destinatário resolvido: ID = ${chatId}`);

      let sentMsg;
      if (imagePath && fs.existsSync(imagePath)) {
        console.log(`📸 Preparando mídia: ${path.basename(imagePath)}`);
        const media = MessageMedia.fromFilePath(imagePath);
        
        console.log(`📤 Enviando imagem + texto...`);
        sentMsg = await client.sendMessage(chatId, media, { caption: messageText });
      } else {
        console.log(`📤 Enviando apenas texto...`);
        sentMsg = await client.sendMessage(chatId, messageText);
      }

      console.log('✅ Mensagem enviada com sucesso!');
      console.log('🤖 Debug sentMsg:', sentMsg ? { hasId: !!sentMsg.id, idType: typeof sentMsg.id, idVal: sentMsg.id } : 'null');
      
      let extractedId = null;
      if (sentMsg && sentMsg.id) {
        if (typeof sentMsg.id === 'object') {
          extractedId = sentMsg.id._serialized || sentMsg.id.id;
        } else {
          extractedId = sentMsg.id;
        }
      }
      resolve(extractedId || 'sent_success_no_id');
    } catch (err) {
      console.error('❌ Falha no envio da mensagem:', err.message);
      reject(err);
    }
  });
}

// Listeners de falha do cliente
client.on('auth_failure', (msg) => {
  console.error('❌ Falha na autenticação do WhatsApp Web:', msg);
});
client.on('disconnected', (reason) => {
  console.warn('⚠️ WhatsApp Web desconectado:', reason);
});

// Inicializa de forma segura
client.initialize().catch(err => {
  console.error('💥 Erro durante o bootstrap do WhatsApp Web:', err.message);
});

module.exports = {
  client,
  sendOffer
};
