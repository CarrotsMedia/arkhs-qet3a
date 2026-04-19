FROM node:20-slim

# Install Python + Playwright dependencies
RUN apt-get update && apt-get install -y \
    python3 python3-pip python3-venv \
    libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 \
    libcups2 libdrm2 libxkbcommon0 libxcomposite1 \
    libxdamage1 libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 \
    libcairo2 libasound2 libatspi2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Node dependencies
COPY package*.json ./
RUN npm install

# Python dependencies
RUN pip3 install --break-system-packages playwright beautifulsoup4
RUN python3 -m playwright install chromium

# Copy project files
COPY . .

# Create output directory
RUN mkdir -p output

EXPOSE 3000

CMD ["node", "server.js"]
