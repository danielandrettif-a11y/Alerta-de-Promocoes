# Directive: Sessoes persistentes no Coolify

## Objetivo

Manter a autenticacao do WhatsApp Web e o perfil de afiliado do Mercado Livre
entre reinicios e novos deploys do container.

## Configuracao no Coolify

1. Abra o recurso da aplicacao no Coolify.
2. Em **Storage**, adicione um armazenamento do tipo **Volume**:
   - Name/source: `alerta-promocoes-data`
   - Destination: `/data`
3. Em **Environment Variables**, configure:
   - `APP_DATA_DIR=/data`
   - `WHATSAPP_SESSION_DIR=/data/wpp_session`
   - `MELI_PROFILE_DIR=/data/ml_user_data`
   - `APP_RUNTIME_DIR=/data/runtime`
   - `WHATSAPP_ENABLED=true`
   - `WHATSAPP_AUTH_TIMEOUT_MS=120000`
   - `WHATSAPP_PROTOCOL_TIMEOUT_MS=180000`
   - `WHATSAPP_PROFILE_LOCK_GRACE_MS=90000`
   - `WHATSAPP_RECONNECT_DELAY_MS=15000`
   - `WHATSAPP_MAX_RECONNECT_DELAY_MS=300000`
4. Mantenha **uma unica replica**. Perfis do Chrome e o LocalAuth do WhatsApp nao
   podem ser abertos simultaneamente por containers diferentes.
5. Faca um novo deploy e abra os logs. O bloco `SESSOES PERSISTENTES` informa se
   existem dados persistidos para cada integracao.

O `Dockerfile` ja inclui um health check em `/api/health`. Ele verifica se o
servidor esta vivo sem forcar reinicios enquanto o WhatsApp aguarda o primeiro QR.

## Primeira autenticacao do WhatsApp

1. Depois do deploy, abra **Logs** no Coolify.
2. Procure `AUTENTICACAO DO WHATSAPP REQUERIDA`.
3. No celular, abra WhatsApp > **Aparelhos conectados** > **Conectar aparelho**.
4. Escaneie o QR exibido nos logs.
5. Aguarde `Conexao com o WhatsApp estabelecida com sucesso`.
6. Reinicie a aplicacao uma vez e confirme que nao foi solicitado outro QR.

Em quedas de rede, o cliente tenta se reconectar automaticamente com espera
progressiva entre 15 segundos e 5 minutos.

Durante rolling updates, o container novo aguarda 90 segundos antes de remover
somente as travas transitorias `Singleton*` deixadas pelo Chrome antigo. Cookies,
Local Storage e demais dados de autenticacao nao sao removidos. Depois da limpeza,
o processo e reiniciado automaticamente no ambiente de producao para criar um
cliente Puppeteer novo, pois um cliente que falhou com `Code 21` pode nao ser
reutilizavel. O container executa `execution/supervise_server.js`, que reinicia
o servidor somente para o codigo de recuperacao 75; falhas diferentes continuam
visiveis ao Coolify.

Ative tambem **Advanced > Consistent Container Names** na aplicacao. Essa opcao
faz o Coolify encerrar o container anterior antes de criar o substituto e evita
que dois Chromes abram simultaneamente o mesmo volume.

O `package-lock.json` fixa o `whatsapp-web.js` no commit oficial
`1780711a1c86dfeca7c5ba6a66f950eac93dde28`. Esse commit registra o listener de
sincronizacao e verifica `hasSynced` de forma atomica, evitando que uma sessao
restaurada perca o evento `ready` e termine em `Runtime.callFunctionOn timed out`.

## Primeira autenticacao do Mercado Livre

O perfil precisa ser autenticado diretamente no diretorio `MELI_PROFILE_DIR`.

- Em uma instalacao Windows local, `abrir_login.bat` usa as mesmas variaveis.
- No Coolify, use temporariamente um navegador Linux interativo/noVNC conectado
  ao mesmo volume `/data`, faca o login e depois remova o acesso interativo.
- Nao copie um perfil logado do Chrome entre Windows e Linux. Cookies e
  credenciais do navegador podem estar criptografados pelo sistema operacional.

## Verificacao

No terminal do container:

```sh
npm run sessions:check
```

Consulte tambem:

```sh
curl http://127.0.0.1:3000/api/health
```

`DISPONIVEL` significa que arquivos persistidos foram encontrados. A validade
final e confirmada quando o WhatsApp apresenta `"ready": true` no health check ou
quando o Mercado Livre gera um link de afiliado com sucesso.

## Cuidados

- Nao salve as sessoes no Git; elas contem credenciais.
- Trate backups de `/data` como dados sensiveis.
- Nao use armazenamento temporario ou bind mount para uma pasta de cada deploy.
- Se a autenticacao for revogada remotamente, os arquivos ainda podem existir.
  Nesse caso, autentique novamente apenas a integracao afetada.
