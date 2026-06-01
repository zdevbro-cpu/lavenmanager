const { PDFDocument, rgb, degrees } = require('pdf-lib');
const fs = require('fs');
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
    const title = '교재구매, 회원가입 신청서(회사용)';
    const titleSize = 13;
    const titleW = font.widthOfTextAtSize(title, titleSize);
    page.drawText(title, { x: (W - titleW) / 2, y, size: titleSize, font, color: rgb(0, 0, 0) });
    y -= 18;

    const ROW = 15;
    const LBL_BG = rgb(0.92, 0.93, 0.96);
    const HL_BG = rgb(0.88, 0.91, 0.96);
    const BD = rgb(0.15, 0.18, 0.22);
    const TXT = rgb(0, 0, 0);
    const SUB = rgb(0.1, 0.1, 0.1);
    const RED = rgb(0.55, 0.05, 0.05);

    const cell = (x, top, w, h, opts = {}) => {
      page.drawRectangle({
        x, y: top - h, width: w, height: h,
        color: opts.bg || rgb(1, 1, 1),
        borderColor: BD, borderWidth: 0.9
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

    // ─── 1. 기본 정보 (구매자성명/자녀성명, 전화번호/자녀생년월일, 배송지) ──
    const halfW = CW / 2;
    const lblW = 60;
    // 행 1: 구매자성명 | 자녀성명
    cell(ML, y, lblW, ROW, { bg: LBL_BG }); text('구매자성명', ML + 4, y);
    cell(ML + lblW, y, halfW - lblW, ROW); text(data.buyerName, ML + lblW + 4, y);
    cell(ML + halfW, y, lblW, ROW, { bg: LBL_BG }); text('자녀성명', ML + halfW + 4, y);
    cell(ML + halfW + lblW, y, halfW - lblW, ROW); text(data.childInfo, ML + halfW + lblW + 4, y);
    y -= ROW;
    // 행 2: 전화번호 | 자녀생년월일
    cell(ML, y, lblW, ROW, { bg: LBL_BG }); text('전화번호', ML + 4, y);
    cell(ML + lblW, y, halfW - lblW, ROW); text(data.phoneNumber, ML + lblW + 4, y);
    cell(ML + halfW, y, lblW, ROW, { bg: LBL_BG }); text('자녀생년월일', ML + halfW + 4, y);
    cell(ML + halfW + lblW, y, halfW - lblW, ROW); text(data.childBirthdate, ML + halfW + lblW + 4, y);
    y -= ROW;
    // 행 3: 배 송 지 (full width)
    cell(ML, y, lblW, ROW, { bg: LBL_BG }); text('배 송 지', ML + 4, y);
    cell(ML + lblW, y, CW - lblW, ROW); text(data.address, ML + lblW + 4, y);
    y -= ROW + 4;

    // ─── 2. 상품 (교재 / 구독회원 / 관리회원) ─────────────────
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
      cell(x, y, wonW, ROW); text('원', x + 4, y, { size: 7.5, color: SUB });
      y -= ROW;
    };

    productRow('교재구입', '교재명 1', data.book1Name, data.book1Price, true);
    productRow('', '교재명 2', data.book2Name, data.book2Price, false);
    productRow('구독회원', '상품구분', data.subscriptionType, data.subscriptionPrice, true);
    productRow('관리회원', '상품구분', data.managementType, data.managementPrice, true);
    y -= 4;

    // ─── 3. 입금계좌 안내 (강조 박스) ────────────────────────
    cell(ML, y, CW, ROW, { bg: HL_BG });
    const acctText = '입금계좌 : 기업은행 327-067663-04-037 에이멘에이(주)';
    const acctW = font.widthOfTextAtSize(acctText, 8.5);
    page.drawText(acctText, { x: (W - acctW) / 2, y: y - 10, size: 8.5, font, color: rgb(0.15, 0.25, 0.5) });
    y -= ROW + 4;

    // ─── 4. 결제 구분 (현금 / 카드 / 합계 3열) ────────────────
    // [결제구분(60) | 현금라벨(40) | 현금값(flex) | 카드라벨(40) | 카드값(flex) | 합계라벨(40) | 합계값(flex)]
    const pCatW = 60, pLblW = 40;
    const pValW = (CW - pCatW - pLblW * 3) / 3;
    const cashNum = Number(String(data.cashPayment || '').replace(/[^0-9]/g, '')) || 0;
    const cardNum = Number(String(data.cardPayment || '').replace(/[^0-9]/g, '')) || 0;
    const totalPay = cashNum + cardNum;
    cell(ML, y, pCatW, ROW, { bg: LBL_BG }); text('결제구분', ML + 4, y);
    cell(ML + pCatW, y, pLblW, ROW, { bg: LBL_BG }); text('현 금', ML + pCatW + 4, y);
    cell(ML + pCatW + pLblW, y, pValW, ROW); text(cashNum ? formatNum(cashNum) : '', ML + pCatW + pLblW + pValW - 4, y, { align: 'right' });
    cell(ML + pCatW + pLblW + pValW, y, pLblW, ROW, { bg: LBL_BG }); text('카 드', ML + pCatW + pLblW + pValW + 4, y);
    cell(ML + pCatW + pLblW * 2 + pValW, y, pValW, ROW); text(cardNum ? formatNum(cardNum) : '', ML + pCatW + pLblW * 2 + pValW * 2 - 4, y, { align: 'right' });
    cell(ML + pCatW + pLblW * 2 + pValW * 2, y, pLblW, ROW, { bg: LBL_BG }); text('합 계', ML + pCatW + pLblW * 2 + pValW * 2 + 4, y);
    cell(ML + pCatW + pLblW * 3 + pValW * 2, y, pValW, ROW); text(totalPay ? formatNum(totalPay) : '', MR - 4, y, { align: 'right' });
    y -= ROW;

    // 현금영수증 증빙번호 (full width, with 필수 첨부 안내)
    const cashRcptLblW = 100;
    const cashWarningW = 130;
    const cashValW = CW - cashRcptLblW - cashWarningW;
    cell(ML, y, cashRcptLblW, ROW, { bg: LBL_BG }); text('현금영수증 증빙번호', ML + 4, y);
    cell(ML + cashRcptLblW, y, cashValW, ROW); text(data.cashReceiptNo, ML + cashRcptLblW + 4, y);
    cell(ML + cashRcptLblW + cashValW, y, cashWarningW, ROW);
    text('※ 현금 영수증 필수 첨부', MR - 4, y, { align: 'right', size: 7.5, color: RED });
    y -= ROW + 4;

    // ─── 5. 카드결제정보 박스 ─────────────────────────────────
    const cardsArr = Array.isArray(receiptOcrData?.card)
      ? receiptOcrData.card.filter(Boolean)
      : (receiptOcrData?.card ? [receiptOcrData.card] : []);

    // "카드결제" 좌측 라벨이 박스 전체를 세로로 묶는 형태로 그리기
    const cardLblColW = 50;
    const cardContentW = CW - cardLblColW;
    // 헤더 행: 카드사 | 카드금액 | 승인번호 | 비고
    const headerH = ROW;
    const dataRows = cardsArr.length > 0 ? cardsArr : [{}];
    const cardBoxH = headerH + ROW * dataRows.length;
    // 좌측 "카드결제" 셀 (세로 병합)
    cell(ML, y, cardLblColW, cardBoxH, { bg: LBL_BG });
    text('카드결제', ML + 4, y - cardBoxH / 2 + 5);
    // 헤더 셀들
    const cardCols = [
      cardContentW * 0.27,
      cardContentW * 0.23,
      cardContentW * 0.25,
      cardContentW * 0.25
    ];
    let cx = ML + cardLblColW;
    ['카드사', '카드금액', '승인번호', '비고'].forEach((h, i) => {
      cell(cx, y, cardCols[i], headerH, { bg: LBL_BG });
      text(h, cx + cardCols[i] / 2, y, { align: 'center', size: 7.5 });
      cx += cardCols[i];
    });
    y -= headerH;
    // 데이터 행들
    for (const c of dataRows) {
      cx = ML + cardLblColW;
      const vals = [c.issuer || '', formatNum(c.amount), c.approvalNo || '', ''];
      vals.forEach((v, i) => {
        cell(cx, y, cardCols[i], ROW);
        text(v, cx + 4, y);
        cx += cardCols[i];
      });
      y -= ROW;
    }

    // 카드합계 + 필수 첨부 안내
    const cardSumLblW = 60;
    const cardSumWarnW = 130;
    const cardSumValW = CW - cardSumLblW - cardSumWarnW;
    cell(ML, y, cardSumLblW, ROW, { bg: LBL_BG }); text('카드합계', ML + 4, y);
    cell(ML + cardSumLblW, y, cardSumValW, ROW); text(cardNum ? formatNum(cardNum) + ' 원' : '', ML + cardSumLblW + cardSumValW - 4, y, { align: 'right' });
    cell(ML + cardSumLblW + cardSumValW, y, cardSumWarnW, ROW);
    text('※ 카드 영수증 필수 첨부', MR - 4, y, { align: 'right', size: 7.5, color: RED });
    y -= ROW;

    // 판매자 소속 및 성명 | H.P
    const sellerLblW = 100;
    const hpLblW = 30;
    const hpValW = 100;
    const sellerValW = CW - sellerLblW - hpLblW - hpValW;
    cell(ML, y, sellerLblW, ROW, { bg: LBL_BG }); text('판매자 소속 및 성명', ML + 4, y);
    cell(ML + sellerLblW, y, sellerValW, ROW); text(data.sellerName, ML + sellerLblW + 4, y);
    cell(ML + sellerLblW + sellerValW, y, hpLblW, ROW, { bg: LBL_BG }); text('H . P', ML + sellerLblW + sellerValW + 4, y, { size: 7.5 });
    cell(ML + sellerLblW + sellerValW + hpLblW, y, hpValW, ROW); text(data.sellerPhone, ML + sellerLblW + sellerValW + hpLblW + 4, y);
    y -= ROW + 6;

    // ─── 6. 개인 정보 수집·이용 동의서 ────────────────────────
    const CX = W / 2;
    text('개인 정보 수집·이용 동의서', CX, y, { size: 8.5, align: 'center' });
    y -= 12;
    text('교재구입 및 구독회원, 관리회원의 개인정보 수집 및 이용 목적은 다음과 같습니다.', CX, y, { size: 7, color: SUB, align: 'center' });
    y -= 10;
    text('내용을 자세히 읽어 보신 후 동의 여부를 결정하여 주시기 바랍니다.', CX, y, { size: 7, color: SUB, align: 'center' });
    y -= 13;

    // 2행 표
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
    ['회원식별 및 서비스제공', '이름, 연락처', '수집일로부터 1년'].forEach((v, i) => {
      cell(hx, y, cWs[i], ROW);
      text(v, hx + cWs[i] / 2, y, { align: 'center', size: 7.5 });
      hx += cWs[i];
    });
    y -= ROW + 2;

    text('※ 개인정보 수집·이용을 거부할 권리가 있습니다. 단, 거부 시 서비스가 제한 될 수 있습니다.', CX, y, { size: 6.8, color: SUB, align: 'center' });
    y -= 11;

    // YES/NO 체크박스
    const yesNoY = y;
    const yesNoCx = CX - 60;
    text('위 개인 정보 수집·이용에 동의합니다.', yesNoCx, yesNoY, { size: 8 });
    const yesBoxX = yesNoCx + 175;
    text('YES', yesBoxX, yesNoY, { size: 8 });
    page.drawRectangle({ x: yesBoxX + 22, y: yesNoY - 9, width: 8, height: 8, borderColor: BD, borderWidth: 1 });
    if (data.privacyConsent) text('V', yesBoxX + 23.5, yesNoY, { size: 7 });
    const noBoxX = yesBoxX + 42;
    text('NO', noBoxX, yesNoY, { size: 8 });
    page.drawRectangle({ x: noBoxX + 18, y: yesNoY - 9, width: 8, height: 8, borderColor: BD, borderWidth: 1 });
    if (!data.privacyConsent) text('V', noBoxX + 19.5, yesNoY, { size: 7 });
    y -= 16;

    // ─── 7. 구매철회 / 해지 / 환불 안내 (모두 중앙 정렬) ───────
    text('구매철회 / 해지 / 환불', CX, y, { size: 8.5, align: 'center' });
    y -= 12;
    text('1.  구매철회 : 제품 구입 신청 후 배송이전 철회 가능.', CX, y, { size: 7.5, align: 'center' });
    y -= 10;
    text('2.  구매해지 : 물품인도일로 7일이내 미개봉 시 해지가능 (개통 후 단순 변심일 경우 해지 불가함)', CX, y, { size: 7.5, align: 'center' });
    y -= 10;
    text('3.  환      불 : 철회/해지 접수 후 14일이내 반환', CX, y, { size: 7.5, align: 'center' });
    y -= 16;

    // ─── 8. 신청 일자 (가운데) + 신청인 서명 (날짜 아래 가운데) ───
    let yy = '', mm = '', dd = '';
    if (data.applyDate) {
      const dm = String(data.applyDate).match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
      if (dm) { yy = dm[1].slice(2); mm = dm[2]; dd = dm[3]; }
    }
    // 날짜 (가운데)
    const dateText = `20  ${yy ? yy : '   '}  년    ${mm ? mm : '   '}   월    ${dd ? dd : '   '}   일`;
    text(dateText, CX, y, { size: 10, align: 'center' });
    y -= 22;

    // 신청인 [이름]            서명 ( [서명박스] )
    const sigBoxW = 110;
    const sigBoxH = 28;
    const labelApplicantW = 36;   // "신청인"
    const nameW = 90;             // 이름 표시 영역
    const gapMid = 32;            // 이름 ~ "서명" 사이 간격
    const labelSignW = 28;        // "서명"
    const parenLW = 6;            // "("
    const parenRW = 6;            // ")"
    const sigGroupTotalW = labelApplicantW + nameW + gapMid + labelSignW + parenLW + sigBoxW + parenRW;
    const sigGroupStartX = CX - sigGroupTotalW / 2;

    // 박스 위치 (서명 박스만 외곽선 그림)
    const sigBoxX = sigGroupStartX + labelApplicantW + nameW + gapMid + labelSignW + parenLW;
    cell(sigBoxX, y - (sigBoxH - 28) / 2, sigBoxW, sigBoxH);

    // 텍스트는 박스 수직 중앙선과 정렬
    const labelTop = y - (sigBoxH / 2) + 5;

    // "신청인"
    text('신청인', sigGroupStartX, labelTop, { size: 9 });
    // 구매자 이름
    text(data.buyerName || '', sigGroupStartX + labelApplicantW + 4, labelTop, { size: 10 });
    // "서명"
    const signLabelX = sigGroupStartX + labelApplicantW + nameW + gapMid;
    text('서명', signLabelX, labelTop, { size: 9 });
    // "(" 와 ")"
    text('(', signLabelX + labelSignW, labelTop, { size: 11 });
    text(')', sigBoxX + sigBoxW + 1, labelTop, { size: 11 });

    // 서명 이미지
    if (signatureBase64) {
      try {
        const clean = signatureBase64.replace(/^data:image\/png;base64,/, '');
        const sigImg = await pdfDoc.embedPng(Buffer.from(clean, 'base64'));
        page.drawImage(sigImg, {
          x: sigBoxX + 4,
          y: y - sigBoxH + 2,
          width: sigBoxW - 8,
          height: sigBoxH - 4
        });
      } catch (e) {
        console.error('서명 임베딩 오류:', e.message);
      }
    }
    y -= sigBoxH + 10;

    // ─── 9. 회사 정보 푸터 (가운데 정렬) ───────────────────────
    text('에이멘에이 주식회사', CX, y, { size: 12, align: 'center' });
    y -= 12;
    text('lasbookservice@gmail.com', CX, y, { size: 7.5, color: SUB, align: 'center' });
    y -= 12;
    text('* 신청서는 당일 사진을 찍어 010-8290-4749, 문자로 제출해 주세요.', CX, y, { size: 7.5, color: SUB, align: 'center' });

    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
  },

  // 통합 PDF: 1쪽 A4 가로(신청서 + 영수증 2x2), 2쪽 A4 세로(라벤 구독회원 약정서 자동 채움)
  // 2x2 슬롯 배치 (좌측: 수기신청서/현금, 우측 컬럼: 카드 영수증)
  //   TL = 수기 신청서   TR = 카드 영수증 #1
  //   BL = 현금/카드#3    BR = 카드 영수증 #2
  // 수기신청서 없을 시 좌측은 [카드1, 카드2] 폴백, 우측은 [카드3, 현금] 폴백
  buildBundledPdf: async (applicationPdfBuffer, photoBuffer = null, cardReceiptBuffers = null, cashReceiptBuffer = null, formData = null, receiptOcrData = null) => {
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
      thickness: 1,
      color: rgb(0.15, 0.18, 0.22)
    });

    // ── 우측: 4슬롯 2x2 — 카드는 우측 컬럼, 수기/현금은 좌측 컬럼 ──
    // 슬롯 순서: [TL, TR, BL, BR]
    const cardArr = Array.isArray(cardReceiptBuffers) ? cardReceiptBuffers.filter(Boolean) : [];
    let slots;
    if (photoBuffer) {
      // 수기신청서 있음: TL=수기, TR=카드1, BL=현금(또는 카드3), BR=카드2
      const blBuf = cashReceiptBuffer || cardArr[2] || null;
      const blLabel = cashReceiptBuffer ? '현금 영수증' : (cardArr[2] ? '카드 영수증 #3' : '현금 영수증');
      slots = [
        { label: '수기 신청서',    buf: photoBuffer },
        { label: '카드 영수증 #1', buf: cardArr[0] || null },
        { label: blLabel,          buf: blBuf },
        { label: '카드 영수증 #2', buf: cardArr[1] || null }
      ];
    } else {
      // 수기신청서 없음: TL=현금, TR=카드1, BL=카드3(없으면 빈칸), BR=카드2
      slots = [
        { label: '현금 영수증',    buf: cashReceiptBuffer || null },
        { label: '카드 영수증 #1', buf: cardArr[0] || null },
        { label: '카드 영수증 #3', buf: cardArr[2] || null },
        { label: '카드 영수증 #2', buf: cardArr[1] || null }
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
      page.drawRectangle({ x, y: y + cellH - cellLabelH, width: cellW, height: cellLabelH, color: rgb(0.94, 0.95, 0.97), borderColor: rgb(0.15, 0.18, 0.22), borderWidth: 1 });
      page.drawText(slot.label, { x: x + 5, y: y + cellH - cellLabelH + 4, size: 8, font: titleFont, color: rgb(0.1, 0.15, 0.3) });

      // 이미지 영역
      const imgY = y;
      const imgH = cellH - cellLabelH;
      page.drawRectangle({ x, y: imgY, width: cellW, height: imgH, borderColor: rgb(0.15, 0.18, 0.22), borderWidth: 1 });

      if (slot.buf) {
        const img = await embedAuto(finalDoc, slot.buf);
        drawImageFitted(page, img, x + 2, imgY + 2, cellW - 4, imgH - 4); // 90° CW 회전 적용됨
      } else {
        page.drawText('(미첨부)', { x: x + cellW / 2 - 18, y: imgY + imgH / 2 - 4, size: 9, font: titleFont, color: rgb(0.65, 0.65, 0.7) });
      }
    }

    // ── 2쪽: 라벤 구독회원 약정서 — 구독회원 상품 입력된 경우에만 첨부 ──
    const hasSubscription = !!(formData && String(formData.subscriptionType || '').trim());
    if (hasSubscription) {
      await appendAgreementPage(finalDoc, formData, receiptOcrData, titleFont);
    } else {
      console.log('ℹ️ 구독회원 상품구분 미입력 — 라벤 구독회원 약정서 페이지 생략');
    }

    const bytes = await finalDoc.save();
    return Buffer.from(bytes);
  }
};

// 라벤 구독회원 약정서 페이지 추가 — pdf-lib로 직접 작성, 데이터 채움, 무채색
async function appendAgreementPage(finalDoc, formData, receiptOcrData, font) {
  const data = formData || {};
  const card = (receiptOcrData?.card && receiptOcrData.card[0]) || {};

  // 데이터 파싱
  const ctx = `${data.subscriptionType || ''} ${data.book1Name || ''} ${data.book2Name || ''}`;
  const isSubscription = /구독/.test(ctx);
  const isManagement = /관리/.test(ctx);
  const isKorean = /한글/.test(ctx);
  const isEnglish = /영문|영어/.test(ctx);
  const level = ['K2', 'K5', 'S2', 'G1'].find(l => ctx.includes(l)) || '';
  const annualFee = data.subscriptionPrice || data.book1Price || '';
  let yy = '', mm = '', dd = '';
  if (data.applyDate) {
    const m = String(data.applyDate).match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m) { yy = m[1].slice(2); mm = m[2]; dd = m[3]; }
  }

  // A4 portrait 새 페이지
  const page = finalDoc.addPage([A4_W, A4_H]);
  const W = A4_W, H = A4_H;
  const ML = 60, MR = W - 60;
  const BLACK = rgb(0, 0, 0);

  // 공통 텍스트 그리기 헬퍼
  const t = (str, x, y, opts = {}) => {
    if (str === undefined || str === null || str === '') return 0;
    const size = opts.size || 10;
    const txt = String(str);
    const w = font.widthOfTextAtSize(txt, size);
    const tx = opts.align === 'right' ? x - w : opts.align === 'center' ? x - w / 2 : x;
    page.drawText(txt, { x: tx, y, size, font, color: BLACK });
    return w;
  };
  // V 체크 마크
  const v = (checked, x, y) => { if (checked) t('V', x + 1, y, { size: 9 }); };
  // 밑줄 (입력 빈칸 + 데이터 동시 표현) — 베이스라인보다 더 아래에 그려 데이터가 밑줄 위로 명확히 떠 보이게
  const underline = (x, y, length) => {
    page.drawLine({ start: { x, y: y - 4 }, end: { x: x + length, y: y - 4 }, thickness: 1, color: BLACK });
  };
  // 채워지는 데이터 텍스트 — 라벨 기준선보다 약간 위로 올려 그림
  const fillT = (str, x, y, opts = {}) => t(str, x, y + 2, opts);

  // ── 상단 우측 (은행 정보) ──
  let y = H - 60;
  t('IBK기업은행',          MR, y,      { align: 'right', size: 11 }); y -= 14;
  t('에이멘비 주식회사',    MR, y,      { align: 'right', size: 11 }); y -= 14;
  t('327-068842-04-056',    MR, y,      { align: 'right', size: 11 });

  // ── 타이틀 ──
  y = H - 145;
  const title = '라벤 구독 회원 약정서';
  const titleSize = 15;
  const titleW = font.widthOfTextAtSize(title, titleSize);
  t(title, W / 2, y, { align: 'center', size: titleSize });
  // 밑줄
  page.drawLine({ start: { x: (W - titleW) / 2, y: y - 2 }, end: { x: (W + titleW) / 2, y: y - 2 }, thickness: 1.2, color: BLACK });

  // ── 본문 개요 ──
  y -= 50;
  const p1a = 'AmenA 주식회사 (이하 "갑"이라 칭함)와 ';
  const p1aW = t(p1a, ML, y, { size: 10.5 });
  // 을 이름 빈칸
  const blankW = 120;
  underline(ML + p1aW, y, blankW);
  fillT(data.buyerName, ML + p1aW + blankW / 2, y, { align: 'center', size: 11.5 });
  t(' (이하 "을"이라 칭함)은(는)', ML + p1aW + blankW, y, { size: 10.5 });
  y -= 18;
  t('다음 아래의 내용으로 라벤 구독 회원 약정서를 체결한다.', ML, y, { size: 10.5 });

  // ── 제 1 조 ──
  y -= 36;
  t('제 1 조 (가입할 라벤 회원)', ML, y, { size: 11 });
  y -= 18;
  t('"을"이 가입한 한글 또는 영문 버전 K2, K5, S2, G1 연회원 구분은 아래와 같다.', ML, y, { size: 10 });

  const IND = ML + 24;
  y -= 22;
  // (1) 구분
  t('(1) 구분 : 구독 회원 (', IND, y, { size: 10 });
  v(isSubscription, IND + 115, y);
  t('),  관리 회원 (', IND + 130, y, { size: 10 });
  v(isManagement, IND + 207, y);
  t(')', IND + 222, y, { size: 10 });

  y -= 20;
  // (2) 버전
  t('(2) 버전 : 영문 (', IND, y, { size: 10 });
  v(isEnglish, IND + 92, y);
  t('),  한글 (', IND + 107, y, { size: 10 });
  v(isKorean, IND + 162, y);
  t(')', IND + 177, y, { size: 10 });

  y -= 20;
  // (3) 가입 레벨
  t('(3) 가입 레벨 : K2 (', IND, y, { size: 10 });
  v(level === 'K2', IND + 113, y);
  t('),  K5 (', IND + 128, y, { size: 10 });
  v(level === 'K5', IND + 173, y);
  t('),  S2 (', IND + 188, y, { size: 10 });
  v(level === 'S2', IND + 233, y);
  t('),  G1 (', IND + 248, y, { size: 10 });
  v(level === 'G1', IND + 293, y);
  t(')', IND + 308, y, { size: 10 });

  y -= 20;
  // (4) 가입 연회비
  const feeLblW = t('(4) 가입 연회비 :', IND, y, { size: 10 });
  underline(IND + feeLblW + 6, y, 110);
  fillT(formatNum(annualFee), IND + feeLblW + 6 + 110 / 2, y, { align: 'center', size: 11.5 });
  t('원', IND + feeLblW + 6 + 115, y, { size: 10 });

  y -= 22;
  // 납입 계좌 체크박스
  page.drawRectangle({ x: IND, y: y - 1, width: 9, height: 9, borderColor: BLACK, borderWidth: 1.2 });
  t('납입 계좌 : 우리은행 1005-004-584605 에이멘에이 (주)', IND + 14, y, { size: 10 });

  y -= 22;
  // 카드 정보 체크박스
  const hasCard = !!(card.issuer || card.cardNumber || card.approvalNo);
  page.drawRectangle({ x: IND, y: y - 1, width: 9, height: 9, borderColor: BLACK, borderWidth: 1.2 });
  if (hasCard) t('V', IND + 1.5, y, { size: 9 });
  t('카드 정보 :', IND + 14, y, { size: 10 });
  // 카드명
  t('카드명', IND + 70, y, { size: 9.5 });
  underline(IND + 100, y, 90);
  fillT(card.issuer || '', IND + 100 + 45, y, { align: 'center', size: 10.5 });
  // 카드번호
  t('카드번호', IND + 200, y, { size: 9.5 });
  underline(IND + 238, y, 110);
  fillT(card.cardNumber || '', IND + 238 + 55, y, { align: 'center', size: 10 });
  // 승인번호
  t('승인번호', IND + 358, y, { size: 9.5 });
  underline(IND + 396, y, 75);
  fillT(card.approvalNo || '', IND + 396 + 37, y, { align: 'center', size: 10.5 });

  // ── 제 2 조 ──
  y -= 38;
  t('제 2 조 (교재 공급 일정과 구독번호 부여)', ML, y, { size: 11 });
  y -= 18;
  t('"갑"은 연회원 "을"에게 아래와 같이 교재 등을 공급하고 고유 회원번호를 부여한다.', ML, y, { size: 10 });
  y -= 18;
  t('(1) 회비를 납입하면 15일 이내에 1개월 단위로 교재와 월평가지를 배송한다.', IND, y, { size: 10 });
  y -= 16;
  t('(2) 구독 회원에게는 고유 회원번호를 부여하고 독서경진대회 참가 자격을 준다.', IND, y, { size: 10 });

  // ── 마무리 문구 + 날짜 ──
  y -= 34;
  t('위와 같은 내용으로 "갑"과 "을"은 라벤 구독 회원 약정서를 작성하고 1부씩 보관한다.', ML, y, { size: 10 });

  y -= 36;
  // 날짜 (우측 정렬)
  const dateLine = (yy && mm && dd)
    ? `20${yy} 년  ${mm} 월  ${dd} 일`
    : '20      년          월          일';
  t(dateLine, MR, y, { align: 'right', size: 11 });

  // ── "갑" 정보 ──
  y -= 34;
  t('"갑"', ML, y, { size: 11 });
  y -= 16;
  t('에이멘에이 주식회사(법인등록번호 110111-8788709)   대표이사  이 예 현   (인장)', ML, y, { size: 10 });
  y -= 16;
  const sellerLblW = t('구독 회원 모집 담당자 직급(표시)과 성명', ML, y, { size: 10 });
  underline(ML + sellerLblW + 6, y, 140);
  fillT(data.sellerName || '', ML + sellerLblW + 6 + 70, y, { align: 'center', size: 11 });
  t('(서명)', ML + sellerLblW + 6 + 145, y, { size: 10 });
  y -= 16;
  t('법인 주소지 : 서울시 서초구 효령로 204 (서초동, 오늘앤빌딩)', ML, y, { size: 10 });

  // ── "을" 정보 ──
  y -= 28;
  t('"을"', ML, y, { size: 11 });

  y -= 20;
  // 성명, 생년월일 한 줄
  const nameLblW = t('성명 :', ML, y, { size: 10 });
  underline(ML + nameLblW + 6, y, 100);
  fillT(data.buyerName || '', ML + nameLblW + 6 + 50, y, { align: 'center', size: 11 });
  t('(인)', ML + nameLblW + 6 + 105, y, { size: 9.5 });

  const birthLblX = ML + 250;
  const birthLblW = t('생년월일 :', birthLblX, y, { size: 10 });
  underline(birthLblX + birthLblW + 6, y, 130);

  y -= 20;
  // 주소지
  const addrLblW = t('주소지 :', ML, y, { size: 10 });
  underline(ML + addrLblW + 6, y, MR - ML - addrLblW - 6);
  fillT(data.address || '', ML + addrLblW + 10, y, { size: 10.5 });

  y -= 20;
  // 전화번호
  const phoneLblW = t('전화번호 :', ML, y, { size: 10 });
  underline(ML + phoneLblW + 6, y, MR - ML - phoneLblW - 6);
  fillT(data.phoneNumber || '', ML + phoneLblW + 10, y, { size: 11 });

  y -= 20;
  // 이메일
  const emailLblW = t('이메일 :', ML, y, { size: 10 });
  underline(ML + emailLblW + 6, y, MR - ML - emailLblW - 6);
}

// 플랫폼별 한글 TTF 폰트 자동 탐색 후 pdf-lib에 임베드
async function loadKoreanFont(pdfDoc) {
  const candidates = [
    'C:\\Windows\\Fonts\\malgunbd.ttf',                              // Windows 굵은체 (가독성 우선 — 굵은체로 인쇄 진하게)
    'C:\\Windows\\Fonts\\malgun.ttf',                                // Windows 일반체
    '/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf',           // Debian 굵은체
    '/usr/share/fonts/truetype/nanum/NanumGothic.ttf',               // Debian 일반체
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
