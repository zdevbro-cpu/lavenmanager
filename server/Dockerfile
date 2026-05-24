FROM node:20-slim

# 한글 폰트 (PDF 생성용 맑은 고딕 대체) — fonts-nanum 은 단일 TTF 제공 (pdf-lib 호환)
RUN apt-get update && \
    apt-get install -y --no-install-recommends fonts-nanum openssl ca-certificates && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 의존성 설치 (캐시 활용)
COPY package*.json ./
RUN npm ci --omit=dev

# Prisma 스키마 복사 후 클라이언트 생성
COPY prisma ./prisma
RUN npx prisma generate

# 소스 복사
COPY . .

# Cloud Run 기본 포트
ENV PORT=8080
EXPOSE 8080

CMD ["node", "index.js"]
