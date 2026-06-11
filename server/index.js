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
    const { formData, signatureData, photoData, receiptPhotoData, receiptPhotoDataList, cashReceiptPhotoData, receiptOcrData } = req.body;
    // 신·구 페이로드 호환: receiptPhotoDataList(배열) > receiptPhotoData(단일)
    const cardReceiptList = Array.isArray(receiptPhotoDataList) && receiptPhotoDataList.length > 0
      ? receiptPhotoDataList
      : (receiptPhotoData ? [receiptPhotoData] : []);

    if (!formData || !formData.buyerName || !formData.phoneNumber || !formData.address) {
      return res.status(400).json({ error: '기본 구매자명, 연락처, 주소 정보는 필수로 채워야 합니다.' });
    }

    // 전화번호는 어떤 형태로 들어와도 (010-XXXX-XXXX, 010 XXXX XXXX 등) DB에는 숫자만 저장
    formData.phoneNumber = String(formData.phoneNumber || '').replace(/\D/g, '');

    console.log(`📝 신청서 접수 프로세스 시작. 구매자명: ${formData.buyerName}`);

    // 원본 사진, 카드 영수증 N장(최대 3), 현금영수증 이미지 버퍼 변환
    const photoBuffer = decodeBase64Image(photoData);
    const cardReceiptBuffers = cardReceiptList.map(decodeBase64Image).filter(Boolean);
    const cashReceiptBuffer = decodeBase64Image(cashReceiptPhotoData);

    // 3.1 pdf-lib 모듈을 사용하여 A5 신청서 PDF 생성 (서명 + 카드결제정보 합성) — 회사용 / 고객용
    const applicationPdfBuffer = await pdfService.generateApplicationPdf(formData, signatureData, receiptOcrData, 'company');
    const customerPdfBuffer    = await pdfService.generateApplicationPdf(formData, signatureData, receiptOcrData, 'customer');

    // 3.1.5 신청서 + 원본사진 + 카드영수증 N장 + 현금영수증 + 라벤 약정서 자동 채움까지 단일 PDF
    const bundledPdfBuffer = await pdfService.buildBundledPdf(
      applicationPdfBuffer,
      photoBuffer,
      cardReceiptBuffers,
      cashReceiptBuffer,
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
const CARD_TEMPLATE_PATH = path.join(__dirname, 'templates', 'card_sales_daily_report.xlsx');

// POST /api/card-sales — 신규 등록 (누구나)
app.post('/api/card-sales', async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.type || (b.type !== 'dok_teacher' && b.type !== 'las_owner')) {
      return res.status(400).json({ success: false, error: 'type은 dok_teacher 또는 las_owner여야 합니다.' });
    }
    if (!b.buyer || !b.amount) {
      return res.status(400).json({ success: false, error: '구매자, 금액은 필수 항목입니다.' });
    }
    const content = b.type === 'dok_teacher' ? '독서지도사' : '점주보증금';
    const record = await db.cardSales.create({
      type: b.type,
      date: b.date || new Date().toISOString().slice(0, 10),
      catId: b.catId || null,
      businessUnit: b.businessUnit || null,
      buyer: b.buyer,
      content: content,
      amount: String(b.amount).replace(/[^0-9]/g, ''),
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

    // 4행부터 데이터 채움 (양식의 4행에 미리 정의된 셀 스타일은 그대로 유지)
    // 컬럼: A=번호, B=날짜, C=CAT ID, D=사업부, E=구매자, F=내용, G=금액, H=카드번호, I=승인번호, J=입력자
    const DATA_FONT = { name: '맑은 고딕', size: 11, bold: false };
    rows.forEach((r, i) => {
      const rowNum = 4 + i;
      const row = ws.getRow(rowNum);
      row.getCell(1).value = i + 1;
      row.getCell(2).value = r.date || '';
      row.getCell(3).value = r.catId || '';
      row.getCell(4).value = r.businessUnit || '';
      row.getCell(5).value = r.buyer || '';
      row.getCell(6).value = r.content || '';
      row.getCell(7).value = r.amount ? Number(r.amount) : '';
      row.getCell(8).value = r.cardNumber || '';
      row.getCell(9).value = r.approvalNo || '';
      // J(10) = 입력자 — "입력자소속/입력자성명" (사업부는 D컬럼에 별도 표시되므로 제외, 빈 값 제외)
      row.getCell(10).value = [r.registrantOrg, r.registrantName].filter(Boolean).join('/');
      // 모든 데이터 셀에 맑은 고딕 11pt Normal (bold 금지) 적용
      for (let c = 1; c <= 10; c++) {
        row.getCell(c).font = DATA_FONT;
      }
      row.commit();
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

// 5. 서버 구동 시작
app.listen(PORT, () => {
  console.log(`🚀 에이멘에이 교재신청 백엔드 서버가 ${PORT} 포트에서 성공적으로 구동되었습니다.`);
  console.log(`🔗 백엔드 API URL: http://localhost:${PORT}`);
});
