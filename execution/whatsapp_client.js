/**
 * execution/whatsapp_client.js
 * ─────────────────────────────────────────────────────────────────
 * Camada 3 — Execução (Determinística)
 *
 * Biblioteca de integração do WhatsApp que gerencia a sessão localmente
 * e envia ofertas (imagem + texto) para um grupo específico.
 *
 * Uso para teste:
 *   node execution/whatsapp_client.js --test "Nome do Grupo"
 */

const fs = require('fs');
const path = require('path');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcodeTerminal = require('qrcode-terminal');

function findBrowserPath() {
  const possiblePaths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(process.env.USERPROFILE || 'C:\\Users\\danie', 'AppData\\Local\\Google\\Chrome\\Application\\chrome.exe'),
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
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
  if (reaction.reaction === '🔥') {
    const chatId = reaction.msgId.remote;
    const msgSerialized = reaction.msgId._serialized;

    console.log(`🔥 Reação de foguinho detectada no chat: ${chatId}`);
    try {
      const chat = await client.getChatById(chatId);
      // Busca mensagens recentes
      const messages = await chat.fetchMessages({ limit: 40 });
      const targetMsg = messages.find(m => m.id._serialized === msgSerialized);
      
      if (targetMsg) {
        if (targetMsg.fromMe) {
          console.log(`   Apagando mensagem ID: ${msgSerialized} para todos no grupo...`);
          await targetMsg.delete(true);
          console.log('   ✅ Mensagem excluída com sucesso via reação!');
        } else {
          console.log('   ⚠️ A mensagem reagida não foi enviada pelo bot. Ignorando.');
        }
      } else {
        // Tenta buscar direto se não achou no fetch recente
        try {
          const directMsg = await client.getMessageById(msgSerialized);
          if (directMsg && directMsg.fromMe) {
            console.log(`   Apagando mensagem direta ID: ${msgSerialized}...`);
            await directMsg.delete(true);
            console.log('   ✅ Mensagem excluída diretamente com sucesso!');
          }
        } catch (e) {
          console.log('   ⚠️ Mensagem antiga não pôde ser recuperada para exclusão.');
        }
      }
    } catch (err) {
      console.error('   ❌ Erro ao processar exclusão por reação:', err.message);
    }
  }
});

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

Comande o robô diretamente no grupo marcando *@antigravity* com os seguintes comandos:

1. 🎟️ *atualizar* ou *varrer*
   Busca ofertas recentes no Mercado Livre e atualiza cupons. Ao concluir, envia as top 3 ofertas do dia.

2. 📦 *gerar [categoria]* ou *enviar [categoria]*
   Gera o story vertical com link de afiliado e posta a melhor oferta daquela categoria no grupo.
   _Exemplo:_ \`@antigravity gerar cozinha\` ou \`@antigravity enviar eletronicos\`
   _Categorias:_ \`cozinha\`, \`suplementos\`, \`eletronicos\`, \`celulares\`, \`moda\`, \`beleza\`, \`eletrodomesticos\`.

3. ⚡ *status*
   Exibe a integridade da conexão do robô e o limite diário.`;
        await msg.reply(helpText);
        console.log('   ✅ Resposta de ajuda enviada.');
      } 
      else if (cleanMsg === 'status') {
        const uptime = process.uptime();
        const hrs = Math.floor(uptime / 3600);
        const mins = Math.floor((uptime % 3600) / 60);
        const uptimeStr = `${hrs}h ${mins}m`;
        const sessionActive = fs.existsSync(path.join(__dirname, '..', '.tmp', 'ml_user_data'));
        
        const statusText = `🤖 *STATUS DO ROBÔ*

🔌 Conexão WhatsApp: *ONLINE* ✅
🔒 Sessão Mercado Livre: *${sessionActive ? 'ATIVA ✅' : 'EXPIRADA ❌'}*
⏱️ Servidor Online: *${uptimeStr}*
📊 Limite de Posts: *30 por dia*`;
        await msg.reply(statusText);
        console.log('   ✅ Resposta de status enviada.');
      }
      else if (cleanMsg.startsWith('atualizar') || cleanMsg.startsWith('varrer')) {
        await msg.reply('⏳ *Entendido!* Iniciando varredura e atualização de ofertas no Mercado Livre...\nIsso pode levar de 15 a 30 segundos. Mandarei o resumo ao terminar.');
        
        const { exec } = require('child_process');
        exec('node execution/mercado_livre_deals.js', async (err, stdout, stderr) => {
          if (err) {
            console.error('Erro no scraper via WhatsApp:', err.message);
            await msg.reply(`❌ *Falha ao atualizar ofertas:* ${err.message}`);
            return;
          }
          
          const dealsReportPath = path.join(__dirname, '..', 'mercado_livre_deals_report.json');
          if (fs.existsSync(dealsReportPath)) {
            try {
              const data = JSON.parse(fs.readFileSync(dealsReportPath, 'utf-8'));
              const deals = data.deals || [];
              
              if (deals.length === 0) {
                await msg.reply('✅ *Atualização concluída!* Nenhuma oferta ativa localizada.');
                return;
              }
              
              const sorted = [...deals].sort((a, b) => b.discount - a.discount).slice(0, 3);
              let summary = `✅ *VARREDURA COMPLETA!* Base de ofertas atualizada.\n\n*Top 3 Maiores Descontos do Dia:*\n`;
              
              sorted.forEach((d, idx) => {
                summary += `\n*${idx + 1}. ${d.title.substring(0, 50)}...*\n🔥 *${d.discount}% OFF* | Por: *${d.currentPrice}*\n`;
              });
              
              summary += `\n💡 _Dica: Digite \`@antigravity gerar [categoria]\` para gerar o story de alguma delas!_`;
              await msg.reply(summary);
            } catch (e) {
              await msg.reply('✅ *Atualização concluída!* Mas ocorreu um erro ao abrir a lista de ofertas.');
            }
          } else {
            await msg.reply('✅ *Atualização concluída!* Mas a base de dados não foi encontrada.');
          }
        });
      }
      else if (cleanMsg.startsWith('gerar') || cleanMsg.startsWith('enviar') || cleanMsg.startsWith('story')) {
        // Extrai a categoria
        const match = cleanMsg.match(/(?:gerar|enviar|story)\s+(.+)/i);
        if (!match) {
          await msg.reply('⚠️ *Por favor, especifique a categoria.* Exemplo: `@antigravity gerar cozinha`');
          return;
        }
        
        const categoryInput = match[1].trim().toLowerCase();
        let targetCategory = '';
        
        if (categoryInput.includes('cozinha') || categoryInput.includes('casa') || categoryInput.includes('panela') || categoryInput.includes('frigideira')) {
          targetCategory = 'Casa e Cozinha';
        } else if (categoryInput.includes('suplemento') || categoryInput.includes('saude') || categoryInput.includes('whey') || categoryInput.includes('esporte') || categoryInput.includes('creatina')) {
          targetCategory = 'Saúde e Esportes';
        } else if (categoryInput.includes('eletr') || categoryInput.includes('som') || categoryInput.includes('fone') || categoryInput.includes('gamer') || categoryInput.includes('relogio') || categoryInput.includes('smartwatch')) {
          targetCategory = 'Eletrônicos e Acessórios';
        } else if (categoryInput.includes('celular') || categoryInput.includes('iphone') || categoryInput.includes('smartphone') || categoryInput.includes('telef')) {
          targetCategory = 'Celulares';
        } else if (categoryInput.includes('moda') || categoryInput.includes('roupa') || categoryInput.includes('tenis') || categoryInput.includes('vestido')) {
          targetCategory = 'Moda e Calçados';
        } else if (categoryInput.includes('beleza') || categoryInput.includes('perfume') || categoryInput.includes('shampoo') || categoryInput.includes('cosmetico')) {
          targetCategory = 'Beleza e Cuidado Pessoal';
        } else if (categoryInput.includes('eletrodo') || categoryInput.includes('ar condicionado') || categoryInput.includes('ventilador') || categoryInput.includes('aspirador')) {
          targetCategory = 'Eletrodomésticos';
        }
        
        if (!targetCategory) {
          await msg.reply(`⚠️ *Categoria "${categoryInput}" não reconhecida.*\nTente: _cozinha, suplementos, eletronicos, celulares, moda, beleza, eletrodomesticos_.`);
          return;
        }

        await msg.reply(`⏳ *Processando:* Buscando a melhor oferta de *${targetCategory}* e renderizando o Story...`);

        const dealsReportPath = path.join(__dirname, '..', 'mercado_livre_deals_report.json');
        if (!fs.existsSync(dealsReportPath)) {
          await msg.reply('❌ Base de dados de ofertas não encontrada. Use `@antigravity atualizar` antes.');
          return;
        }

        const data = JSON.parse(fs.readFileSync(dealsReportPath, 'utf-8'));
        const deals = data.deals || [];
        
        // Função auxiliar interna para inferência idêntica
        const inferCategoryLocal = (title) => {
          const t = title.toLowerCase();
          if (t.includes('panela') || t.includes('frigideira') || t.includes('cozinha') || t.includes('prato') || t.includes('copo') || t.includes('chaleira') || t.includes('fritadeira') || t.includes('cafeteira') || t.includes('airfryer') || t.includes('forno') || t.includes('fogao') || t.includes('microondas')) return 'Casa e Cozinha';
          if (t.includes('creatina') || t.includes('suplemento') || t.includes('whey') || t.includes('proteina') || t.includes('caps') || t.includes('omega') || t.includes('vitamina') || t.includes('dark lab') || t.includes('soldiers') || t.includes('colageno')) return 'Saúde e Esportes';
          if (t.includes('fone') || t.includes('headset') || t.includes('caixa de som') || t.includes('alexa') || t.includes('smart') || t.includes('relogio') || t.includes('watch') || t.includes('jbl') || t.includes('bluetooth') || t.includes('teclado') || t.includes('mouse') || t.includes('gamer')) return 'Eletrônicos e Acessórios';
          if (t.includes('smartphone') || t.includes('celular') || t.includes('iphone') || t.includes('motorola') || t.includes('samsung') || t.includes('xiaomi') || t.includes('redmi')) return 'Celulares';
          if (t.includes('vestido') || t.includes('camisa') || t.includes('camiseta') || t.includes('calça') || t.includes('tenis') || t.includes('sapato') || t.includes('bota') || t.includes('mochila') || t.includes('moda') || t.includes('roupa') || t.includes('casaco') || t.includes('jaqueta')) return 'Moda e Calçados';
          if (t.includes('perfume') || t.includes('fragrancia') || t.includes('sedutor') || t.includes('shampoo') || t.includes('creme') || t.includes('maquiagem') || t.includes('cosmetico') || t.includes('hidratante')) return 'Beleza e Cuidado Pessoal';
          if (t.includes('ventilador') || t.includes('ar condicionado') || t.includes('aquecedor') || t.includes('climatizador') || t.includes('extratora') || t.includes('aspirador') || t.includes('lavadora') || t.includes('secadora')) return 'Eletrodomésticos';
          return 'Ofertas Gerais';
        };

        const categoryDeals = deals.filter(d => inferCategoryLocal(d.title) === targetCategory);

        if (categoryDeals.length === 0) {
          await msg.reply(`⚠️ *Nenhuma oferta ativa* de *${targetCategory}* foi encontrada. Tente rodar \`@antigravity atualizar\` antes.`);
          return;
        }

        // Seleciona a de maior desconto
        categoryDeals.sort((a, b) => b.discount - a.discount);
        const bestDeal = categoryDeals[0];

        // Processamento síncrono da oferta
        const { execSync } = require('child_process');
        // Gera hash de ID simples
        const dealId = `deal_${Math.abs(bestDeal.title.length + bestDeal.discount)}`;
        const localLastLinkPath = path.join(__dirname, '..', '.tmp', `last_link_${dealId}.txt`);
        const singleSelectionPath = path.join(__dirname, '..', '.tmp', `wpp_single_deal_${dealId}.json`);
        const storiesDir = path.join(__dirname, '..', 'stories');

        try {
          // 1. Extrai link de afiliado (headless)
          if (fs.existsSync(localLastLinkPath)) fs.unlinkSync(localLastLinkPath);
          execSync(`node execution/get_meli_affiliate_link.js "${bestDeal.link}" "${localLastLinkPath}"`, {
            cwd: path.join(__dirname, '..')
          });

          let affiliateLink = bestDeal.link;
          if (fs.existsSync(localLastLinkPath)) {
            affiliateLink = fs.readFileSync(localLastLinkPath, 'utf-8').trim();
            fs.unlinkSync(localLastLinkPath);
          }

          // 2. Gera a imagem do Story
          const tempSelectionData = {
            generatedAt: new Date().toISOString(),
            deals: [{ ...bestDeal, link: bestDeal.link }],
            selectedCoupon: data.coupons && data.coupons.length > 0 ? data.coupons[0] : null
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
            cwd: path.join(__dirname, '..')
          });

          fs.unlinkSync(singleSelectionPath);

          const generatedFiles = fs.readdirSync(storiesDir).filter(f => f.endsWith('.jpg'));
          if (generatedFiles.length === 0) {
            throw new Error('Falha ao renderizar imagem do story no Sharp/Puppeteer.');
          }
          const storyImagePath = path.join(storiesDir, generatedFiles[0]);

          // 3. Envia no WhatsApp com caption formatada
          const wppMessage = `🔥 *OFERTA ENCONTRADA!* \n\n*${bestDeal.title}*\n\n🔥 *${bestDeal.discount}% OFF*\nDe: ~~${bestDeal.originalPrice}~~\nPor: *${bestDeal.currentPrice}*\n\n👉 *Compre pelo link:* ${affiliateLink}\n\n📌 _Categoria: ${targetCategory}_`;
          
          const media = MessageMedia.fromFilePath(storyImagePath);
          await client.sendMessage(msg.from, media, { caption: wppMessage });
          console.log(`   ✅ Oferta de ${targetCategory} postada via comando.`);

        } catch (execErr) {
          console.error('Erro ao gerar story por comando:', execErr.message);
          await msg.reply(`❌ *Erro ao gerar story:* ${execErr.message}`);
        }
      }
      else {
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
        // ID real e verificado de produção do grupo Alerta de Descontos
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
      resolve(sentMsg && sentMsg.id ? sentMsg.id._serialized : 'sent_success_no_id');
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

// Execução de teste via linha de comando
const args = process.argv.slice(2);
if (args.includes('--test')) {
  const targetGroup = args[args.indexOf('--test') + 1] || 'Alerta de Descontos';
  
  client.on('ready', async () => {
    console.log(`🚀 Iniciando envio de teste para o grupo "${targetGroup}"...`);
    const testMsg = `🧪 *TESTE DE INTEGRAÇÃO DO ROBÔ* \n\nA conexão entre o robô e o WhatsApp foi realizada com sucesso!\n\n_Horário do teste:_ ${new Date().toLocaleTimeString('pt-BR')}`;
    
    try {
      await sendOffer(targetGroup, testMsg);
      console.log('🎉 Teste concluído com sucesso! Fechando em 3s...');
      setTimeout(() => process.exit(0), 3000);
    } catch (e) {
      console.error('💥 Erro no teste:', e.message);
      process.exit(1);
    }
  });

  // Timeout caso fique travado sem ler QR Code
  setTimeout(() => {
    console.log('\n⚠️  Tempo esgotado. Se você não escaneou o QR Code, execute o comando novamente.');
    process.exit(1);
  }, 120000); // 2 minutos
}

module.exports = {
  client,
  sendOffer
};
