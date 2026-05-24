const { PDFDocument, rgb, degrees } = require('pdf-lib');
const fs = require('fs');
const path = require('path');
const fontkit = require('@pdf-lib/fontkit');

// A5 portrait 페이지 규격 (148mm × 210mm)
const A5_W = 419.53;
const A5_H = 595.28;
// A4 페이지 규격 (210mm × 297mm)
const A4_W = 595.28;
const A4_H = 841.89;

const pdfService = {
  // A5 단일 페이지 신청서 — 레퍼런스(0050_001) 좌측 양식과 동일한 구조로 작성
  generateApplicationPdf: async (data, signatureBase64 = null, receiptOcrData = null) => {
    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);

    const font = await loadKoreanFont(pdfDoc);

    const page = pdfDoc.addPage([A5_W, A5_H]);
    const { width: W, height: H } = page.getSize();
    const ML = 14;
    const MR = W - 14;
    const CW = MR - ML;

    let y = H - 22;

    // ─── 타이틀 ────────────────────────────────────────────────
    const title = '교재구매, 회원가입 신청서';
    const titleSize = 13;
    const titleW = font.widthOfTextAtSize(title, titleSize);
    page.drawText(title, { x: (W - titleW) / 2, y, size: titleSize, font, color: rgb(0, 0, 0) });
    y -= 18;

    const ROW = 15;
    const LBL_BG = rgb(0.94, 0.95, 0.97);
    const HL_BG = rgb(0.92, 0.94, 0.98);
    const BD = rgb(0.55, 0.6, 0.65);
    const TXT = rgb(0.05, 0.05, 0.08);

    // 셀 그리기 헬퍼
    const cell = (x, top, w, h, opts = {}) => {
      page.drawRectangle({
        x, y: top - h, width: w, height: h,
        color: opts.bg || rgb(1, 1, 1),
        borderColor: BD, borderWidth: 0.5
      });
    };
    const text = (str, x, top, opts = {}) => {
      if (str === undefined || str === null || str === '') return;
      const size = opts.size || 8;
      const txt = String(str);
      const tw = font.widthOfTextAtSize(txt, size);
      const tx = opts.align === 'right' ? x - tw : opts.align === 'center' ? x - tw / 2 : x;
      page.drawText(txt, { x: tx, y: top - 10, size, font, color: opts.color || TXT });
    };

    // ─── 1. 기본 정보 ──────────────────────────────────────────
    // 행 1: 구매자성명 | 자녀성명(연령) ( 세)
    const halfW = CW / 2;
    const lblW = 60;
    cell(ML, y, lblW, ROW, { bg: LBL_BG }); text('구매자성명', ML + 4, y);
    cell(ML + lblW, y, halfW - lblW, ROW); text(data.buyerName, ML + lblW + 4, y);
    cell(ML + halfW, y, lblW + 10, ROW, { bg: LBL_BG }); text('자녀성명(연령)', ML + halfW + 4, y);
    cell(ML + halfW + lblW + 10, y, halfW - lblW - 30, ROW); text(data.childInfo, ML + halfW + lblW + 14, y);
    cell(MR - 20, y, 20, ROW); text('( 세)', MR - 17, y, { size: 7, color: rgb(0.5, 0.5, 0.5) });
    y -= ROW;

    cell(ML, y, lblW, ROW, { bg: LBL_BG }); text('전화번호', ML + 4, y);
    cell(ML + lblW, y, CW - lblW, ROW); text(data.phoneNumber, ML + lblW + 4, y);
    y -= ROW;

    cell(ML, y, lblW, ROW, { bg: LBL_BG }); text('배송지', ML + 4, y);
    cell(ML + lblW, y, CW - lblW, ROW); text(data.address, ML + lblW + 4, y);
    y -= ROW;

    cell(ML, y, lblW, ROW, { bg: LBL_BG }); text('배송메모', ML + 4, y);
    cell(ML + lblW, y, CW - lblW, ROW); text(data.deliveryMemo, ML + lblW + 4, y);
    y -= ROW + 4;

    // ─── 2. 상품 (교재 / 구독회원 / 관리회원) ─────────────────
    // 한 행: [구분(60) | 항목라벨(55) | 항목값(flex) | 금액라벨(40) | 금액값(flex)]
    const catW = 60, itemLblW = 55, priceLblW = 40, priceValW = 70, wonW = 16;
    const itemValW = CW - catW - itemLblW - priceLblW - priceValW - wonW;

    const productRow = (cat, itemLbl, itemVal, priceVal, drawCatBg = true) => {
      let x = ML;
      cell(x, y, catW, ROW, { bg: drawCatBg ? LBL_BG : rgb(1, 1, 1) });
      if (drawCatBg) text(cat, x + 4, y);
      x += catW;
      cell(x, y, itemLblW, ROW, { bg: LBL_BG }); text(itemLbl, x + 4, y);
      x += itemLblW;
      cell(x, y, itemValW, ROW); text(itemVal, x + 4, y);
      x += itemValW;
      cell(x, y, priceLblW, ROW, { bg: LBL_BG }); text('금액', x + 4, y);
      x += priceLblW;
      cell(x, y, priceValW, ROW); text(formatNum(priceVal), x + priceValW - 4, y, { align: 'right' });
      x += priceValW;
      cell(x, y, wonW, ROW); text('원', x + 4, y, { size: 7.5, color: rgb(0.5, 0.5, 0.5) });
      y -= ROW;
    };

    productRow('교재구입', '교재명 1', data.book1Name, data.book1Price, true);
    productRow('', '교재명 2', data.book2Name, data.book2Price, false);
    productRow('구독회원', '상품구분', data.subscriptionType, data.subscriptionPrice, true);
    productRow('관리회원', '상품구분', '', '', true);
    y -= 4;

    // ─── 3. 입금계좌 안내 (강조 박스) ────────────────────────
    cell(ML, y, CW, ROW, { bg: HL_BG });
    const acctText = '입금계좌 : 기업은행 327-067663-04-037 에이멘에이(주)';
    const acctW = font.widthOfTextAtSize(acctText, 8.5);
    page.drawText(acctText, { x: (W - acctW) / 2, y: y - 10, size: 8.5, font, color: rgb(0.15, 0.25, 0.5) });
    y -= ROW + 4;

    // ─── 4. 결제 구분 ─────────────────────────────────────────
    const payCatW = 60, payLblW = 65, payValW = (CW - payCatW - payLblW * 2) / 2;
    cell(ML, y, payCatW, ROW, { bg: LBL_BG }); text('결제 구분', ML + 4, y);
    cell(ML + payCatW, y, payLblW, ROW, { bg: LBL_BG }); text('현금결제액', ML + payCatW + 4, y);
    cell(ML + payCatW + payLblW, y, payValW, ROW); text(formatNum(data.cashPayment) + (data.cashPayment ? ' 원' : ''), ML + payCatW + payLblW + payValW - 4, y, { align: 'right' });
    cell(ML + payCatW + payLblW + payValW, y, payLblW, ROW, { bg: LBL_BG }); text('카드결제액', ML + payCatW + payLblW + payValW + 4, y);
    cell(ML + payCatW + payLblW * 2 + payValW, y, payValW, ROW); text(formatNum(data.cardPayment) + (data.cardPayment ? ' 원' : ''), MR - 4, y, { align: 'right' });
    y -= ROW;

    cell(ML, y, payCatW + payLblW, ROW, { bg: LBL_BG }); text('현금영수증 증빙번호', ML + 4, y);
    cell(ML + payCatW + payLblW, y, payValW, ROW); text(data.cashReceiptNo, ML + payCatW + payLblW + 4, y);
    cell(ML + payCatW + payLblW + payValW, y, CW - payCatW - payLblW - payValW, ROW);
    text('※ 현금 영수증 필수 첨부', MR - 4, y, { align: 'right', size: 7.5, color: rgb(0.7, 0.2, 0.2) });
    y -= ROW;

    cell(ML, y, payCatW, ROW, { bg: LBL_BG }); text('판매자 정보', ML + 4, y);
    cell(ML + payCatW, y, payLblW, ROW, { bg: LBL_BG }); text('소속 및 성명', ML + payCatW + 4, y);
    cell(ML + payCatW + payLblW, y, payValW, ROW); text(data.sellerName, ML + payCatW + payLblW + 4, y);
    cell(ML + payCatW + payLblW + payValW, y, payLblW, ROW, { bg: LBL_BG }); text('연락처', ML + payCatW + payLblW + payValW + 4, y);
    cell(ML + payCatW + payLblW * 2 + payValW, y, payValW, ROW); text(data.sellerPhone, ML + payCatW + payLblW * 2 + payValW + 4, y);
    y -= ROW + 4;

    // ─── 5. 카드결제정보 박스 ─────────────────────────────────
    // receiptOcrData.card 는 배열(다중) 또는 단일 객체(구버전) — 정규화
    const cardsArr = Array.isArray(receiptOcrData?.card)
      ? receiptOcrData.card.filter(Boolean)
      : (receiptOcrData?.card ? [receiptOcrData.card] : []);

    cell(ML, y, CW, ROW, { bg: LBL_BG }); text('카드결제정보', ML + 4, y);
    y -= ROW;

    // 헤더 행
    const ccW = [110, 100, 100, CW - 310];
    let cx = ML;
    ['카드사 / 할부', '카드금액', '승인번호', '비고'].forEach((h, i) => {
      cell(cx, y, ccW[i], ROW, { bg: LBL_BG });
      text(h, cx + 4, y, { size: 7.5 });
      cx += ccW[i];
    });
    y -= ROW;

    // 데이터 행 — 카드별로 1행씩, 없으면 빈 1행
    const dataRows = cardsArr.length > 0 ? cardsArr : [{}];
    for (const c of dataRows) {
      cx = ML;
      const vals = [c.issuer || '', formatNum(c.amount), c.approvalNo || '', ''];
      vals.forEach((v, i) => {
        cell(cx, y, ccW[i], ROW);
        text(v, cx + 4, y);
        cx += ccW[i];
      });
      y -= ROW;
    }

    // 합계 행
    cell(ML, y, CW - 120, ROW, { bg: LBL_BG });
    text('카드 금액 합계', ML + 4, y);
    text(formatNum(data.cardPayment) + ' 원', ML + CW - 124, y, { align: 'right' });
    cell(ML + CW - 120, y, 120, ROW);
    text('※ 카드 영수증 필수 첨부', MR - 4, y, { align: 'right', size: 7.5, color: rgb(0.7, 0.2, 0.2) });
    y -= ROW + 6;

    // ── 균형 잡기 — 동의서~서명~회사정보 블록을 카드결제정보 박스 아래 남은 공간 중앙에 배치 ──
    const SECTION_6_7_HEIGHT = 173; // 동의서 + 신청일자 + 서명박스 + 회사정보 합산 높이 (대략)
    const BOTTOM_MARGIN = 14;
    const remainingSpace = y - BOTTOM_MARGIN;
    const extraTopGap = Math.max(0, (remainingSpace - SECTION_6_7_HEIGHT) / 2);
    y -= extraTopGap;

    // ─── 6. 개인정보 동의서 (이하 전부 중앙정렬) ──────────────────────
    const CX = W / 2;
    text('개인 정보 수집·이용 동의서', CX, y, { size: 8.5, align: 'center' });
    y -= 14;
    text('교재구입 및 구독회원, 관리회원의 개인정보 수집 및 이용 목적은 다음과 같습니다.', CX, y, { size: 7, color: rgb(0.4, 0.4, 0.4), align: 'center' });
    y -= 11;
    text('내용을 자세히 읽어 보신 후 동의 여부를 결정하여 주시기 바랍니다.', CX, y, { size: 7, color: rgb(0.4, 0.4, 0.4), align: 'center' });
    y -= 14;

    // 1행 표 — 폭 축소 후 가운데 정렬
    const tblW = 320;
    const tblX = (W - tblW) / 2;
    const cWs = [tblW * 0.4, tblW * 0.3, tblW * 0.3];
    let hx = tblX;
    ['수집목적', '항목', '보유 및 이용기간'].forEach((h, i) => {
      cell(hx, y, cWs[i], ROW, { bg: LBL_BG });
      text(h, hx + cWs[i] / 2, y, { align: 'center', size: 7.5 });
      hx += cWs[i];
    });
    y -= ROW;
    hx = tblX;
    ['회원 식별 및 서비스 제공', '이름, 연락처', '수집일로부터 1년'].forEach((v, i) => {
      cell(hx, y, cWs[i], ROW);
      text(v, hx + cWs[i] / 2, y, { align: 'center', size: 7.5 });
      hx += cWs[i];
    });
    y -= ROW + 2;

    text('※ 개인정보 수집·이용을 거부할 권리가 있습니다. 단, 거부 시 서비스가 제한 될 수 있습니다.', CX, y, { size: 6.8, color: rgb(0.5, 0.5, 0.5), align: 'center' });
    y -= 12;

    const consentTxt = data.privacyConsent ? '[ V ] 동의함            [   ] 거부함' : '[   ] 동의함            [ V ] 거부함';
    text(consentTxt, CX, y, { size: 8, align: 'center' });
    y -= 16;

    // ─── 7. 신청 일자 + 신청인 서명 + 회사 정보 (모두 중앙정렬) ───────
    text('신청 일자: ' + (data.applyDate || ''), CX, y, { size: 7.5, color: rgb(0.3, 0.3, 0.3), align: 'center' });
    y -= 14;

    const sigBoxW = 160;
    const sigBoxH = 42;
    const sigX = (W - sigBoxW) / 2;
    const sigY = y;
    cell(sigX, sigY, sigBoxW, sigBoxH);
    text('신청인 서명', sigX + sigBoxW / 2, sigY, { size: 7, color: rgb(0.4, 0.4, 0.4), align: 'center' });
    if (signatureBase64) {
      try {
        const clean = signatureBase64.replace(/^data:image\/png;base64,/, '');
        const sigImg = await pdfDoc.embedPng(Buffer.from(clean, 'base64'));
        page.drawImage(sigImg, {
          x: sigX + 15,
          y: sigY - sigBoxH + 4,
          width: sigBoxW - 30,
          height: sigBoxH - 16
        });
      } catch (e) {
        console.error('서명 임베딩 오류:', e.message);
      }
    }
    y -= sigBoxH + 8;

    text('에이멘에이 주식회사', CX, y, { size: 10, color: rgb(0.1, 0.15, 0.3), align: 'center' });
    y -= 10;
    text('(직인 자리 — 추후 직인 이미지로 대체)', CX, y, { size: 6.5, color: rgb(0.6, 0.6, 0.6), align: 'center' });

    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
  },

  // 단일 A4 가로 페이지: 좌측 = 신청서 (A5 그대로 임베드), 우측 = 2x2 그리드 (이미지 90° CW 회전)
  // 2x2 슬롯 우선순위: 수기신청서 있으면 [TL=수기, TR=카드1, BL=카드2, BR=카드3 또는 현금]
  //                  없으면 [TL=카드1, TR=카드2, BL=카드3, BR=현금]
  buildBundledPdf: async (applicationPdfBuffer, photoBuffer = null, cardReceiptBuffers = null, cashReceiptBuffer = null) => {
    const finalDoc = await PDFDocument.create();
    finalDoc.registerFontkit(fontkit);
    const titleFont = await loadKoreanFont(finalDoc);

    // A4 landscape: 841.89 × 595.28 — A5 portrait(419.53 × 595.28)가 정확히 좌측 절반에 들어맞음
    const page = finalDoc.addPage([A4_H, A4_W]);
    const { width: pw, height: ph } = page.getSize();
    const halfW = pw / 2;

    // ── 좌측: 기존 A5 신청서 그대로 임베드 (스케일 1.0, 가로 절반 정확히 채움) ──
    const [formPage] = await finalDoc.embedPdf(applicationPdfBuffer, [0]);
    const xScale = halfW / A5_W; // ≈ 1.0034 (소수점 보정)
    const yScale = ph / A5_H;
    page.drawPage(formPage, { x: 0, y: 0, xScale, yScale });

    // 좌·우 구분선
    page.drawLine({
      start: { x: halfW, y: 0 },
      end: { x: halfW, y: ph },
      thickness: 0.5,
      color: rgb(0.7, 0.7, 0.75)
    });

    // ── 우측: 4슬롯 2x2 — 수기신청서 유무에 따라 우선순위 분기 ──
    const cardArr = Array.isArray(cardReceiptBuffers) ? cardReceiptBuffers.filter(Boolean) : [];
    let slots;
    if (photoBuffer) {
      // 수기신청서 있음: [TL=수기, TR=카드1, BL=카드2, BR=카드3 또는 현금]
      const brBuf = cardArr[2] || cashReceiptBuffer || null;
      const brLabel = cardArr[2] ? '카드 영수증 #3' : '현금 영수증';
      slots = [
        { label: '수기 신청서',    buf: photoBuffer },
        { label: '카드 영수증 #1', buf: cardArr[0] || null },
        { label: '카드 영수증 #2', buf: cardArr[1] || null },
        { label: brLabel,          buf: brBuf }
      ];
    } else {
      // 수기신청서 없음: 기존 [카드1, 카드2, 카드3, 현금] 배치
      slots = [
        { label: '카드 영수증 #1', buf: cardArr[0] || null },
        { label: '카드 영수증 #2', buf: cardArr[1] || null },
        { label: '카드 영수증 #3', buf: cardArr[2] || null },
        { label: '현금 영수증',    buf: cashReceiptBuffer || null }
      ];
    }

    const margin = 12;
    const cellGap = 8;
    const cellW = (halfW - margin * 2 - cellGap) / 2;
    const cellH = (ph - margin * 2 - cellGap) / 2;
    const cellLabelH = 14;

    for (let i = 0; i < 4; i++) {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = halfW + margin + col * (cellW + cellGap);
      const y = margin + (1 - row) * (cellH + cellGap);
      const slot = slots[i];

      // 상단 라벨
      page.drawRectangle({ x, y: y + cellH - cellLabelH, width: cellW, height: cellLabelH, color: rgb(0.94, 0.95, 0.97), borderColor: rgb(0.55, 0.6, 0.65), borderWidth: 0.5 });
      page.drawText(slot.label, { x: x + 5, y: y + cellH - cellLabelH + 4, size: 8, font: titleFont, color: rgb(0.1, 0.15, 0.3) });

      // 이미지 영역
      const imgY = y;
      const imgH = cellH - cellLabelH;
      page.drawRectangle({ x, y: imgY, width: cellW, height: imgH, borderColor: rgb(0.55, 0.6, 0.65), borderWidth: 0.5 });

      if (slot.buf) {
        const img = await embedAuto(finalDoc, slot.buf);
        drawImageFitted(page, img, x + 2, imgY + 2, cellW - 4, imgH - 4); // 90° CW 회전 적용됨
      } else {
        page.drawText('(미첨부)', { x: x + cellW / 2 - 18, y: imgY + imgH / 2 - 4, size: 9, font: titleFont, color: rgb(0.65, 0.65, 0.7) });
      }
    }

    const bytes = await finalDoc.save();
    return Buffer.from(bytes);
  }
};

// 플랫폼별 한글 TTF 폰트 자동 탐색 후 pdf-lib에 임베드
async function loadKoreanFont(pdfDoc) {
  const candidates = [
    'C:\\Windows\\Fonts\\malgun.ttf',                                // Windows (로컬 개발)
    '/usr/share/fonts/truetype/nanum/NanumGothic.ttf',               // Debian/Ubuntu (Cloud Run, fonts-nanum)
    '/usr/share/fonts/truetype/nanum/NanumBarunGothic.ttf',          // Debian 대체
    '/System/Library/Fonts/AppleSDGothicNeo.ttc'                     // macOS (개발)
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      try {
        return await pdfDoc.embedFont(fs.readFileSync(p), { subset: false });
      } catch (e) {
        console.warn(`⚠️ 폰트 임베딩 실패 [${p}]: ${e.message}`);
      }
    }
  }
  console.error("❌ 한글 폰트를 찾을 수 없어 Helvetica로 폴백 — 한글 출력 실패 가능");
  const { StandardFonts } = require('pdf-lib');
  return await pdfDoc.embedFont(StandardFonts.Helvetica);
}

// 숫자 문자열에 천단위 콤마 적용. 숫자 외 문자열은 그대로 반환
function formatNum(v) {
  if (v === undefined || v === null || v === '') return '';
  const s = String(v).replace(/[^0-9]/g, '');
  if (!s) return String(v);
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// 이미지 버퍼를 pdf-lib 이미지 객체로 임베드 (JPG/PNG 자동 감지)
async function embedAuto(pdfDoc, imageBuffer) {
  if (!imageBuffer || imageBuffer.length === 0) return null;
  if (imageBuffer[0] === 0xFF && imageBuffer[1] === 0xD8) return await pdfDoc.embedJpg(imageBuffer);
  if (imageBuffer[0] === 0x89 && imageBuffer[1] === 0x50) return await pdfDoc.embedPng(imageBuffer);
  try { return await pdfDoc.embedJpg(imageBuffer); }
  catch { return await pdfDoc.embedPng(imageBuffer); }
}

// 지정 박스 안에 이미지를 시계방향 90° 회전하여 비율 유지·가운데 정렬·박스 채움
// (휴대폰 카메라가 EXIF 회전 메타데이터로 저장한 사진을 PDF에서 올바른 방향으로 표시)
function drawImageFitted(page, image, boxX, boxY, boxW, boxH) {
  if (!image) return;
  // 90° CW 회전 후의 시각적 가로/세로 (원본의 height/width가 뒤바뀜)
  const rotW = image.height;
  const rotH = image.width;
  const aspect = rotW / rotH;
  const boxAspect = boxW / boxH;
  let visualW, visualH;
  if (aspect > boxAspect) {
    visualW = boxW;
    visualH = boxW / aspect;
  } else {
    visualH = boxH;
    visualW = boxH * aspect;
  }
  const visualX = boxX + (boxW - visualW) / 2;
  const visualY = boxY + (boxH - visualH) / 2;
  // -90° 회전은 (x, y)을 회전 중심으로 하므로 (x = visual_left, y = visual_top)에서
  // pre-rotation width = visualH, pre-rotation height = visualW 로 그려야 시각상 (visualW × visualH) 가 됨
  page.drawImage(image, {
    x: visualX,
    y: visualY + visualH,
    width: visualH,
    height: visualW,
    rotate: degrees(-90)
  });
}

module.exports = pdfService;
