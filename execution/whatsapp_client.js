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
      resolve(sentMsg.id._serialized);
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
