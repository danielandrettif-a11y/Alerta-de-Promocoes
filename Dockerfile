FROM node:18-slim

# Instalar dependencias do Puppeteer no Linux
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    procps \
    libxss1 \
    libxtst6 \
    libxrender1 \
    libxi6 \
    libgconf-2-4 \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libglib2.0-0 \
    libgtk-3-0 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copiar definicoes de pacotes
COPY package*.json ./

# Instalar dependencias
RUN npm install

# Copiar arquivos do projeto
COPY . .

# Expõe a porta do servidor Express
EXPOSE 3000

# Comando de boot do servidor
CMD ["node", "server.js"]
