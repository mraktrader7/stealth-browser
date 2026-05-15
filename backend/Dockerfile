FROM mcr.microsoft.com/playwright:v1.40.0-jammy

WORKDIR /app

# Install dependencies
COPY package.json ./
RUN npm install --production

# Install Playwright browsers
RUN npx playwright install chromium

# Copy source
COPY src/ ./src/
COPY .env.example .env

# Create data directory
RUN mkdir -p /app/data

EXPOSE 3001

CMD ["node", "src/index.js"]
