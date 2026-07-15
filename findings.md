# Descobertas e Pesquisas (findings.md)

Este documento registra as descobertas de pesquisas, especificações técnicas e limitações encontradas durante a integração com a API do Instagram.

## Descobertas Técnicas
- **Instagram Graph API para Stories**:
  - Requer conta profissional (Business ou Creator) conectada a uma página do Facebook.
  - O fluxo oficial da API é assíncrono: cria-se um container (`POST /{ig-user-id}/media`), aguarda-se o processamento e publica-se (`POST /{ig-user-id}/media_publish`).
  - O Instagram exige que a imagem esteja hospedada em um endereço de internet público (com protocolo HTTP ou HTTPS).
- **Hospedagem de Imagens Temporária (imgBB)**:
  - Usaremos a API gratuita do imgBB para fazer upload temporário dos arquivos JPG gerados localmente e obter uma URL direta.
  - A API do imgBB aceita uploads via POST multipart/form-data enviando a imagem codificada em base64 ou binário e retorna o link direto em JSON.

## Verificação de Disponibilidade de Usuários (Instagram)
- **Bloqueio de Scraping e Rate Limits**:
  - O Instagram monitora acessos anônimos repetidos de forma agressiva. Requisições HTTP diretas (via fetch/axios) podem receber status 302 redirecionando para a página de login após poucas tentativas.
  - O uso do `puppeteer-core` simulando um navegador real, com User-Agent modificado e atrasos aleatórios (delays de 1 a 3 segundos entre requisições), aumenta a taxa de sucesso na detecção de perfis ativos.
  - **Critério de Disponibilidade**: Se a página carregar o elemento de título indicando erro ("Esta página não está disponível" ou similar no DOM), o nome é considerado teoricamente vago (disponível para criação). Se carregar elementos de perfil (como posts, biografia ou botões de seguir), está indisponível.

## Sessão e Automação no Mercado Livre (Afiliados)
- **Concorrência com Chrome Principal**: Se o usuário rodar comandos que executam o Chrome com o mesmo perfil de dados quando o Chrome dele pessoal já está aberto, o Windows costuma ignorar a flag `--user-data-dir` e reencaminhar as requisições como novas abas do perfil pessoal dele.
- **Solução via Script Batch**: O uso de um arquivo `.bat` contendo a diretiva `start "" "C:\...\chrome.exe" --user-data-dir="%~dp0.tmp\ml_user_data"` garante que o sistema do Windows force o isolamento correto e salve as credenciais na pasta temporária.
- **Barra de Afiliados no DOM**: Uma vez logado, a página de produtos renderiza a barra superior de afiliados sob o contêiner de ID `#stripe` (ou classe `.toolbar`), contendo os botões de compartilhamento e métricas.
 
+## Proteção Anti-Bot do Mercado Livre e Scrapers de Cupons
+- **Bloqueio de Cupons no ML:** A página de cupons oficiais do Mercado Livre (`/cupons`) utiliza regras de segurança extremamente agressivas, barrando navegadores Puppeteer (headless ou com janela física ativa) por meio de verificação de WebDriver e redirecionando para telas de erro em espanhol ou captchas.
+- **Coleta de Cupons via Agregadores:** Feeds públicos como o Cuponomia disponibilizam cupons diários em formato estático indexável pelo Google. A raspagem por meio de requisição HTTP leve e expressões regulares baseadas na classe `js-itemCode` permite obter os cupons ativos do dia de forma estável, rápida e livre de captchas.
+- **Decodificação de Entidades HTML:** Agregadores costumam codificar termos em português (ex: `&#233;` para é, `&#225;` para á). Uma função de substituição regex de dicionário resolve de forma confiável e ágil o problema de formatação na exibição da UI.
+
+## Resiliência do DOM e Bootstrap Assíncrono
+- **Quebras de aspas em atributos HTML inline:** A injeção direta de strings dinâmicas da web (como títulos de produtos que contêm aspas duplas, ex: `Televisão 50"`) em atributos inline como `onclick="scrollToProduct('title')"` fecha os delimitadores HTML antes da hora. Isso provoca travamentos silenciosos na renderização da UI. O uso de `createElement` e manipulação direta de propriedades de texto (`textContent`) e event listeners nativos em JS resolve o problema definitivamente.
+- **Timeouts na inicialização do WhatsApp Web:** O protocolo CDP (Chrome DevTools Protocol) usado pelo Puppeteer no bootstrap da biblioteca `whatsapp-web.js` pode disparar exceções de timeout (`Page.navigate timed out`) devido a oscilações locais ou lentidão ao carregar a página inicial. O registro de interceptadores globais de `uncaughtException` no processo Express previne que esses erros de subprocessos provoquem o encerramento inesperado (crash) do painel web.


