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
## Proteção Anti-Bot do Mercado Livre e Scrapers de Cupons
- **Bloqueio de Cupons no ML:** A página de cupons oficiais do Mercado Livre (`/cupons`) utiliza regras de segurança extremamente agressivas, barrando navegadores Puppeteer (headless ou com janela física ativa) por meio de verificação de WebDriver e redirecionando para telas de erro em espanhol ou captchas.
- **Coleta de Cupons via Agregadores:** Feeds públicos como o Cuponomia disponibilizam cupons diários em formato estático indexável pelo Google. A raspagem por meio de requisição HTTP leve e expressões regulares baseadas na classe `js-itemCode` permite obter os cupons ativos do dia de forma estável, rápida e livre de captchas.
- **Decodificação de Entidades HTML:** Agregadores costumam codificar termos em português (ex: `&#233;` para é, `&#225;` para á). Uma função de substituição regex de dicionário resolve de forma confiável e ágil o problema de formatação na exibição da UI.

## Resiliência do DOM e Bootstrap Assíncrono
- **Quebras de aspas em atributos HTML inline:** A injeção direta de strings dinâmicas da web (como títulos de produtos que contêm aspas duplas, ex: `Televisão 50"`) em atributos inline como `onclick="scrollToProduct('title')"` fecha os delimitadores HTML antes da hora. Isso provoca travamentos silenciosos na renderização da UI. O uso de `createElement` e manipulação direta de propriedades de texto (`textContent`) e event listeners nativos em JS resolve o problema definitivamente.
- **Timeouts na inicialização do WhatsApp Web:** O protocolo CDP (Chrome DevTools Protocol) usado pelo Puppeteer no bootstrap da biblioteca `whatsapp-web.js` pode disparar exceções de timeout (`Page.navigate timed out`) devido a oscilações locais ou lentidão ao carregar a página inicial. O registro de interceptadores globais de `uncaughtException` no processo Express previne que esses erros de subprocessos provoquem o encerramento inesperado (crash) do painel web.

## Estratégias de Coleta e Viabilidade da Amazon Brasil
- **Transição da Shopee para a Amazon**: Devido ao bloqueio anti-bot contínuo da Shopee com Captchas recorrentes no ambiente VPS, a captura foi migrada para a Amazon Brasil (/deals). A Amazon apresenta estabilidade no ambiente VPS.
- **Mapeamento de Grids Virtuosos**: A Amazon renderiza sua grade de descontos utilizando rolagem virtualizada (Virtuoso). O container principal não possui todos os cards de produtos de forma linear. Em vez disso, agrupa os produtos em linhas (5 por linha). O mapeamento individual correto é feito buscando elementos internos que possuam o atributo `data-test-index` ou com IDs correspondentes ao ASIN do produto (iniciando em `B0`).
- **Resolução de Imagens com Redirecionamentos**: Imagens em CDNs de grandes varejistas frequentemente utilizam redirecionamentos HTTP (status 302, 307). O proxy de imagem deve ser recursivo para seguir o cabeçalho `location` até o arquivo binário final da imagem. Isso evita falhas de download e permite a geração correta das mídias (Stories) via Canvas no frontend.

## Taxonomia Granular e Filtragem em Cascata
- **Centralização da Taxonomia**: Manter a lógica de categorização distribuída entre múltiplos scripts causa divergências de classificação e aumenta a carga de manutenção. Centralizar as definições de categorias, subcategorias, emojis e regras de palavras-chave em um módulo unificado (`execution/category_helper.js`) garante que o backend, o agendador e o bot de WhatsApp usem as mesmas regras determinísticas.
- **Cache-Buster para Frontend Dinâmico**: Navegadores de internet tendem a manter em cache local arquivos JavaScript de alta recorrência. Ao aplicar atualizações e refatorações em arquivos como `public/app.js`, os clientes podem sofrer com exceções (`ReferenceError`) devido à execução do código em cache antigo. Adicionar um parâmetro dinâmico ou estático de versão (`?v=2`) no import do script resolve imediatamente a retenção de cache.
- **Acoplamento de Categorias em Regras de Cupons**: Lógicas de cupons compatíveis baseadas em categorias antigas e slugificadas geram falhas de referência (`ReferenceError`) ao tentar classificar ofertas com a nova taxonomia aninhada. O correto é extrair o nome estático da categoria principal do helper e buscar correspondências textuais nas regras traduzidas para assegurar estabilidade.

## Comparação de Preços e Resiliência contra Alterações de Layout
- **Vulnerabilidade de Nomes de Classes Dinâmicas (CSS Modules)**: Portais de comparação como o Buscapé e Zoom usam compilações com classes ofuscadas ou hashes dinâmicos (ex: `ClickableArea_OrqProductCard` e `ClickableArea_OrqProductCard__jkrb3`). Depender de classes específicas que mudam a cada build interrompe o scraping rapidamente. Buscar de forma ampla por seletores HTML genéricos (ex: `strong` ou `span` contendo o padrão de texto `R$`) acompanhado de filtros numéricos e filtros de relevância é muito mais resistente.
- **Extração de Termos por Classes de Busca**: Títulos originais de e-commerce misturam tags e frases acessórias de marketing ("portal de games", "frete grátis", "melhor preço"). Passar esses títulos longos em buscadores aciona falhas de correspondência exata. O ideal é usar expressões regulares e dicionários de marcas e tipos de produtos para isolar apenas as variáveis essenciais (ex: `[Marca] + [Tipo de Produto] + [Código do Modelo] + [Medida/Polegadas]`), garantindo resultados precisos em quase 100% dos portais.
- **Redundância Automática (Fallback Zoom)**: Como sites de comparação de preços têm a mesma base de dados mas diferentes regras de roteamento e balanceamento, adicionar um canal de fallback para o Zoom em caso de timeout ou bloqueio temporário do Buscapé dobra a taxa de sucesso no ambiente de VPS headless.

## Incompatibilidade de Parsing de Datas Regionais
- **Falha de data local no construtor Date**: Strings de data geradas no formato brasileiro padrão (ex: `DD/MM/YYYY hh:mm:ss`) não são compatíveis com o parser nativo de `new Date()` no navegador do cliente (que espera ISO 8601 ou padrão americano `MM/DD/YYYY`). Isso provoca a renderização de strings de erro `"Invalid Date"`. O correto é capturar os componentes individuais (ano, mês, dia, horas, minutos, segundos) via expressões regulares e construir o objeto `Date` passando parâmetros inteiros explícitos no construtor.
- **Sincronismo de Metadados de Abas**: Exibir um carimbo global único para bases de dados distintas (ML e Amazon) confunde o usuário se as bases forem geradas em momentos diferentes. O correto é persistir metadados individuais no estado global do frontend e alternar o texto de forma reativa durante a navegação entre painéis de controle.

## Filtragem Dinâmica Proporcional vs. Limites Rígidos
- **Problema de Limites Rígidos (Hardcoded)**: Adotar limites absolutos (como "ignorar tudo abaixo de R$ 150") quebra o comparador para mercadorias legítimas de menor valor (como bebidas, livros, cosméticos). Por outro lado, limites muito baixos (como R$ 10 ou R$ 20) capturam acessórios pequenos, miniaturas ou fretes do mesmo produto listados na busca.
- **Solução (Margem de Proporção de 60%)**: O corte ideal é dinâmico e calculado como uma proporção (**60%**) do preço de promoção do produto a ser postado. Se o produto custa R$ 69,08, ignoramos qualquer resultado abaixo de R$ 41,44. Se custa R$ 2.400,00, ignoramos tudo abaixo de R$ 1.440,00. Isso remove com precisão acessórios irrelevantes e preserva o item correto em qualquer faixa de preço de mercado.

## Nomenclaturas CSS e Margem de Tolerância de Alerta
- **Falsos Positivos com Classes Genéricas de CSS**: O uso de seletores parciais excessivamente genéricos (ex: `[class*="Card"]`) captura divs estruturais de layout e gera resultados inconsistentes. O correto é segmentar termos específicos do domínio (ex: `ProductCard`, `HitCard`, `ProductCardArea`) e apenas recorrer a seletores gerais em estruturas de fallback controladas.
- **Tolerância Dinâmica no Status**: Comparar preços diretamente por centavos gera status de erro `"Preço Semelhante"` quando a diferença de mercado é insignificante (ex: R$ 2,40 mais barato em um produto de R$ 1.460,00). Adotar uma margem de tolerância proporcional (**2%** do preço do produto) permite classificar variações mínimas como `"Preço Equivalente"`, isolando de fato descontos relevantes (`Desconto Comprovado`) ou ofertas infladas (`Preço Acima do Mercado`).

## Reformulação de Filtros, Subcategorias e Cupons por Loja
- **Filtros em Duas Linhas**: Separar busca rápida/desconto mínimo da navegação em cascata por categoria reduz drasticamente a sobrecarga visual e melhora a UX em telas móveis e desktop.
- **Contagem por Subcategoria e Chips Ativos**: Exibir o total de produtos disponíveis ao lado do nome de cada subcategoria (`Subcategoria (N)`) e prover feedback instantâneo via chips (`🏷️ Categoria > Subcategoria ✕`) facilita o refinamento de buscas sem precisar resetar selects manualmente.
- **Link Afiliado Amazon e Tag de Associado**: A Amazon Brasil permite atrelar a tag de associado (`AMAZON_ASSOCIATE_TAG`) diretamente aos links dos produtos via query parameter `?tag=alertadesc0dd-20`, dispensando extensões de navegador ou automações complexas de cliques.
- **Integração de Cupons com Story de Instagram**: Vincular cupons específicos a produtos e calcular o preço final promocional (`Preço COM Cupom`) permite a renderização automática de imagens de Stories vertical (1080x1920) com banners destacados para publicação imediata.


