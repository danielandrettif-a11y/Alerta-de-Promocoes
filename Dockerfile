FROM node:22-slim

# Instalar dependencias e baixar o Chrome oficial para Linux (essencial para o Puppeteer)
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    curl \
    --no-install-recommends \
    && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
    && apt-get update \
    && apt-get install -y google-chrome-stable --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*


WORKDIR /app

# O Chrome ja e instalado na imagem; evita um segundo download pelo Puppeteer.
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV APP_DATA_DIR=/data

# O volume deve ser mapeado como armazenamento persistente no Coolify.
RUN mkdir -p /data/wpp_session /data/ml_user_data /data/runtime
VOLUME ["/data"]

# Copiar definicoes de pacotes
COPY package*.json ./

# Instalar exatamente as dependencias registradas no package-lock.json
RUN npm ci --omit=dev

# Copiar arquivos do projeto
COPY . .

# Expõe a porta do servidor Express
EXPOSE 3000

# Monitora somente a vida do servidor. O WhatsApp pode aguardar QR sem causar
# reinicios em loop no Coolify.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:${PORT:-3000}/api/health" || exit 1

# O supervisor reinicia o servidor somente depois da recuperacao controlada
# de uma trava obsoleta do perfil do Chrome.
CMD ["node", "execution/supervise_server.js"]
