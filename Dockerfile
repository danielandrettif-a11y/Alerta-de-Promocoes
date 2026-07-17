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

# Copiar definicoes de pacotes
COPY package*.json ./

# Instalar exatamente as dependencias registradas no package-lock.json
RUN npm ci --omit=dev

# Copiar arquivos do projeto
COPY . .

# Expõe a porta do servidor Express
EXPOSE 3000

# Comando de boot do servidor
CMD ["node", "server.js"]
