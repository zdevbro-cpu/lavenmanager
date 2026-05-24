const { PDFDocument, rgb } = require('pdf-lib');
const fs = require('fs');
const path = require('path');
const fontkit = require('@pdf-lib/fontkit');

// A5 portrait 페이지 규격 (148mm × 210mm)
const A5_W = 419.53;
const A5_H = 595.28;

const pdfService = {
  // A5 단일 페이지 신청서 — 레퍼런스(0050_001) 좌측 양식과 동일한 구조로 작성
  generateApplicationPdf: async (data, signatureBase64 = null, receiptOcrData = null) => {
    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);

    const fontPath = 'C:\\Windows\\Fonts\\malgun.ttf';
    let font;
    if (fs.existsSync(fontPath)) {
      font = await pdfDoc.embedFont(fs.readFileSync(fontPath), { subset: false });
    } else {
      console.warn("⚠️ 한글 맑은 고딕 폰트를 찾을 수 없어 Helvetica 폰트로 폴백합니다.");
      const { StandardFonts } = require('pdf-lib');
      font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    }

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
    const card = receiptOcrData?.card || {};
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

    // 데이터 행
    cx = ML;
    const cardVals = [card.issuer || '', formatNum(card.amount), card.approvalNo || '', ''];
    cardVals.forEach((v, i) => {
      cell(cx, y, ccW[i], ROW);
      text(v, cx + 4, y);
      cx += ccW[i];
    });
    y -= ROW;

    // 합계 행
    cell(ML, y, CW - 120, ROW, { bg: LBL_BG });
    text('카드 금액 합계', ML + 4, y);
    text(formatNum(data.cardPayment) + ' 원', ML + CW - 124, y, { align: 'right' });
    cell(ML + CW - 120, y, 120, ROW);
    text('※ 카드 영수증 필수 첨부', MR - 4, y, { align: 'right', size: 7.5, color: rgb(0.7, 0.2, 0.2) });
    y -= ROW + 6;

    // ─── 6. 개인정보 동의서 ──────────────────────────────────
    text('개인 정보 수집·이용 동의서', ML, y, { size: 8.5 });
    y -= 11;
    text('교재구입 및 구독회원, 관리회원의 개인정보 수집 및 이용 목적은 다음과 같습니다.', ML, y, { size: 7, color: rgb(0.4, 0.4, 0.4) });
    y -= 9;
    text('내용을 자세히 읽어 보신 후 동의 여부를 결정하여 주시기 바랍니다.', ML, y, { size: 7, color: rgb(0.4, 0.4, 0.4) });
    y -= 10;

    // 1행 표
    const cWs = [CW * 0.4, CW * 0.3, CW * 0.3];
    let hx = ML;
    ['수집목적', '항목', '보유 및 이용기간'].forEach((h, i) => {
      cell(hx, y, cWs[i], ROW, { bg: LBL_BG });
      text(h, hx + cWs[i] / 2, y, { align: 'center', size: 7.5 });
      hx += cWs[i];
    });
    y -= ROW;
    hx = ML;
    ['회원 식별 및 서비스 제공', '이름, 연락처', '수집일로부터 1년'].forEach((v, i) => {
      cell(hx, y, cWs[i], ROW);
      text(v, hx + cWs[i] / 2, y, { align: 'center', size: 7.5 });
      hx += cWs[i];
    });
    y -= ROW + 2;

    text('※ 개인정보 수집·이용을 거부할 권리가 있습니다. 단, 거부 시 서비스가 제한 될 수 있습니다.', ML, y, { size: 6.8, color: rgb(0.5, 0.5, 0.5) });
    y -= 12;

    const consentTxt = data.privacyConsent ? '[ V ] 동의함            [   ] 거부함' : '[   ] 동의함            [ V ] 거부함';
    text(consentTxt, ML, y, { size: 8 });
    y -= 16;

    // ─── 7. 신청인 서명 & 회사 정보 ───────────────────────────
    text('신청 일자: ' + (data.applyDate || ''), ML, y, { size: 7.5, color: rgb(0.3, 0.3, 0.3) });

    const sigBoxW = 130;
    const sigBoxH = 38;
    const sigX = MR - sigBoxW;
    const sigY = y;
    cell(sigX, sigY, sigBoxW, sigBoxH);
    text('신청인 서명', sigX + 4, sigY, { size: 7, color: rgb(0.4, 0.4, 0.4) });
    if (signatureBase64) {
      try {
        const clean = signatureBase64.replace(/^data:image\/png;base64,/, '');
        const sigImg = await pdfDoc.embedPng(Buffer.from(clean, 'base64'));
        page.drawImage(sigImg, {
          x: sigX + 10,
          y: sigY - sigBoxH + 4,
          width: sigBoxW - 20,
          height: sigBoxH - 14
        });
      } catch (e) {
        console.error('서명 임베딩 오류:', e.message);
      }
    }
    y -= sigBoxH + 6;

    text('에이멘에이 주식회사', ML, y, { size: 10, color: rgb(0.1, 0.15, 0.3) });
    text('(직인 자리 — 추후 직인 이미지로 대체)', ML + 95, y, { size: 6.5, color: rgb(0.6, 0.6, 0.6) });

    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
  },

  // 신청서 PDF 뒤에 원본사진·카드영수증·현금영수증을 페이지로 이어붙여 단일 통합 PDF 반환
  buildBundledPdf: async (applicationPdfBuffer, photoBuffer = null, receiptBuffer = null, cashReceiptBuffer = null) => {
    const finalDoc = await PDFDocument.load(applicationPdfBuffer);
    finalDoc.registerFontkit(fontkit);

    const fontPath = 'C:\\Windows\\Fonts\\malgun.ttf';
    let titleFont;
    if (fs.existsSync(fontPath)) {
      titleFont = await finalDoc.embedFont(fs.readFileSync(fontPath), { subset: true });
    } else {
      const { StandardFonts } = require('pdf-lib');
      titleFont = await finalDoc.embedFont(StandardFonts.Helvetica);
    }

    await appendImagePage(finalDoc, photoBuffer, '첨부 1. 원본 신청서 사진 (Original Application Photo)', titleFont);
    await appendImagePage(finalDoc, receiptBuffer, '첨부 2. 카드 결제 영수증 (Card Payment Receipt)', titleFont);
    await appendImagePage(finalDoc, cashReceiptBuffer, '첨부 3. 현금영수증 (Cash Receipt)', titleFont);

    const bytes = await finalDoc.save();
    return Buffer.from(bytes);
  }
};

// 숫자 문자열에 천단위 콤마 적용. 숫자 외 문자열은 그대로 반환
function formatNum(v) {
  if (v === undefined || v === null || v === '') return '';
  const s = String(v).replace(/[^0-9]/g, '');
  if (!s) return String(v);
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// 이미지 버퍼를 A5 한 페이지로 추가 (상단 타이틀 + 가운데 정렬, 비율 유지)
async function appendImagePage(pdfDoc, imageBuffer, title, titleFont) {
  if (!imageBuffer || imageBuffer.length === 0) return;

  let image;
  if (imageBuffer[0] === 0xFF && imageBuffer[1] === 0xD8) {
    image = await pdfDoc.embedJpg(imageBuffer);
  } else if (imageBuffer[0] === 0x89 && imageBuffer[1] === 0x50) {
    image = await pdfDoc.embedPng(imageBuffer);
  } else {
    try { image = await pdfDoc.embedJpg(imageBuffer); }
    catch { image = await pdfDoc.embedPng(imageBuffer); }
  }

  const page = pdfDoc.addPage([A5_W, A5_H]);
  const { width: pw, height: ph } = page.getSize();

  page.drawText(title, {
    x: 14, y: ph - 24, size: 9, font: titleFont, color: rgb(0.09, 0.16, 0.3)
  });
  page.drawRectangle({
    x: 14, y: ph - 30, width: pw - 28, height: 1.5, color: rgb(0.39, 0.4, 0.95)
  });

  const maxWidth = pw - 28;
  const maxHeight = ph - 50;
  const imgRatio = image.width / image.height;
  const boxRatio = maxWidth / maxHeight;
  const drawWidth = imgRatio > boxRatio ? maxWidth : maxHeight * imgRatio;
  const drawHeight = imgRatio > boxRatio ? maxWidth / imgRatio : maxHeight;

  page.drawImage(image, {
    x: (pw - drawWidth) / 2,
    y: (ph - 35 - drawHeight) / 2,
    width: drawWidth,
    height: drawHeight
  });
}

module.exports = pdfService;
