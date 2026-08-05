# Alerta de Descontos — extensão de links afiliados

Extensão Manifest V3 para Chrome e Edge. Ela usa as sessões locais do Mercado
Livre e da Shopee e envia ao servidor somente identificação do dispositivo,
estado do trabalho, erros operacionais e o link afiliado público gerado.

A permissão `debugger` é usada por alguns milissegundos para enviar cliques
nativos exigidos pelo Mercado Livre e, somente como fallback, pelo menu da
Shopee. A extensão se desconecta logo depois e não usa essa permissão para ler
cookies, rede, armazenamento ou credenciais.

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
6. Clique em **Abrir Shopee** e entre no portal de afiliados.
7. Clique em **Testar Shopee**. O teste só termina com sucesso quando o campo e
   o botão de **Link personalizado** estiverem disponíveis.

## Processar a fila

1. No painel, adicione ofertas à fila.
2. No popup, escolha 5, 10, 20, 30 ou 40 itens.
3. Clique em **Processar fila**.
4. A janela que já estava aberta permanece intacta e a extensão abre maximizada
   uma janela de trabalho independente no primeiro produto. No Mercado Livre,
   ela abre a aba seguinte antes de fechar a anterior. Na Shopee, reutiliza uma
   única aba do gerador durante o lote.
5. No Mercado Livre, ela também captura cupons exibidos no próprio produto.
6. Ao concluir, ela fecha diretamente a janela auxiliar, sem deixar o Opera GX
   criar uma aba substituta.
7. Use **Parar** para cancelar a ação atual, fechar a janela auxiliar e liberar
   a oferta sem consumir uma tentativa.

Se aparecer login, CAPTCHA ou segundo fator, a extensão pausa e ativa a janela
de trabalho.
Conclua a autenticação manualmente e clique em **Continuar processamento**.
Ela não tenta contornar verificações de segurança.

Falhas técnicas da Shopee não são apresentadas como login. Abra
**Diagnóstico da última execução** no popup e use **Copiar diagnóstico** para
registrar URL, etapa, viewport e controles encontrados, sem cookies ou HTML da
página.

## Atualizar

Atualize a pasta `extension`, abra a página de extensões e clique em
**Recarregar** no cartão da extensão. Confira novamente as opções após uma
mudança de servidor.

## Dados que não saem do navegador

Cookies, login, senha, token de sessão, localStorage e códigos de segundo fator
dos marketplaces não são lidos, exportados ou enviados. O token do worker fica
em `chrome.storage.local` e autentica somente os endpoints próprios do worker.
