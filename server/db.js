// DB wrapper that falls back to in-memory storage if PostgreSQL is not configured yet
const { PrismaClient } = require('@prisma/client');

let prisma = null;
let useMemoryDb = false;
let memoryDb = [
  // Preset test data matching the paper form styles
  {
    id: 3024,
    buyerName: "이지혜",
    childInfo: "박민우",
    childBirthdate: "2017-04-15",
    phoneNumber: "010-3849-2938",
    address: "서울특별시 서초구 서초대로 320",
    deliveryMemo: "경비실에 꼭 맡겨주세요.",
    book1Name: "초등 수학 개념 완성 A코스",
    book1Price: "35,000",
    book2Name: null,
    book2Price: null,
    subscriptionType: "월간 독서 클럽",
    subscriptionPrice: "15,000",
    cashPayment: "0",
    cardPayment: "50,000",
    cashReceiptNo: null,
    sellerName: "강남지사 최민지",
    sellerPhone: "010-7766-5544",
    gdrivePhotoFileId: "gdrive_photo_mock_1",
    gdrivePdfFileId: "gdrive_pdf_mock_1",
    receiptOcrData: null,
    privacyConsent: true,
    applyDate: "2026-05-23",
    createdAt: new Date()
  },
  {
    id: 3023,
    buyerName: "윤도현",
    childInfo: "윤준서",
    childBirthdate: "2019-08-22",
    phoneNumber: "010-8482-1203",
    address: "경기도 성남시 분당구 정자일로 95",
    deliveryMemo: "택배함에 넣어주세요.",
    book1Name: "중학 기초 영어 핵심",
    book1Price: "30,000",
    book2Name: "수학개념 완성",
    book2Price: "30,000",
    subscriptionType: null,
    subscriptionPrice: null,
    cashPayment: "60,000",
    cardPayment: "0",
    cashReceiptNo: "010-8482-1203",
    sellerName: "분당지사 이민호",
    sellerPhone: "010-9988-7766",
    gdrivePhotoFileId: "gdrive_photo_mock_2",
    gdrivePdfFileId: "gdrive_pdf_mock_2",
    receiptOcrData: null,
    privacyConsent: true,
    applyDate: "2026-05-23",
    createdAt: new Date()
  }
];

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
  }
};

module.exports = db;
