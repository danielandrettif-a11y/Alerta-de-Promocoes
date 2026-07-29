# Promo Automator — extensão de links Mercado Livre

Extensão Manifest V3 para Chrome e Edge. Ela usa a sessão local já autenticada
no Mercado Livre e envia ao servidor somente identificação do dispositivo,
estado do trabalho, erros operacionais e o link público `meli.la` gerado.

## Configurar o servidor

Defina no ambiente da aplicação:

```env
LOCAL_AFFILIATE_WORKER_ENABLED=true
LOCAL_AFFILIATE_WORKER_TOKEN=use-um-segredo-longo-e-unico
```

Faça o deploy e confirme que o painel abre normalmente por HTTPS.

## Instalar no Chrome

1. Abra `chrome://extensions`.
2. Ative **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação**.
4. Selecione a pasta `extension` deste repositório.

## Instalar no Edge

1. Abra `edge://extensions`.
2. Ative **Modo do desenvolvedor**.
3. Clique em **Carregar descompactado**.
4. Selecione a pasta `extension`.

## Configurar e testar

1. Abra **Detalhes > Opções da extensão**.
2. Informe a URL HTTPS do painel, o token e o nome do computador.
3. Salve. O navegador pedirá acesso somente à origem informada.
4. Abra o popup e clique em **Testar conexão**.
5. Clique em **Abrir Mercado Livre**, entre na conta e confirme que a barra de
   afiliados aparece em uma página de produto.

## Processar a fila

1. No painel, adicione ofertas à fila.
2. No popup, escolha 5, 10, 20 ou 30 itens.
3. Clique em **Processar fila**.
4. A extensão reutiliza uma única aba e processa uma oferta por vez.
5. Use **Parar** para interromper; reservas não concluídas voltam à fila quando
   expirarem.

Se aparecer login, CAPTCHA ou segundo fator, a extensão pausa e ativa a aba.
Conclua a autenticação manualmente e clique em **Continuar processamento**.
Ela não tenta contornar verificações de segurança.

## Atualizar

Atualize a pasta `extension`, abra a página de extensões e clique em
**Recarregar** no cartão da extensão. Confira novamente as opções após uma
mudança de servidor.

## Dados que não saem do navegador

Cookies, login, senha, token de sessão, localStorage e códigos de segundo fator
do Mercado Livre não são lidos, exportados ou enviados. O token do worker fica
em `chrome.storage.local` e autentica somente os endpoints próprios do worker.
