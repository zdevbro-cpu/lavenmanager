// DB wrapper that falls back to in-memory storage if PostgreSQL is not configured yet
const { PrismaClient } = require('@prisma/client');

let prisma = null;
let useMemoryDb = false;
// 인메모리 폴백용 빈 배열 (mock preset 데이터 제거 — DATABASE_URL 정상 동작 시 사용되지 않음)
let memoryDb = [];

if (!process.env.DATABASE_URL) {
  console.warn("⚠️ [DATABASE_URL] 환경 변수가 설정되지 않았습니다. 인메모리(Memory) DB 모드로 가동합니다.");
  useMemoryDb = true;
} else {
  try {
    prisma = new PrismaClient();
    console.log("🔌 Google Cloud SQL (PostgreSQL) Prisma 클라이언트가 초기화되었습니다.");
  } catch (error) {
    console.error("❌ Prisma 초기화 실패. 인메모리 DB로 강제 전환합니다:", error.message);
    useMemoryDb = true;
  }
}

// Unified Database API
const db = {
  isMemoryDb: () => useMemoryDb,
  
  findMany: async () => {
    if (useMemoryDb) {
      // Sort by id descending
      return [...memoryDb].sort((a, b) => b.id - a.id);
    }
    return await prisma.application.findMany({
      orderBy: { id: 'desc' }
    });
  },

  create: async (data) => {
    if (useMemoryDb) {
      const nextId = memoryDb.length > 0 ? Math.max(...memoryDb.map(item => item.id)) + 1 : 3000;
      const newRecord = {
        id: nextId,
        ...data,
        createdAt: new Date()
      };
      memoryDb.push(newRecord);
      return newRecord;
    }
    return await prisma.application.create({ data });
  },

  findById: async (id) => {
    if (useMemoryDb) {
      return memoryDb.find(item => item.id === Number(id)) || null;
    }
    return await prisma.application.findUnique({ where: { id: Number(id) } });
  },

  delete: async (id) => {
    if (useMemoryDb) {
      const idx = memoryDb.findIndex(item => item.id === Number(id));
      if (idx === -1) return null;
      const [removed] = memoryDb.splice(idx, 1);
      return removed;
    }
    return await prisma.application.delete({ where: { id: Number(id) } });
  },

  // ─── 카드결제 등록 로그 (CardSalesLog) ───────────────────────
  cardSales: {
    create: async (data) => {
      if (useMemoryDb) throw new Error('인메모리 모드에서는 카드결제 로그를 사용할 수 없습니다.');
      return await prisma.cardSalesLog.create({ data });
    },
    findMany: async (filter = {}) => {
      if (useMemoryDb) return [];
      // filter: { from, to, type, businessUnit, buyer, registrantOrg, registrantName }
      const where = {};
      if (filter.type) where.type = filter.type;
      if (filter.from || filter.to) {
        where.date = {};
        if (filter.from) where.date.gte = filter.from;
        if (filter.to) where.date.lte = filter.to;
      }
      if (filter.businessUnit) where.businessUnit = { contains: filter.businessUnit };
      if (filter.buyer) where.buyer = { contains: filter.buyer };
      if (filter.registrantOrg) where.registrantOrg = { contains: filter.registrantOrg };
      if (filter.registrantName) where.registrantName = { contains: filter.registrantName };
      return await prisma.cardSalesLog.findMany({ where, orderBy: [{ date: 'asc' }, { id: 'asc' }] });
    }
  }
};

module.exports = db;
