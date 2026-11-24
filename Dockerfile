FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv poppler-utils fonts-dejavu-core ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
RUN python3 -m venv /opt/avenfold-python
ENV AVENFOLD_PYTHON=/opt/avenfold-python/bin/python \
    AVENFOLD_PDFTOPPM=/usr/bin/pdftoppm \
    AVENFOLD_OCR_FONT=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf \
    NODE_ENV=production \
    AVENFOLD_DATA=/app/data
COPY requirements.txt ./
RUN /opt/avenfold-python/bin/pip install --no-cache-dir -r requirements.txt
COPY package.json package-lock.json ./
RUN npm ci --include=dev
COPY . .
RUN npm run build && npm run samples && node scripts/comparison-samples.mjs \
    && node scripts/library-samples.mjs && /opt/avenfold-python/bin/python scripts/scanned_sample.py \
    && npm prune --omit=dev && mkdir -p /app/data && chown -R node:node /app
USER node
EXPOSE 10000
CMD ["node", "web.mjs"]
