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

O cliente detecta a versao real do Chrome instalado e gera o `User-Agent`
correspondente. Isso evita que o WhatsApp Web receba a identificacao antiga
Chrome 101 definida por padrao na biblioteca. `WHATSAPP_USER_AGENT` pode ser
usada apenas se for necessario sobrescrever manualmente essa deteccao.

Antes de inicializar, o cliente remove apenas caches regeneraveis do Chrome
(`Cache`, `Code Cache`, `GPUCache`, `Service Worker` e caches de shaders), desde
que o perfil nao esteja bloqueado. Cookies, IndexedDB, Local Storage e Session
Storage sao preservados para manter a autenticacao.

## Primeira autenticacao do Mercado Livre

O fluxo recomendado agora usa a extensao local descrita em
`directives/local_affiliate_worker.md`. Ele nao precisa armazenar uma sessao do
Mercado Livre na VPS. Configure:

```env
LOCAL_AFFILIATE_WORKER_ENABLED=true
LOCAL_AFFILIATE_WORKER_TOKEN=um-segredo-longo-e-unico
```

Use o mesmo token nas opcoes da extensao. O arquivo de workers, os lotes e seus
ZIPs ficam sob `APP_RUNTIME_DIR`, que deve continuar montado no volume
persistente `/data`.

O procedimento abaixo e legado e serve apenas para manutencao do script antigo.

O perfil precisa ser autenticado diretamente no diretorio `MELI_PROFILE_DIR`.

- Em uma instalacao Windows local, `abrir_login.bat` usa as mesmas variaveis.
- No Coolify, use temporariamente o recurso definido em
  `docker-compose.meli-login.yml`. Ele abre um Chromium Linux interativo e grava
  o perfil diretamente em `/data/ml_user_data`.
- Nao copie um perfil logado do Chrome entre Windows e Linux. Cookies e
  credenciais do navegador podem estar criptografados pelo sistema operacional.

### Procedimento no Coolify

1. Confirme que o aplicativo principal esta com apenas um container.
2. No terminal do servidor, prepare somente a pasta do Mercado Livre:

   ```sh
   docker exec v13vybz3batitff5ukstrnse sh -lc \
     'mkdir -p /data/ml_user_data && chown -R 1000:1000 /data/ml_user_data'
   ```

3. No mesmo projeto/ambiente, adicione um recurso **Docker Compose** e cole o
   conteudo de `docker-compose.meli-login.yml`.
4. Crie `MELI_VNC_PASSWORD` com uma senha temporaria de exatamente 8
   caracteres. Nao compartilhe essa senha.
5. Confira em **Show Deployable Compose** que o primeiro mount continua sendo:

   ```text
   /var/lib/docker/volumes/v13vybz3batitff5ukstrnse-alerta-promocoes-data/_data:/data:rw
   ```

   O caminho absoluto e necessario porque algumas versoes do Coolify prefixam
   ate volumes marcados como externos e acabam criando um volume vazio separado.
6. Publique a porta `5800` em um dominio HTTPS temporario e faca o deploy.
7. Abra o dominio, informe a senha VNC, entre no Mercado Livre e conclua qualquer
   verificacao em duas etapas. Abra tambem uma pagina de produto e confirme que
   a barra de afiliados aparece.
8. Feche o Chromium pela interface e pare/remova o recurso temporario. Nunca
   deixe esse navegador e o script de afiliados usando o mesmo perfil ao mesmo
   tempo. Nao exclua o volume externo `alerta-promocoes-data`.
9. No terminal do aplicativo principal, verifique:

   ```sh
   npm run sessions:check
   ```

10. Teste com uma URL real de produto:

   ```sh
   node execution/get_meli_affiliate_link.js 'URL_DO_PRODUTO'
   ```

O argumento `--password-store=basic` e usado tanto no login interativo quanto
na automacao. Isso permite que o Chrome Linux reutilize os cookies salvos sem
depender de um chaveiro grafico. O acesso noVNC deve existir apenas durante o
login, pois ele permite controlar uma sessao autenticada.

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
