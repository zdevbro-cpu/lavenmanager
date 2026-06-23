require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

const db = require('./db');
const ocrService = require('./services/ocrService');
const driveService = require('./services/driveService');
const pdfService = require('./services/pdfService');


const app = express();
const PORT = process.env.PORT || 3001;

// CORS 설정 - 로컬 dev + Firebase Hosting 프로덕션 도메인 + 별도 ALLOWED_ORIGINS env 변수 지원
const allowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'https://lavenmanager.web.app',
  'https://lavenmanager.firebaseapp.com',
  ...(process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean)
];
app.use(cors({
  origin: (origin, cb) => {
    // 동일출처/서버투서버(origin 없음) 또는 화이트리스트 매칭 시 허용
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS 차단: ${origin}`));
  },
  credentials: true
}));

// 서명 이미지(base64) 수집을 위한 용량 한도 확장 (10MB)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// 로컬 테스트용 업로드 정적 폴더 매핑 (구글 드라이브 미연동 시 파일 조회용)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 이미지 임시 저장을 위한 Multer 구성 (메모리 버퍼에 보관하여 OCR로 직접 전달)
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 8 * 1024 * 1024 } // 최대 8MB
});

// 1. API 헬스체크 및 환경 정보 확인
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date(),
    databaseMode: db.isMemoryDb() ? 'Memory (인메모리)' : 'Cloud SQL (PostgreSQL)',
    googleAuthConnected: fs.existsSync(path.join(__dirname, 'config', 'google-key.json'))
  });
});

// Base64 이미지 디코딩 헬퍼 함수
const decodeBase64Image = (base64Str) => {
  if (!base64Str) return null;
  const matches = base64Str.match(/^data:image\/([A-Za-z-+\/]+);base64,(.+)$/);
  if (matches && matches.length === 3) {
    return Buffer.from(matches[2], 'base64');
  }
  try {
    return Buffer.from(base64Str, 'base64');
  } catch (e) {
    return null;
  }
};

// 2. OCR 실물 신청서 사진 / 카드 영수증 텍스트 파싱 API
app.post('/api/ocr', upload.single('photo'), async (req, res) => {
  try {
    const type = req.body.type || req.query.type || 'application';
    let imageBuffer = null;

    if (req.file) {
      console.log(`📸 OCR [File] 분석 요청 접수: ${req.file.originalname} (${req.file.size} bytes), Type: ${type}`);
      imageBuffer = req.file.buffer;
    } else if (req.body.imageBase64) {
      console.log(`📸 OCR [Base64] 분석 요청 접수 (Length: ${req.body.imageBase64.length}), Type: ${type}`);
      imageBuffer = decodeBase64Image(req.body.imageBase64);
    }

    if (!imageBuffer) {
      return res.status(400).json({ error: '분석할 이미지 데이터(파일 또는 Base64)가 필요합니다.' });
    }
    
    // OCR 서비스 가동
    const parsedData = await ocrService.analyzeImage(imageBuffer, type);
    
    res.json({
      success: true,
      data: parsedData
    });
  } catch (error) {
    console.error("OCR API 처리 중 오류:", error);
    res.status(500).json({ error: 'OCR 텍스트 파싱 중 서버 오류가 발생했습니다.' });
  }
});

// 3. 교재구매 신청 완료 제출 API (전자서명 합성 ➔ PDF 생성 ➔ 구글드라이브 업로드 ➔ DB 저장)
app.post('/api/applications', async (req, res) => {
  try {
    const { formData, signatureData, photoData, receiptPhotoData, receiptPhotoDataList, cashReceiptPhotoData, cashReceiptPhotoDataList, receiptOcrData } = req.body;
    // 신·구 페이로드 호환: receiptPhotoDataList(배열) > receiptPhotoData(단일)
    const cardReceiptList = Array.isArray(receiptPhotoDataList) && receiptPhotoDataList.length > 0
      ? receiptPhotoDataList
      : (receiptPhotoData ? [receiptPhotoData] : []);
    // 현금영수증 배열 처리: cashReceiptPhotoDataList(배열) > cashReceiptPhotoData(단일 구버전 호환)
    const cashReceiptList = Array.isArray(cashReceiptPhotoDataList) && cashReceiptPhotoDataList.length > 0
      ? cashReceiptPhotoDataList
      : (cashReceiptPhotoData ? [cashReceiptPhotoData] : []);

    if (!formData || !formData.buyerName || !formData.phoneNumber || !formData.address) {
      return res.status(400).json({ error: '기본 구매자명, 연락처, 주소 정보는 필수로 채워야 합니다.' });
    }

    // 전화번호는 어떤 형태로 들어와도 (010-XXXX-XXXX, 010 XXXX XXXX 등) DB에는 숫자만 저장
    formData.phoneNumber = String(formData.phoneNumber || '').replace(/\D/g, '');

    console.log(`📝 신청서 접수 프로세스 시작. 구매자명: ${formData.buyerName}`);

    // 원본 사진, 카드 영수증 N장(최대 6), 현금영수증 N장(최대 6) 이미지 버퍼 변환
    const photoBuffer = decodeBase64Image(photoData);
    const cardReceiptBuffers = cardReceiptList.map(decodeBase64Image).filter(Boolean);
    const cashReceiptBuffers = cashReceiptList.map(decodeBase64Image).filter(Boolean);

    // 3.1 pdf-lib 모듈을 사용하여 A5 신청서 PDF 생성 (서명 + 카드결제정보 합성) — 회사용 / 고객용
    const applicationPdfBuffer = await pdfService.generateApplicationPdf(formData, signatureData, receiptOcrData, 'company');
    const customerPdfBuffer    = await pdfService.generateApplicationPdf(formData, signatureData, receiptOcrData, 'customer');

    // 3.1.5 신청서 + 원본사진 + 카드영수증 N장 + 현금영수증 N장 + 라벤 약정서 자동 채움까지 단일 PDF
    const bundledPdfBuffer = await pdfService.buildBundledPdf(
      applicationPdfBuffer,
      photoBuffer,
      cardReceiptBuffers,
      cashReceiptBuffers,
      formData,
      receiptOcrData
    );

    // 3.2 구글 드라이브(또는 로컬 uploads)에 통합 PDF + 고객용 A5 신청서 PDF 별도 업로드
    const driveUploadResult = await driveService.uploadApplicationFiles(
      formData.buyerName,
      formData.phoneNumber,
      bundledPdfBuffer,
      null,
      null,
      customerPdfBuffer
    );

    // 3.3 최종 정제 정보 데이터베이스(Google Cloud SQL 또는 인메모리)에 기록
    const dbRecord = await db.create({
      buyerName: formData.buyerName,
      childInfo: formData.childInfo || null,
      childBirthdate: formData.childBirthdate || null,
      phoneNumber: formData.phoneNumber,
      address: formData.address,
      deliveryMemo: formData.deliveryMemo || null,
      
      book1Name: formData.book1Name || null,
      book1Price: formData.book1Price || null,
      book2Name: formData.book2Name || null,
      book2Price: formData.book2Price || null,
      subscriptionType: formData.subscriptionType || null,
      subscriptionPrice: formData.subscriptionPrice || null,
      managementType: formData.managementType || null,
      managementPrice: formData.managementPrice || null,

      cashPayment: formData.cashPayment || '0',
      cardPayment: formData.cardPayment || '0',
      cashReceiptNo: formData.cashReceiptNo || null,
      
      sellerName: formData.sellerName || null,
      sellerPhone: formData.sellerPhone || null,
      
      gdrivePhotoFileId: driveUploadResult.photoFileId || null,
      gdrivePdfFileId: driveUploadResult.pdfFileId || null,
      gdriveCustomerPdfFileId: driveUploadResult.customerPdfFileId || null,
      gdriveReceiptFileId: driveUploadResult.receiptFileId || null,
      receiptOcrData: receiptOcrData && (receiptOcrData.card || receiptOcrData.cash) ? receiptOcrData : null,
      privacyConsent: formData.privacyConsent !== false,
      applyDate: formData.applyDate || new Date().toISOString().slice(0, 10)
    });

    // 3.4 문자 수신처(010-8290-4749) 가상 발송 모사 로그
    console.log(`📱 [MMS/알림톡 발송 성공] 수신처: 010-8290-4749 | 내용: 에이멘에이(주) ${formData.buyerName}님 교재신청서 접수 완료. PDF 다운로드: ${driveUploadResult.pdfViewUrl}`);

    res.status(201).json({
      success: true,
      message: '교재구매 신청이 성공적으로 접수되었습니다.',
      data: {
        ...dbRecord,
        pdfViewUrl: driveUploadResult.pdfViewUrl
      }
    });
  } catch (error) {
    console.error("신청 제출 처리 실패:", error);
    res.status(500).json({ error: '신청서 저장 및 PDF 전송 과정에서 서버 오류가 발생했습니다.' });
  }
});

// 4. 단건 신청서 삭제 API (DB 레코드 + 구글 드라이브 PDF 모두 정리)
app.delete('/api/applications/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const record = await db.findById(id);
    if (!record) {
      return res.status(404).json({ error: '해당 신청서를 찾을 수 없습니다.' });
    }

    // 드라이브/로컬 파일 정리 (실패해도 DB 삭제는 진행)
    if (record.gdrivePdfFileId) {
      const fallbackName = `신청서_${record.buyerName}_${(record.phoneNumber || '').replace(/-/g, '')}.pdf`;
      await driveService.deleteFile(record.gdrivePdfFileId, fallbackName);
    }

    await db.delete(id);
    console.log(`🗑️ 신청서 삭제 완료: ID=${id}, 구매자=${record.buyerName}`);
    res.json({ success: true, message: '신청서가 삭제되었습니다.' });
  } catch (error) {
    console.error('신청서 삭제 실패:', error);
    res.status(500).json({ error: '신청서 삭제 중 서버 오류가 발생했습니다.' });
  }
});

// 5. 관리자용 접수 대장 일괄 조회 API
app.get('/api/applications', async (req, res) => {
  try {
    const list = await db.findMany();
    res.json({
      success: true,
      data: list
    });
  } catch (error) {
    console.error("접수대장 조회 실패:", error);
    res.status(500).json({ error: '데이터베이스 조회 중 서버 오류가 발생했습니다.' });
  }
});

// 4.5 [개인 계정 구글 드라이브 용량 초과 우회용] 즉석 구글 로그인 & OAuth2 리프레시 토큰 발급 도구 API
app.get('/api/auth/google', (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  
  if (!clientId || !clientSecret) {
    return res.status(400).send(`
      <div style="font-family: sans-serif; padding: 40px; background: #0f172a; color: #f8fafc; height: 100vh;">
        <h2 style="color: #ef4444;">⚠️ OAuth2 자격증명 구성 누락</h2>
        <p>백엔드 <b>.env</b> 파일에 구글 클라우드 콘솔에서 발급받은 <b>GOOGLE_CLIENT_ID</b>와 <b>GOOGLE_CLIENT_SECRET</b>을 먼저 기입해 주세요.</p>
        <p style="color: #94a3b8; font-size: 13px;">* 승인된 리디렉션 URI 주소: <code>http://localhost:3001/api/auth/google/callback</code></p>
      </div>
    `);
  }

  const { google } = require('googleapis');
  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    'http://localhost:3001/api/auth/google/callback'
  );
  
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline', // 영구적인 리프레시 토큰(Refresh Token) 획득용 핵심 옵션
    prompt: 'consent',       // 매번 동의 화면을 띄워 토큰 재발급 안정화
    // drive.file 만 요청 — "이 앱이 만든 파일/폴더"만 접근 (비민감 범위, 검수 없이 게시 가능)
    scope: ['https://www.googleapis.com/auth/drive.file']
  });
  
  res.redirect(url);
});

app.get('/api/auth/google/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send("인증 코드가 누락되었습니다.");
  
  try {
    const { google } = require('googleapis');
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      'http://localhost:3001/api/auth/google/callback'
    );
    
    const { tokens } = await oauth2Client.getToken(code);
    
    res.send(`
      <div style="font-family: sans-serif; padding: 40px; background: #0f172a; color: #f8fafc; height: 100vh; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center;">
        <div style="max-width: 600px; background: #1e293b; padding: 40px; border-radius: 16px; border: 1px solid #334155; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3);">
          <h2 style="color: #818cf8; margin-bottom: 8px;">🎉 구글 계정 무제한 드라이브 연동 성공!</h2>
          <p style="color: #94a3b8; font-size: 14px; margin-bottom: 24px;">아래의 <b>영구 리프레시 토큰</b>을 복사하여 백엔드 <b>server/.env</b> 파일에 추가해 주시면 세팅이 평생 완료됩니다!</p>
          
          <textarea style="width: 100%; height: 90px; padding: 12px; background: #0f172a; color: #38bdf8; border: 1px solid #4338ca; border-radius: 8px; font-family: monospace; font-size: 13px; resize: none; margin-bottom: 20px; outline: none;" onclick="this.select()" readonly>${tokens.refresh_token}</textarea>
          
          <div style="background: #312e81/30; border: 1px solid #3730a3; padding: 12px; border-radius: 8px; color: #a5b4fc; font-size: 11px; text-align: left; line-height: 1.5;">
            💡 <b>추가할 .env 텍스트 양식:</b><br />
            <code>GOOGLE_REFRESH_TOKEN="${tokens.refresh_token}"</code>
          </div>
          <p style="color: #64748b; font-size: 11px; margin-top: 20px;">* 해당 사용자 계정의 드라이브 쿼타를 활용하므로, 구글의 서비스 계정 0-용량 차단 정책을 영원히 회피합니다.</p>
        </div>
      </div>
    `);
  } catch (err) {
    res.status(500).send("토큰을 획득하지 못했습니다: " + err.message);
  }
});

// ─── 4.5 카드결제 등록 로그 API (독지사 / LAS매장점주) ───────────────
const ExcelJS = require('exceljs');

// 분할결제 그룹 정보 계산 — 같은 transactionGroupId 행을 묶어 각 행의 위치(N/M)를 결정
// 사용: rows.forEach(r => { const split = getSplitInfo(r, groupMap); ... })
function buildSplitMap(rows) {
  const map = new Map();
  rows.forEach(r => {
    if (!r.transactionGroupId) return;
    if (!map.has(r.transactionGroupId)) map.set(r.transactionGroupId, []);
    map.get(r.transactionGroupId).push(r);
  });
  map.forEach(arr => arr.sort((a, b) => (a.id || 0) - (b.id || 0)));
  return map;
}
function getSplitLabel(r, splitMap) {
  if (!r.transactionGroupId) return '';
  const arr = splitMap.get(r.transactionGroupId);
  if (!arr || arr.length <= 1) return '';
  const idx = arr.findIndex(x => x.id === r.id);
  return ` (분할 ${idx + 1}/${arr.length})`;
}

// 양식의 일반 행/마지막 행 셀 스타일을 캐싱하고, 데이터 N개에 맞춰 행을 채움 + 외곽선 동적 적용
// 빈 행(데이터 개수 이후~양식 기본 끝)은 외곽선/번호 제거
function fillSheetWithDynamicBorder(ws, rows, splitMap, columnCount, formStartRow, formLastRow, fillCell) {
  // 양식 일반 행 스타일 (formStartRow)
  const normalRow = ws.getRow(formStartRow);
  const normalBorders = [];
  for (let c = 1; c <= columnCount; c++) normalBorders.push({ ...normalRow.getCell(c).border });
  // 양식 마지막 행 스타일 (formLastRow) — bottom medium
  const lastRow = ws.getRow(formLastRow);
  const lastBorders = [];
  for (let c = 1; c <= columnCount; c++) lastBorders.push({ ...lastRow.getCell(c).border });

  const DATA_FONT = { name: '맑은 고딕', size: 11, bold: false };
  const lastDataRowNum = formStartRow + rows.length - 1;

  rows.forEach((r, i) => {
    const rowNum = formStartRow + i;
    const row = ws.getRow(rowNum);
    fillCell(row, r, i, splitMap);
    const isLast = (rowNum === lastDataRowNum);
    for (let c = 1; c <= columnCount; c++) {
      row.getCell(c).border = isLast ? { ...lastBorders[c - 1] } : { ...normalBorders[c - 1] };
      row.getCell(c).font = DATA_FONT;
    }
    row.commit();
  });

  // 데이터 N개가 양식 기본 행 수 이하이면 4+N ~ formLastRow 행을 비우고 외곽선 제거
  for (let rn = lastDataRowNum + 1; rn <= formLastRow; rn++) {
    const row = ws.getRow(rn);
    for (let c = 1; c <= columnCount; c++) {
      row.getCell(c).value = null;
      row.getCell(c).border = {};
    }
    row.commit();
  }
}
const CARD_TEMPLATE_PATH = path.join(__dirname, 'templates', 'card_sales_daily_report.xlsx');

// ─── 카드결제 분류 마스터 API (어드민 관리) ───────────────────
app.get('/api/card-sales-categories', async (req, res) => {
  try {
    const list = await db.cardSalesCategories.findAll();
    res.json({ success: true, data: list });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/card-sales-categories', async (req, res) => {
  try {
    const { label, maxSplit, sortOrder } = req.body || {};
    if (!label || typeof label !== 'string') {
      return res.status(400).json({ success: false, error: '분류 이름(label)은 필수입니다.' });
    }
    // key 자동 생성 — 영문/숫자 변환 (label에서 영문 추출 또는 timestamp)
    const slug = label.toLowerCase().replace(/[^a-z0-9가-힣]/g, '').slice(0, 20);
    const key = `cat_${Date.now().toString(36)}_${slug || 'x'}`.slice(0, 50);
    const max = Math.max(1, Math.min(20, Number(maxSplit) || 10));
    const order = Number(sortOrder) || 0;
    const rec = await db.cardSalesCategories.create({ key, label, maxSplit: max, sortOrder: order });
    console.log(`💳 분류 추가 — ${rec.label} (key=${rec.key}, max=${rec.maxSplit})`);
    res.json({ success: true, data: rec });
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ success: false, error: '동일 키의 분류가 이미 존재합니다.' });
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/card-sales-categories/:id', async (req, res) => {
  try {
    await db.cardSalesCategories.delete(req.params.id);
    console.log(`💳 분류 삭제 — ID ${req.params.id}`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/card-sales — 신규 등록 (누구나)
// 단일 결제: { type, buyer, amount, catId, cardNumber, approvalNo, ... }
// 분할결제: { type, buyer, businessUnit, registrantOrg, registrantName, date, cards: [{ catId, amount, cardNumber, approvalNo }, ...] }
app.post('/api/card-sales', async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.type) {
      return res.status(400).json({ success: false, error: 'type(분류)은 필수입니다.' });
    }
    if (!b.buyer) {
      return res.status(400).json({ success: false, error: '구매자는 필수 항목입니다.' });
    }
    // 카테고리 조회 — DB 마스터 우선, 없으면 레거시 매핑 fallback
    const cat = await db.cardSalesCategories.findByKey(b.type);
    let content, maxCards;
    if (cat) {
      content = cat.label;
      maxCards = cat.maxSplit;
    } else if (b.type === 'dok_teacher') {
      content = '독서지도사'; maxCards = 5;
    } else if (b.type === 'las_owner') {
      content = '점주보증금'; maxCards = 10;
    } else {
      return res.status(400).json({ success: false, error: `등록되지 않은 분류: ${b.type}` });
    }
    const date = b.date || new Date().toISOString().slice(0, 10);

    // 분할결제 모드 — cards 배열
    if (Array.isArray(b.cards) && b.cards.length > 0) {
      if (b.cards.length > maxCards) {
        return res.status(400).json({ success: false, error: `${content} 분할결제는 최대 ${maxCards}장입니다 (요청: ${b.cards.length}장).` });
      }
      const invalidIdx = b.cards.findIndex(c => !c || !c.amount);
      if (invalidIdx >= 0) {
        return res.status(400).json({ success: false, error: `${invalidIdx + 1}번째 카드의 금액이 없습니다.` });
      }
      // 그룹 UUID 생성
      const crypto = require('crypto');
      const groupId = crypto.randomUUID();
      const created = [];
      for (const c of b.cards) {
        const rec = await db.cardSales.create({
          type: b.type,
          date,
          catId: c.catId || null,
          businessUnit: b.businessUnit || null,
          buyer: b.buyer,
          content,
          amount: String(c.amount).replace(/[^0-9]/g, ''),
          cardIssuer: c.cardIssuer || null,
          cardNumber: c.cardNumber || null,
          approvalNo: c.approvalNo || null,
          registrantOrg: b.registrantOrg || null,
          registrantName: b.registrantName || null,
          transactionGroupId: groupId
        });
        created.push(rec);
      }
      console.log(`💳 분할결제 등록 (${content}, ${b.cards.length}장) — group ${groupId.slice(0,8)}, ${b.buyer}`);
      return res.json({ success: true, data: created, groupId, count: created.length });
    }

    // 단일 결제 — 기존 로직
    if (!b.amount) {
      return res.status(400).json({ success: false, error: '금액은 필수 항목입니다.' });
    }
    const record = await db.cardSales.create({
      type: b.type,
      date,
      catId: b.catId || null,
      businessUnit: b.businessUnit || null,
      buyer: b.buyer,
      content,
      amount: String(b.amount).replace(/[^0-9]/g, ''),
      cardIssuer: b.cardIssuer || null,
      cardNumber: b.cardNumber || null,
      approvalNo: b.approvalNo || null,
      registrantOrg: b.registrantOrg || null,
      registrantName: b.registrantName || null
    });
    console.log(`💳 카드결제 등록 (${content}) — ID ${record.id}, ${record.buyer}, ${record.amount}원`);
    res.json({ success: true, data: record });
  } catch (err) {
    console.error('카드결제 등록 실패:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/card-sales — 조회 + 필터 (어드민 전용 — 클라이언트에서 Firebase Auth 보호)
app.get('/api/card-sales', async (req, res) => {
  try {
    const filter = {
      from: req.query.from || null,
      to: req.query.to || null,
      type: req.query.type || null,
      businessUnit: req.query.businessUnit || null,
      buyer: req.query.buyer || null,
      registrantOrg: req.query.registrantOrg || null,
      registrantName: req.query.registrantName || null
    };
    const rows = await db.cardSales.findMany(filter);
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('카드결제 조회 실패:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/card-sales/:id — 구매자/담당자(소속/성명) 수정 (어드민 전용)
app.patch('/api/card-sales/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ success: false, error: '유효하지 않은 id' });
    const b = req.body || {};
    const data = {};
    if (typeof b.buyer === 'string') data.buyer = b.buyer;
    if (typeof b.registrantOrg === 'string') data.registrantOrg = b.registrantOrg;
    if (typeof b.registrantName === 'string') data.registrantName = b.registrantName;
    if (Object.keys(data).length === 0) return res.status(400).json({ success: false, error: '수정할 항목이 없습니다.' });
    const updated = await db.cardSales.update(id, data);
    console.log(`💳 카드결제 수정 — ID ${id}: ${JSON.stringify(data)}`);
    res.json({ success: true, data: updated });
  } catch (err) {
    console.error('카드결제 수정 실패:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/card-sales/:id — 삭제 (어드민 전용)
app.delete('/api/card-sales/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ success: false, error: '유효하지 않은 id' });
    await db.cardSales.delete(id);
    console.log(`💳 카드결제 삭제 — ID ${id}`);
    res.json({ success: true });
  } catch (err) {
    console.error('카드결제 삭제 실패:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/card-sales/export — 필터 결과를 양식에 채워 엑셀 다운로드 (어드민 전용)
app.get('/api/card-sales/export', async (req, res) => {
  try {
    const filter = {
      from: req.query.from || null,
      to: req.query.to || null,
      type: req.query.type || null,
      businessUnit: req.query.businessUnit || null,
      buyer: req.query.buyer || null,
      registrantOrg: req.query.registrantOrg || null,
      registrantName: req.query.registrantName || null
    };
    const rows = await db.cardSales.findMany(filter);

    // exceljs로 양식 로드 — 셀 스타일/병합/너비/폰트 모두 보존
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(CARD_TEMPLATE_PATH);
    const ws = wb.worksheets[0];

    // 4행부터 데이터 채움 — 양식의 행 스타일을 데이터 N개에 맞춰 동적 적용 (마지막 행에 medium bottom)
    // 컬럼: A=번호, B=날짜, C=CAT ID, D=사업부, E=구매자(+분할표기), F=내용, G=금액, H=카드사, I=카드번호, J=승인번호, K=담당
    const splitMap = buildSplitMap(rows);
    fillSheetWithDynamicBorder(ws, rows, splitMap, 11, 4, 18, (row, r, i, sMap) => {
      row.getCell(1).value = i + 1;
      row.getCell(2).value = r.date || '';
      row.getCell(3).value = r.catId || '';
      row.getCell(4).value = r.businessUnit || '';
      row.getCell(5).value = (r.buyer || '') + getSplitLabel(r, sMap);
      row.getCell(6).value = r.content || '';
      row.getCell(7).value = r.amount ? Number(r.amount) : '';
      row.getCell(8).value = r.cardIssuer || '';
      row.getCell(9).value = r.cardNumber || '';
      row.getCell(10).value = r.approvalNo || '';
      row.getCell(11).value = [r.registrantOrg, r.registrantName].filter(Boolean).join('/');
    });

    const buf = await wb.xlsx.writeBuffer();
    const filename = `카드매출_일일보고_${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.send(Buffer.from(buf));
  } catch (err) {
    console.error('카드결제 엑셀 다운로드 실패:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── 4.55 시스템 설정 (일일보고 수신 이메일) ────────────────────
const DAILY_REPORT_EMAIL_KEY = 'daily_report_recipient_email';
const DEFAULT_DAILY_REPORT_EMAIL = 'gospress.dckwak@gmail.com';

app.get('/api/system/config/daily-report-email', async (req, res) => {
  try {
    const value = await db.config.get(DAILY_REPORT_EMAIL_KEY, DEFAULT_DAILY_REPORT_EMAIL);
    res.json({ success: true, email: value });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.patch('/api/system/config/daily-report-email', async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ success: false, error: '이메일 값이 필요합니다.' });
    }
    // 콤마(,) 또는 세미콜론(;)으로 구분된 다수 수신자 지원 — 각 항목이 이메일 형식이어야 함
    const parts = email.split(/[,;]/).map(s => s.trim()).filter(Boolean);
    if (parts.length === 0) {
      return res.status(400).json({ success: false, error: '유효한 이메일이 없습니다.' });
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const invalid = parts.filter(p => !emailRegex.test(p));
    if (invalid.length > 0) {
      return res.status(400).json({ success: false, error: `유효하지 않은 이메일: ${invalid.join(', ')}` });
    }
    // 정규화된 형식("a@x.com, b@y.com")으로 저장 — nodemailer가 그대로 다수 처리
    const normalized = parts.join(', ');
    await db.config.set(DAILY_REPORT_EMAIL_KEY, normalized);
    console.log(`📧 일일보고 수신 이메일 변경 (${parts.length}명): ${normalized}`);
    res.json({ success: true, email: normalized, recipientCount: parts.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── 4.6 일일 카드결제 보고 자동 이메일 (Cloud Scheduler가 매일 22:00 KST에 호출) ───
const nodemailer = require('nodemailer');

// 전일 22:00 KST(13:00 UTC) ~ 당일 22:00 KST(13:00 UTC) 범위의 카드결제 로그 집계 후 이메일 발송
app.post('/api/cron/daily-card-sales-report', async (req, res) => {
  // Cloud Scheduler 헤더 검증
  const cronSecret = process.env.CRON_SECRET;
  const reqSecret = req.headers['x-cron-secret'];
  if (!cronSecret || reqSecret !== cronSecret) {
    return res.status(403).json({ success: false, error: 'forbidden' });
  }

  try {
    // 시각 범위 산정 — query.from/query.to (ISO timestamp) 지정 시 우선, 미지정 시 자동 산정
    // 자동 산정: 호출 시점 기준 직전 13:00 UTC(=22:00 KST)를 종료점으로 한 24시간 윈도우
    let fromUtc, toUtc;
    if (req.query.from && req.query.to) {
      fromUtc = new Date(req.query.from);
      toUtc = new Date(req.query.to);
    } else {
      const now = new Date();
      toUtc = new Date(now);
      toUtc.setUTCHours(13, 0, 0, 0);
      if (toUtc > now) toUtc.setUTCDate(toUtc.getUTCDate() - 1);
      fromUtc = new Date(toUtc);
      fromUtc.setUTCDate(fromUtc.getUTCDate() - 1);
    }

    console.log(`📧 [Daily Report] 집계 범위 (createdAt UTC): ${fromUtc.toISOString()} ~ ${toUtc.toISOString()}`);

    // DB 조회 — createdAt 기준
    const rows = await db.cardSales.findMany({ from: null, to: null });
    const filtered = rows.filter(r => {
      const t = new Date(r.createdAt).getTime();
      return t >= fromUtc.getTime() && t < toUtc.getTime();
    });
    console.log(`📧 [Daily Report] 대상 행 수: ${filtered.length}`);

    // 엑셀 생성 (기존 양식 + 데이터 동적 외곽선 적용)
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(CARD_TEMPLATE_PATH);
    const ws = wb.worksheets[0];
    const splitMap = buildSplitMap(filtered);
    fillSheetWithDynamicBorder(ws, filtered, splitMap, 11, 4, 18, (row, r, i, sMap) => {
      row.getCell(1).value = i + 1;
      row.getCell(2).value = r.date || '';
      row.getCell(3).value = r.catId || '';
      row.getCell(4).value = r.businessUnit || '';
      row.getCell(5).value = (r.buyer || '') + getSplitLabel(r, sMap);
      row.getCell(6).value = r.content || '';
      row.getCell(7).value = r.amount ? Number(r.amount) : '';
      row.getCell(8).value = r.cardIssuer || '';
      row.getCell(9).value = r.cardNumber || '';
      row.getCell(10).value = r.approvalNo || '';
      row.getCell(11).value = [r.registrantOrg, r.registrantName].filter(Boolean).join('/');
    });
    const xlsxBuf = Buffer.from(await wb.xlsx.writeBuffer());

    // KST 날짜 — 전일/금일 (시각 +9h 보정)
    const fromKstDate = new Date(fromUtc.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
    const toKstDate = new Date(toUtc.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
    const filename = `카드매출_일일보고_${toKstDate}.xlsx`;

    // 수신자 DB에서 로드 (없으면 기본값)
    const recipient = await db.config.get(DAILY_REPORT_EMAIL_KEY, DEFAULT_DAILY_REPORT_EMAIL);

    // 이메일 전송
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: 'zdevbro@gmail.com',
        pass: process.env.GMAIL_APP_PASSWORD
      }
    });

    const totalAmount = filtered.reduce((s, r) => s + (Number(r.amount) || 0), 0);

    await transporter.sendMail({
      from: '"에이멘에이 자동보고" <zdevbro@gmail.com>',
      to: recipient,
      subject: `[에이멘에이] 카드매출 일일보고 ${toKstDate}`,
      text: `교육본부\n\n` +
            `전일(${fromKstDate}) 오후 10:00 ~ 금일(${toKstDate}) 오후 10:00까지 카드매출 취합하여 송부합니다.`,
      attachments: [{ filename, content: xlsxBuf }]
    });

    console.log(`📧 [Daily Report] 이메일 발송 완료 — 수신: ${recipient}, ${filtered.length}건, ${totalAmount.toLocaleString()}원`);
    res.json({ success: true, range: { from: fromUtc, to: toUtc }, count: filtered.length, total: totalAmount, recipient });
  } catch (err) {
    console.error('📧 [Daily Report] 실패:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. 서버 구동 시작
app.listen(PORT, () => {
  console.log(`🚀 에이멘에이 교재신청 백엔드 서버가 ${PORT} 포트에서 성공적으로 구동되었습니다.`);
  console.log(`🔗 백엔드 API URL: http://localhost:${PORT}`);
});
