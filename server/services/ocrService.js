const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');

let geminiModel = null;
const apiKey = process.env.GEMINI_API_KEY;

if (apiKey) {
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    geminiModel = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    console.log("👁️ Google Gemini 2.5 Flash 멀티모달 OCR 클라이언트가 활성화되었습니다.");
  } catch (error) {
    console.error("❌ Gemini API 초기화 실패:", error.message);
  }
} else {
  console.warn("⚠️ [GEMINI_API_KEY] 환경 변수가 없어 모의(Mock) OCR 데이터 모드로 가동합니다.");
}

const ocrService = {
  analyzeImage: async (imageBuffer, type = 'application') => {
    // 1. Google Gemini 2.5 Flash 멀티모달 비주얼 OCR 가동
    if (geminiModel && imageBuffer) {
      try {
        console.log(`🤖 Gemini 2.5 Flash 모델로 이미지 분석을 시작합니다. (Type: ${type})`);
        const base64Image = imageBuffer.toString('base64');
        
        let prompt = '';
        if (type === 'sales') {
          // las-mgmt 프로젝트의 고밀도 카드 영수증 OCR 프롬프트 이식
          prompt = `
            아래는 한국 신용카드 결제 영수증 이미지입니다. 다음 7가지 핵심 항목을 정확히 찾아서 JSON으로만 응답해줘. 설명이나 주석 없이 오직 JSON만 출력해.

            1. amount: 결제금액 (숫자만, 콤마 제외. 예: "1600000")
            2. issuer: 카드사명 (영수증에 적힌 카드 브랜드명. 예: "KB국민카드", "신한카드", "현대카드", "삼성카드")
            3. approvalNo: 승인번호 (영수증에 적힌 8자리 전후의 숫자. 예: "30014532")
            4. terminalNo: 단말기번호 (영수증의 "단말기번호", "TID", 혹은 "CATID" 항목 옆의 숫자)
            5. serialNo: 일련번호 (영수증의 "일련번호", "S/N" 항목 옆의 숫자)
            6. cardNumber: 카드번호 (필수 추출 필드 - "카드번호", "NO.", "번호" 옆에 위치. 1234-****-****-5678 처럼 마스킹된 부분까지 영수증에 보이는 그대로 텍스트 전체를 정확히 추출)
            7. transactionDate: 결제 일자 (영수증의 "거래일시", "결제일시", "승인일자" 등 옆 날짜. YYYY-MM-DD 형식으로 변환. 예: "2026/05/24 15:30" → "2026-05-24". 시간은 제외하고 날짜만)

            항목을 찾을 수 없는 경우 빈 문자열("")로 응답해.
            출력 예시: {"amount":"1600000","issuer":"KB국민카드","approvalNo":"30014532","terminalNo":"3295581001","serialNo":"0558","cardNumber":"5570-42**-****-7047","transactionDate":"2026-05-24"}
          `;
        } else if (type === 'cash_receipt') {
          // 한국 현금영수증 OCR 프롬프트
          prompt = `
            아래는 한국 현금영수증 이미지입니다. 다음 7가지 핵심 항목을 정확히 찾아서 JSON으로만 응답해줘. 설명이나 주석 없이 오직 JSON만 출력해.

            1. amount: 거래금액 (숫자만, 콤마 제외. 예: "1600000")
            2. approvalNo: 승인번호 (영수증의 "승인번호" 옆 숫자)
            3. transactionDate: 거래일시 (예: "2026-05-24 15:30:00" 형식. 영수증의 "거래일시", "발급일자" 등 옆 날짜/시각을 그대로 결합)
            4. identifierType: 인증수단 (예: "휴대폰", "사업자번호", "현금영수증카드" 중 하나)
            5. identifierNo: 인증번호 (현금영수증 발급용 식별번호. 휴대폰번호 "010-XXXX-XXXX" 또는 사업자번호 "XXX-XX-XXXXX" 형식 그대로)
            6. merchantName: 가맹점명 (영수증 상단의 상호/가맹점명)
            7. merchantBizNo: 가맹점 사업자번호 (예: "123-45-67890" 형식)

            항목을 찾을 수 없는 경우 빈 문자열("")로 응답해.
            출력 예시: {"amount":"1600000","approvalNo":"30014532","transactionDate":"2026-05-24 15:30:00","identifierType":"휴대폰","identifierNo":"010-5227-9774","merchantName":"에이멘에이","merchantBizNo":"123-45-67890"}
          `;
        } else {
          // 기존 에이멘에이 수기 신청서 OCR 프롬프트
          prompt = `
            아래는 한국 에이멘에이 주식회의 "교재구매, 회원가입 신청서(회사용)" 실물 이미지입니다.
            이 신청서 사진에서 다음의 17가지 필수 필드 정보를 정확히 식별하고 한글/숫자 맥락을 해석하여 JSON 형식으로만 응답해줘.
            설명이나 주석 없이 반드시 오직 순수한 JSON 블록만 출력해줘.
            
            금액 정보는 콤마(,)와 "원" 등의 기호를 모두 제외한 순수 숫자 문자열(예: "1600000")로 변환해줘.
            정보를 절대로 찾을 수 없거나 누락된 항목은 빈 문자열("")로 채워줘.

            [추출 및 정제 필드 리스트]:
            1. buyerName: 구매자 성명 (예: "곽두찬" 또는 "박두찬" 등 신청인/구매자 이름. "신청인 [이름]" 란 또는 구매자성명 칸 기재된 이름 최우선 추출)
            2. childInfo: 자녀 성명만 (예: "박동호" 이름 부분만, 괄호·연령 제외)
            2b. childBirthdate: 자녀 생년월일 (YYYY-MM-DD 포맷, 예: "2017-04-15". 신청서에 연령만 있고 생년월일 정보가 없으면 빈 문자열 "")
            3. phoneNumber: 전화번호 (예: 쪼개진 국번 "0105227" 과 "9774" 등을 정확히 결합해 "010-5227-9774" 형태로 정제)
            4. address: 배송지 주소 (예: "서울특별시 서초구 효령로 204" 형태로 앞뒤의 "배송메모"나 "구매자명" 등의 노이즈 글자를 완벽히 제외한 온전한 주소 정보만 추출)
            5. deliveryMemo: 배송메모 (예: "문 앞 보관", "경비실 위탁" 등)
            6. book1Name: 교재구입 교재명 1 (예: "K2", "LAS..." 등 교재구입란에 적힌 첫 번째 도서 모델명)
            7. book1Price: 교재 1 금액 (예: "1600000" 등 숫자만)
            8. book2Name: 교재구입 교재명 2
            9. book2Price: 교재 2 금액
            10. subscriptionType: 구독회원 상품구분 (신청서의 "구독회원" 행의 "상품구분" 칸에 적힌 상품명. 예: "스마트", "프리미엄", "K-PLUS" 등. 손글씨라도 보이면 그대로 추출. 칸이 비어있으면 "")
            11. subscriptionPrice: 구독 상품 금액 (구독회원 행의 "금액" 칸 숫자만. 예: "300000". 비어있으면 "")
            12. managementType: 관리회원 상품구분 (신청서의 "관리회원" 행의 "상품구분" 칸. 손글씨 그대로 추출. 비어있으면 "")
            13. managementPrice: 관리회원 금액 (관리회원 행의 "금액" 칸 숫자만. 비어있으면 "")
            14. cashPayment: 현금 결제액 (결제구분 행의 "현 금" 옆 숫자만. 비어있으면 "0")
            15. cardPayment: 카드 결제액 (결제구분 행의 "카 드" 옆 숫자만. 비어있으면 "0")
            16. cashReceiptNo: 현금영수증 증빙번호
            17. sellerName: 판매자 소속 및 성명 (예: "본사" 또는 판매자이름)
            18. sellerPhone: 판매자 연락처 (예: "010-5227-9774" 등 하단의 판매자 정보란에 적힌 전화번호)
            19. applyDate: 신청 일자 (영수증이나 신청서 하단에 인쇄된 신청 날짜. 예: "2026년 5월 22일"을 "2026-05-22" 형식의 YYYY-MM-DD 포맷으로 변환)

            [중요]: "구독회원" 과 "관리회원" 은 신청서에 별도의 두 행으로 인쇄되어 있음. 각각 별개의 "상품구분"·"금액" 칸을 가지며 손글씨로 채워질 수 있음. 한 행만 채워질 수도, 둘 다 채워질 수도, 둘 다 비어있을 수도 있음. 빈 칸은 반드시 "" 로 응답.

            [출력 예시 포맷]:
            {
              "buyerName": "곽두찬",
              "childInfo": "박동호",
              "childBirthdate": "2018-03-22",
              "phoneNumber": "010-5227-9774",
              "address": "서울특별시 서초구 효령로 204",
              "deliveryMemo": "",
              "book1Name": "K2",
              "book1Price": "1600000",
              "book2Name": "",
              "book2Price": "",
              "subscriptionType": "스마트",
              "subscriptionPrice": "300000",
              "managementType": "",
              "managementPrice": "",
              "cashPayment": "1600000",
              "cardPayment": "0",
              "cashReceiptNo": "",
              "sellerName": "본사",
              "sellerPhone": "010-5227-9774",
              "applyDate": "2026-05-22"
            }
          `;
        }

        const result = await geminiModel.generateContent([
          prompt,
          {
            inlineData: {
              data: base64Image,
              mimeType: 'image/jpeg'
            }
          }
        ]);

        const response = await result.response;
        const responseText = response.text();
        console.log(`📝 Gemini OCR [${type}] 해석 원본 텍스트:`, responseText);

        // JSON 블록 파싱 시도
        let jsonText = responseText;
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          jsonText = jsonMatch[0];
        }

        const data = JSON.parse(jsonText);
        // Gemini 응답을 그대로 반환 (mock 값으로 임의 보완하지 않음)
        return data;
      } catch (error) {
        console.error(`❌ Gemini Vision API [${type}] 호출 오류:`, error.message);
      }
    }

    // 2. Gemini 미동작/실패 시 빈 객체 반환 — 사용자가 직접 입력하도록 유도 (mock 데이터 채우지 않음)
    console.log(`ℹ️ [No-OCR Mode] Gemini API 미동작 상태로 [${type}] 빈 객체 반환합니다. 사용자가 수기 입력 필요.`);
    return {};
  }
};

module.exports = ocrService;
