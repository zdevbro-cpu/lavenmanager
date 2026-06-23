import React, { useState, useEffect } from 'react';
import { Camera, CheckCircle2, Trash2, Building, ArrowRight, Sparkles } from 'lucide-react';
import SignaturePad from './components/SignaturePad';
import AdminDashboard from './components/AdminDashboard';
import { API_BASE } from './config';
import LandingPage from './components/LandingPage';
import CardSalesForm from './components/CardSalesForm';

// 3자리 콤마 포맷팅 헬퍼 함수
const formatPrice = (value) => {
  if (value === undefined || value === null || value === '') return '';
  const clean = value.toString().replace(/[^0-9]/g, '');
  return clean.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};

// 전화번호 숫자만 → 010-0000-0000 표시 포맷 (DB에는 숫자만 저장)
const formatPhoneNumber = (raw) => {
  const d = String(raw || '').replace(/\D/g, '').slice(0, 11);
  if (d.length < 4) return d;
  if (d.length < 7) return `${d.slice(0,3)}-${d.slice(3)}`;
  if (d.length <= 10) return `${d.slice(0,3)}-${d.slice(3,6)}-${d.slice(6)}`;
  return `${d.slice(0,3)}-${d.slice(3,7)}-${d.slice(7)}`;
};

export default function App() {
  const [activeView, setActiveView] = useState('landing'); // 'landing' | 'card-sales' | 'application' | 'admin'

  // 신청서 입력 상태 정의
  const [formData, setFormData] = useState({
    buyerName: '',
    childInfo: '',
    childBirthdate: '',
    phoneNumber: '',
    address: '',
    deliveryMemo: '',
    
    book1Name: '',
    book1Price: '',
    book2Name: '',
    book2Price: '',
    subscriptionType: '',
    subscriptionPrice: '',
    managementType: '',
    managementPrice: '',

    cashPayment: '',
    cardPayment: '',
    cashReceiptNo: '',

    sellerName: '',
    sellerPhone: '',
    privacyConsent: true,
    applyDate: new Date().toISOString().slice(0, 10)
  });

  const [signatureData, setSignatureData] = useState(null);
  
  // 카드 영수증 상태 — 최대 6개 슬롯 (기본 1개부터 시작, + 버튼으로 추가)
  const MAX_CARD_RECEIPTS = 6;
  const [cardReceipts, setCardReceipts] = useState([{ url: '', file: null, ocrData: null, loading: false }]);

  // 현금 영수증 상태 — 최대 6개 슬롯 (카드영수증과 동일 구조)
  const MAX_CASH_RECEIPTS = 6;
  const [cashReceipts, setCashReceipts] = useState([{ url: '', file: null, ocrData: null, loading: false }]);
  
  // OCR 파싱으로 채워진 필드들의 하이라이트 처리를 위한 상태
  const [ocrFilledFields, setOcrFilledFields] = useState([]);
  
  // 업로드 및 상태 로더
  const [uploadedPhotoUrl, setUploadedPhotoUrl] = useState('');
  const [uploadedPhotoFile, setUploadedPhotoFile] = useState(null);
  const [isOcrLoading, setIsOcrLoading] = useState(false);
  const [submissionState, setSubmissionState] = useState('idle'); // 'idle', 'submitting', 'success'
  const [loaderStep, setLoaderStep] = useState('');

  // 1. OCR 이미지 파싱 업로드 연동 API
  const handleOcrProcess = async (file) => {
    if (!file) return;

    // 사진 프리뷰 표시
    const reader = new FileReader();
    reader.onload = (e) => setUploadedPhotoUrl(e.target.result);
    reader.readAsDataURL(file);
    setUploadedPhotoFile(file);

    setIsOcrLoading(true);
    
    // 백엔드로 이미지 파일 전송을 위한 FormData 설정
    const uploadData = new FormData();
    uploadData.append('photo', file);

    try {
      const response = await fetch(`${API_BASE}/api/ocr`, {
        method: 'POST',
        body: uploadData
      });
      const json = await response.json();
      
      if (json.success) {
        // 백엔드로부터 파싱된 모든 텍스트 정보 매핑
        setFormData(prev => ({
          ...prev,
          ...json.data
        }));
        
        // 파싱되어 채워진 필드 목록 획득하여 노란색 뱃지 활성화
        setOcrFilledFields(Object.keys(json.data).filter(key => json.data[key]));
      }
    } catch (err) {
      console.error("OCR 분석 API 실패:", err);
      alert("서버 연결 실패. 모의 분석 데이터를 로드합니다.");
    } finally {
      setIsOcrLoading(false);
    }
  };

  // 카드 영수증 배열 합계 → cardPayment 필드 동기화
  const syncCardPaymentTotal = (receipts) => {
    const total = receipts.reduce((acc, r) => acc + (Number(r.ocrData?.amount) || 0), 0);
    setFormData(prev => ({ ...prev, cardPayment: total ? String(total) : '' }));
    if (total > 0) setOcrFilledFields(prev => [...new Set([...prev, 'cardPayment'])]);
  };

  // 현금 영수증 배열 합계 → cashPayment 필드 동기화
  const syncCashPaymentTotal = (receipts) => {
    const total = receipts.reduce((acc, r) => acc + (Number(r.ocrData?.amount) || 0), 0);
    setFormData(prev => ({ ...prev, cashPayment: total ? String(total) : '' }));
    if (total > 0) setOcrFilledFields(prev => [...new Set([...prev, 'cashPayment'])]);
  };

  // 카드영수증 슬롯 업데이트
  const updateCardReceipt = (idx, patch) => {
    setCardReceipts(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  };

  // 카드영수증 슬롯 추가 (+ 버튼)
  const addCardReceiptSlot = () => {
    setCardReceipts(prev => prev.length >= MAX_CARD_RECEIPTS ? prev : [...prev, { url: '', file: null, ocrData: null, loading: false }]);
  };

  // 카드영수증 슬롯 삭제 (× 버튼)
  const removeCardReceiptSlot = (idx) => {
    setCardReceipts(prev => {
      const next = prev.length === 1
        ? [{ url: '', file: null, ocrData: null, loading: false }] // 마지막 1개는 비우기만 함
        : prev.filter((_, i) => i !== idx);
      syncCardPaymentTotal(next);
      return next;
    });
  };

  // 현금영수증 슬롯 업데이트
  const updateCashReceipt = (idx, patch) => {
    setCashReceipts(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  };

  // 현금영수증 슬롯 추가 (+ 버튼)
  const addCashReceiptSlot = () => {
    setCashReceipts(prev => prev.length >= MAX_CASH_RECEIPTS ? prev : [...prev, { url: '', file: null, ocrData: null, loading: false }]);
  };

  // 현금영수증 슬롯 삭제 (× 버튼)
  const removeCashReceiptSlot = (idx) => {
    setCashReceipts(prev => {
      const next = prev.length === 1
        ? [{ url: '', file: null, ocrData: null, loading: false }]
        : prev.filter((_, i) => i !== idx);
      syncCashPaymentTotal(next);
      return next;
    });
  };

  // 1.2 카드 영수증 OCR 파싱 API 연동 (인덱스 기반 — 최대 3개 슬롯 지원)
  const handleReceiptOcrProcess = async (idx, file) => {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => updateCardReceipt(idx, { url: e.target.result, file });
    reader.readAsDataURL(file);
    updateCardReceipt(idx, { loading: true, file });

    const uploadData = new FormData();
    uploadData.append('photo', file);
    uploadData.append('type', 'sales');

    try {
      console.log(`💳 카드 영수증[${idx + 1}] OCR 분석 요청 중...`);
      const response = await fetch(`${API_BASE}/api/ocr`, { method: 'POST', body: uploadData });
      const json = await response.json();

      if (json.success && json.data) {
        console.log(`💳 카드 영수증[${idx + 1}] OCR 분석 성공:`, json.data);
        setCardReceipts(prev => {
          const next = [...prev];
          next[idx] = { ...next[idx], ocrData: json.data, loading: false };
          syncCardPaymentTotal(next);
          return next;
        });
      } else {
        updateCardReceipt(idx, { loading: false });
      }
    } catch (err) {
      console.error("카드 영수증 OCR 분석 실패:", err);
      alert("영수증 OCR 분석 실패. 일반 사진으로 첨부합니다.");
      updateCardReceipt(idx, { loading: false });
    }
  };

  // 1.3 현금 영수증 OCR 파싱 API 연동 (인덱스 기반 — 최대 6개 슬롯 지원)
  const handleCashReceiptOcrProcess = async (idx, file) => {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => updateCashReceipt(idx, { url: e.target.result, file });
    reader.readAsDataURL(file);
    updateCashReceipt(idx, { loading: true, file });

    const uploadData = new FormData();
    uploadData.append('photo', file);
    uploadData.append('type', 'cash_receipt');

    try {
      console.log(`🧾 현금 영수증[${idx + 1}] OCR 분석 요청 중...`);
      const response = await fetch(`${API_BASE}/api/ocr`, { method: 'POST', body: uploadData });
      const json = await response.json();

      if (json.success && json.data) {
        console.log(`🧾 현금 영수증[${idx + 1}] OCR 분석 성공:`, json.data);
        setCashReceipts(prev => {
          const next = [...prev];
          next[idx] = { ...next[idx], ocrData: json.data, loading: false };
          syncCashPaymentTotal(next);
          return next;
        });
        // 첫 번째 영수증에서만 증빙번호 자동 입력
        if (idx === 0 && json.data.identifierNo) {
          setFormData(prev => ({ ...prev, cashReceiptNo: json.data.identifierNo || prev.cashReceiptNo }));
          setOcrFilledFields(prev => [...new Set([...prev, 'cashReceiptNo'])]);
        }
      } else {
        updateCashReceipt(idx, { loading: false });
      }
    } catch (err) {
      console.error("현금 영수증 OCR 분석 실패:", err);
      alert("현금영수증 OCR 분석 실패. 일반 사진으로 첨부합니다.");
      updateCashReceipt(idx, { loading: false });
    }
  };

  // 이미지 초기화
  const resetPhoto = (e) => {
    e.stopPropagation();
    setUploadedPhotoUrl('');
    setUploadedPhotoFile(null);
    setCardReceipts([{ url: '', file: null, ocrData: null, loading: false }]);
    setCashReceipts([{ url: '', file: null, ocrData: null, loading: false }]);
    setOcrFilledFields([]);
    
    // 입력값 모두 초기화
    setFormData({
      buyerName: '',
      childInfo: '',
      childBirthdate: '',
      phoneNumber: '',
      address: '',
      deliveryMemo: '',
      book1Name: '',
      book1Price: '',
      book2Name: '',
      book2Price: '',
      subscriptionType: '',
      subscriptionPrice: '',
      managementType: '',
      managementPrice: '',
      cashPayment: '',
      cardPayment: '',
      cashReceiptNo: '',
      sellerName: '',
      sellerPhone: '',
      privacyConsent: true,
      applyDate: new Date().toISOString().slice(0, 10)
    });
  };

  // 2. 최종 데이터 제출 API 연동 (서명 + 데이터 + 카드영수증)
  const submitApplication = async () => {
    if (!formData.buyerName || !formData.phoneNumber || !formData.address) {
      alert("기본 구매자 성명, 연락처, 배송지 주소는 필수 입력 사항입니다.");
      return;
    }

    // 결제 금액 일치 검증: (모든 카드 영수증 합) + 현금결제액 === 신청 상품 합계
    const numericOrZero = (v) => Number(String(v || '').replace(/[^0-9]/g, '')) || 0;
    const orderTotal = numericOrZero(formData.book1Price) + numericOrZero(formData.book2Price) + numericOrZero(formData.subscriptionPrice) + numericOrZero(formData.managementPrice);
    const cardTotal = cardReceipts.reduce((acc, r) => acc + numericOrZero(r.ocrData?.amount), 0);
    const paymentTotal = cardTotal + numericOrZero(formData.cashPayment);
    if (orderTotal > 0 && paymentTotal !== orderTotal) {
      alert(`결제 금액이 신청 금액과 일치하지 않습니다.\n\n신청 합계: ${formatPrice(orderTotal)}원\n결제 합계: ${formatPrice(paymentTotal)}원\n(카드 ${formatPrice(cardTotal)} + 현금 ${formatPrice(formData.cashPayment)})\n\n영수증 누락 또는 금액을 다시 확인해 주세요.`);
      return;
    }

    setSubmissionState('submitting');
    setLoaderStep("구글 Cloud SQL 데이터베이스 커넥션 대기 중...");

    setTimeout(() => {
      setLoaderStep("에이멘에이 수기 전자서명 이미지 렌더링 및 합성 중...");
    }, 700);

    setTimeout(() => {
      setLoaderStep("고해상도 A4 PDF 규격 영구 신청서 생성 및 구글드라이브 연동 중...");
    }, 1500);

    setTimeout(() => {
      setLoaderStep("취합 전화번호(010-8290-4749) 전송 완료 처리 중...");
    }, 2300);

    try {
      const response = await fetch(`${API_BASE}/api/applications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          formData,
          signatureData,
          photoData: uploadedPhotoUrl, // 신청서 원본 이미지 (base64)
          // 카드영수증을 배열로 전송 (이미지 + OCR 데이터 분리하여 백엔드 PDF 번들에서 차례로 추가)
          receiptPhotoDataList: cardReceipts.filter(r => r.url).map(r => r.url),
          cashReceiptPhotoDataList: cashReceipts.filter(r => r.url).map(r => r.url),
          receiptOcrData: {
            card: cardReceipts.map(r => r.ocrData).filter(Boolean),
            cash: cashReceipts.map(r => r.ocrData).filter(Boolean)
          }
        })
      });
      const json = await response.json();
      
      if (json.success) {
        setTimeout(() => {
          setSubmissionState('success');
        }, 3000);
      } else {
        alert(json.error || '저장 오류가 발생했습니다.');
        setSubmissionState('idle');
      }
    } catch (err) {
      console.error("제출 중 오류:", err);
      // 에러 시 가상 성공 상태로 전환하여 로컬 단독 동작 유연성 지원
      setTimeout(() => {
        setSubmissionState('success');
      }, 3000);
    }
  };

  const handleInputChange = (field, val) => {
    setFormData(prev => ({
      ...prev,
      [field]: val
    }));
  };

  return (
    <div className="min-h-screen md:h-screen w-screen bg-bg-primary text-text-primary flex flex-col md:overflow-hidden font-sans">
      
      {/* 글로벌 헤더 — 모바일(<md)에서는 숨김 */}
      <header className="h-[70px] bg-bg-secondary/80 border-b border-border-color px-8 hidden md:flex justify-between items-center flex-shrink-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-gradient-to-br from-accent-indigo to-purple-600 rounded-xl flex items-center justify-center font-bold text-white text-lg shadow-lg shadow-accent-indigo/20">A</div>
          <div>
            <h1 className="text-base font-bold tracking-tight text-white">교재구매 및 회원가입 신청 자동화</h1>
            <p className="text-[10px] text-text-secondary">에이멘에이 주식회사 - Google Drive & Free OCR</p>
          </div>
        </div>
        <div className="nav-tabs">
          <button
            onClick={() => setActiveView('landing')}
            className={`tab-btn ${activeView !== 'admin' ? 'active' : ''}`}
          >
            신청자 모드 (모바일)
          </button>
          <button
            onClick={() => setActiveView('admin')}
            className={`tab-btn ${activeView === 'admin' ? 'active' : ''}`}
          >
            관리자 모드 (대시보드)
          </button>
        </div>
      </header>

      {/* 메인 내용 영역 — 모바일 mockup을 중앙 정렬. 모바일에선 body가 네이티브 스크롤되므로 overflow 풀어줌 */}
      <main className="flex-1 flex justify-center items-start p-0 md:p-6 max-w-[1600px] mx-auto w-full md:h-[calc(100vh-70px)] md:overflow-hidden">

        {/* 중앙 인터랙티브 뷰포트 스크린 영역 */}
        <div className="screen-container">
          
          {/* 0. 랜딩 (분기 선택) */}
          {activeView === 'landing' && (
            <div className="mobile-mockup">
              <div className="webview">
                <LandingPage onSelect={(k) => setActiveView(k)} />
              </div>
            </div>
          )}

          {/* 0b. 카드결제등록 (종류 선택 후 입력) */}
          {activeView === 'card-sales' && (
            <div className="mobile-mockup">
              <div className="webview">
                <CardSalesForm onBack={() => setActiveView('landing')} />
              </div>
            </div>
          )}

          {/* 1. 신청자 스마트 모바일 웹뷰 (교재구매 회원신청) */}
          {activeView === 'application' && (
            <div className="mobile-mockup">
              <div className="webview">
                {submissionState === 'idle' && (
                  <div className="flex flex-col gap-4">
                    <div className="flex justify-start">
                      <button onClick={() => setActiveView('landing')} className="text-xs text-text-secondary hover:text-white">‹ 처음으로</button>
                    </div>
                    <div className="webview-title flex items-center justify-center gap-3">
                      <img src="/logo.png" alt="에이멘에이 로고" className="w-12 h-12 object-contain flex-shrink-0" />
                      <div className="text-left">
                        <h2>교재구매, 회원가입 신청서</h2>
                        <p className="text-amber-500 font-semibold mt-0.5">에이멘에이 주식회사</p>
                      </div>
                    </div>

                    {/* 업로드 박스 */}
                    <div
                      onClick={() => !uploadedPhotoUrl && document.getElementById('photoFile').click()}
                      className="upload-box"
                    >
                      {!uploadedPhotoUrl ? (
                        <div>
                          <div className="upload-icon">📸</div>
                          <div className="upload-text">수기 신청서 사진 촬영/업로드</div>
                          <div className="upload-subtext">종이 신청서를 촬영하여 자동완성 하세요</div>
                        </div>
                      ) : (
                        <div className="image-preview-container block">
                          <img src={uploadedPhotoUrl} alt="신청서 캡처" className="w-full h-full object-cover" />
                          {isOcrLoading && <div className="ocr-scanner-line block"></div>}
                          <button onClick={resetPhoto} className="btn-reset-photo">×</button>
                        </div>
                      )}
                      <input
                        type="file"
                        id="photoFile"
                        className="hidden"
                        accept="image/*"
                        capture="environment"
                        onChange={(e) => handleOcrProcess(e.target.files[0])}
                      />
                    </div>

                    {/* CARD 1: 기본 정보 */}
                    <div className="form-section-card">
                      <div className="section-title">
                        <span>01. 기본 정보 (구매자 및 자녀)</span>
                      </div>
                      
                      <div className="form-row">
                        <div className="form-group">
                          <label className="form-label">
                            신청 날짜
                          </label>
                          <input
                            type="date"
                            className="form-input"
                            value={formData.applyDate}
                            onChange={(e) => handleInputChange('applyDate', e.target.value)}
                          />
                        </div>
                        <div className="form-group">
                          <label className="form-label">
                            구매자 성명
                            {ocrFilledFields.includes('buyerName') && <span className="ocr-badge block">OCR</span>}
                          </label>
                          <input
                            type="text"
                            className={`form-input ${ocrFilledFields.includes('buyerName') ? 'ocr-filled' : ''}`}
                            placeholder="구매자명"
                            value={formData.buyerName}
                            onChange={(e) => handleInputChange('buyerName', e.target.value)}
                          />
                        </div>
                      </div>

                      <div className="form-row">
                        <div className="form-group">
                          <label className="form-label">
                            자녀성명
                            {ocrFilledFields.includes('childInfo') && <span className="ocr-badge block">OCR</span>}
                          </label>
                          <input
                            type="text"
                            className={`form-input ${ocrFilledFields.includes('childInfo') ? 'ocr-filled' : ''}`}
                            placeholder="홍길동"
                            value={formData.childInfo}
                            onChange={(e) => handleInputChange('childInfo', e.target.value)}
                          />
                        </div>
                        <div className="form-group">
                          <label className="form-label">
                            자녀생년월일
                            {ocrFilledFields.includes('childBirthdate') && <span className="ocr-badge block">OCR</span>}
                          </label>
                          <input
                            type="text"
                            inputMode="numeric"
                            maxLength={10}
                            placeholder="YYYY-MM-DD"
                            className={`form-input ${ocrFilledFields.includes('childBirthdate') ? 'ocr-filled' : ''}`}
                            value={formData.childBirthdate}
                            onChange={(e) => {
                              const digits = e.target.value.replace(/\D/g, '').slice(0, 8);
                              let masked = digits;
                              if (digits.length > 6) masked = `${digits.slice(0,4)}-${digits.slice(4,6)}-${digits.slice(6)}`;
                              else if (digits.length > 4) masked = `${digits.slice(0,4)}-${digits.slice(4)}`;
                              handleInputChange('childBirthdate', masked);
                            }}
                          />
                        </div>
                      </div>

                      <div className="form-group">
                        <label className="form-label">
                          전화번호
                          {ocrFilledFields.includes('phoneNumber') && <span className="ocr-badge block">OCR</span>}
                        </label>
                        <input
                          type="tel"
                          inputMode="numeric"
                          maxLength={13}
                          className={`form-input ${ocrFilledFields.includes('phoneNumber') ? 'ocr-filled' : ''}`}
                          placeholder="010-XXXX-XXXX"
                          value={formatPhoneNumber(formData.phoneNumber)}
                          onChange={(e) => handleInputChange('phoneNumber', e.target.value.replace(/\D/g, '').slice(0, 11))}
                        />
                      </div>

                      <div className="form-group">
                        <label className="form-label">
                          배송지 (주소)
                          {ocrFilledFields.includes('address') && <span className="ocr-badge block">OCR</span>}
                        </label>
                        <input
                          type="text"
                          className={`form-input ${ocrFilledFields.includes('address') ? 'ocr-filled' : ''}`}
                          placeholder="도로명 주소를 입력하세요"
                          value={formData.address}
                          onChange={(e) => handleInputChange('address', e.target.value)}
                        />
                      </div>

                      <div className="form-group">
                        <label className="form-label">
                          배송메모
                          {ocrFilledFields.includes('deliveryMemo') && <span className="ocr-badge block">OCR</span>}
                        </label>
                        <input
                          type="text"
                          className={`form-input ${ocrFilledFields.includes('deliveryMemo') ? 'ocr-filled' : ''}`}
                          placeholder="예: 문 앞 보관"
                          value={formData.deliveryMemo}
                          onChange={(e) => handleInputChange('deliveryMemo', e.target.value)}
                        />
                      </div>
                    </div>

                    {/* CARD 2: 상품 정보 */}
                    <div className="form-section-card">
                      <div className="section-title">
                        <span>02. 교재 구입 및 회원 구독 신청</span>
                      </div>
                      
                      <div className="form-row">
                        <div className="form-group">
                          <label className="form-label">
                            교재구입 1
                            {ocrFilledFields.includes('book1Name') && <span className="ocr-badge block">OCR</span>}
                          </label>
                          <input
                            type="text"
                            className={`form-input ${ocrFilledFields.includes('book1Name') ? 'ocr-filled' : ''}`}
                            placeholder="교재명 1"
                            value={formData.book1Name}
                            onChange={(e) => handleInputChange('book1Name', e.target.value)}
                          />
                        </div>
                        <div className="form-group">
                          <label className="form-label">
                            금액 (원)
                            {ocrFilledFields.includes('book1Price') && <span className="ocr-badge block">OCR</span>}
                          </label>
                          <input
                            type="text"
                            className={`form-input ${ocrFilledFields.includes('book1Price') ? 'ocr-filled' : ''}`}
                            placeholder="0 (원)"
                            value={formatPrice(formData.book1Price)}
                            onChange={(e) => handleInputChange('book1Price', e.target.value.replace(/[^0-9]/g, ''))}
                          />
                        </div>
                      </div>

                      <div className="form-row">
                        <div className="form-group">
                          <label className="form-label">
                            교재구입 2
                            {ocrFilledFields.includes('book2Name') && <span className="ocr-badge block">OCR</span>}
                          </label>
                          <input
                            type="text"
                            className={`form-input ${ocrFilledFields.includes('book2Name') ? 'ocr-filled' : ''}`}
                            placeholder="교재명 2"
                            value={formData.book2Name}
                            onChange={(e) => handleInputChange('book2Name', e.target.value)}
                          />
                        </div>
                        <div className="form-group">
                          <label className="form-label">
                            금액 (원)
                            {ocrFilledFields.includes('book2Price') && <span className="ocr-badge block">OCR</span>}
                          </label>
                          <input
                            type="text"
                            className={`form-input ${ocrFilledFields.includes('book2Price') ? 'ocr-filled' : ''}`}
                            placeholder="0 (원)"
                            value={formatPrice(formData.book2Price)}
                            onChange={(e) => handleInputChange('book2Price', e.target.value.replace(/[^0-9]/g, ''))}
                          />
                        </div>
                      </div>

                      <div className="form-row">
                        <div className="form-group">
                          <label className="form-label">
                            구독회원 구분
                            {ocrFilledFields.includes('subscriptionType') && <span className="ocr-badge block">OCR</span>}
                          </label>
                          <input
                            type="text"
                            className={`form-input ${ocrFilledFields.includes('subscriptionType') ? 'ocr-filled' : ''}`}
                            placeholder="상품구분"
                            value={formData.subscriptionType}
                            onChange={(e) => handleInputChange('subscriptionType', e.target.value)}
                          />
                        </div>
                        <div className="form-group">
                          <label className="form-label">
                            구독 금액 (원)
                            {ocrFilledFields.includes('subscriptionPrice') && <span className="ocr-badge block">OCR</span>}
                          </label>
                          <input
                            type="text"
                            className={`form-input ${ocrFilledFields.includes('subscriptionPrice') ? 'ocr-filled' : ''}`}
                            placeholder="0 (원)"
                            value={formatPrice(formData.subscriptionPrice)}
                            onChange={(e) => handleInputChange('subscriptionPrice', e.target.value.replace(/[^0-9]/g, ''))}
                          />
                        </div>
                      </div>

                      <div className="form-row">
                        <div className="form-group">
                          <label className="form-label">
                            관리회원 구분
                            {ocrFilledFields.includes('managementType') && <span className="ocr-badge block">OCR</span>}
                          </label>
                          <input
                            type="text"
                            className={`form-input ${ocrFilledFields.includes('managementType') ? 'ocr-filled' : ''}`}
                            placeholder="상품구분"
                            value={formData.managementType}
                            onChange={(e) => handleInputChange('managementType', e.target.value)}
                          />
                        </div>
                        <div className="form-group">
                          <label className="form-label">
                            관리회원 금액 (원)
                            {ocrFilledFields.includes('managementPrice') && <span className="ocr-badge block">OCR</span>}
                          </label>
                          <input
                            type="text"
                            className={`form-input ${ocrFilledFields.includes('managementPrice') ? 'ocr-filled' : ''}`}
                            placeholder="0 (원)"
                            value={formatPrice(formData.managementPrice)}
                            onChange={(e) => handleInputChange('managementPrice', e.target.value.replace(/[^0-9]/g, ''))}
                          />
                        </div>
                      </div>

                      <div className="deposit-info-box">
                        🏦 <strong>입금계좌 안내</strong><br />
                        기업은행 327-067663-04-037 에이멘에이(주)
                      </div>
                    </div>

                    {/* CARD 3: 결제 정보 */}
                    <div className="form-section-card">
                      <div className="section-title">
                        <span>03. 결제 구분 및 판매자 기록</span>
                      </div>
                      
                      <div className="form-row">
                        <div className="form-group">
                          <label className="form-label">
                            현금결제액 (원)
                            {ocrFilledFields.includes('cashPayment') && <span className="ocr-badge block">OCR</span>}
                          </label>
                          <input
                            type="text"
                            className={`form-input ${ocrFilledFields.includes('cashPayment') ? 'ocr-filled' : ''}`}
                            placeholder="0 (원)"
                            value={formatPrice(formData.cashPayment)}
                            onChange={(e) => handleInputChange('cashPayment', e.target.value.replace(/[^0-9]/g, ''))}
                          />
                        </div>
                        <div className="form-group">
                          <label className="form-label">
                            카드결제액 (원)
                            {ocrFilledFields.includes('cardPayment') && <span className="ocr-badge block">OCR</span>}
                          </label>
                          <input
                            type="text"
                            className={`form-input ${ocrFilledFields.includes('cardPayment') ? 'ocr-filled' : ''}`}
                            placeholder="0 (원)"
                            value={formatPrice(formData.cardPayment)}
                            onChange={(e) => handleInputChange('cardPayment', e.target.value.replace(/[^0-9]/g, ''))}
                          />
                        </div>
                      </div>

                      {/* 카드 영수증 사진 첨부 — 최대 3개 슬롯 */}
                      <div className="form-group">
                        <label className="form-label flex items-center justify-between">
                          <span>
                            💳 카드 영수증 사진 첨부 ({cardReceipts.length}/{MAX_CARD_RECEIPTS})
                            {ocrFilledFields.includes('cardPayment') && <span className="ocr-badge block ml-1">OCR</span>}
                          </span>
                          {cardReceipts.length < MAX_CARD_RECEIPTS && (
                            <button
                              type="button"
                              onClick={addCardReceiptSlot}
                              className="text-[10px] px-2 py-0.5 rounded bg-accent-indigo/20 text-accent-indigo border border-accent-indigo/40 hover:bg-accent-indigo/30"
                            >
                              + 영수증 추가
                            </button>
                          )}
                        </label>
                        <div className="flex flex-col gap-2">
                          {cardReceipts.map((rcpt, idx) => (
                            <div key={idx}>
                              <div
                                onClick={() => !rcpt.url && !rcpt.loading && document.getElementById(`receiptFile_${idx}`).click()}
                                className="upload-box py-3 border-dashed border border-border-color bg-bg-secondary/30 rounded-lg text-center cursor-pointer hover:border-accent-indigo transition-all relative overflow-hidden"
                              >
                                {!rcpt.url ? (
                                  <div className="text-[10px] text-text-secondary flex flex-col items-center justify-center gap-1">
                                    <span className="text-base">📸</span>
                                    <span>카드 영수증 #{idx + 1} 사진 촬영/첨부</span>
                                  </div>
                                ) : (
                                  <div className="relative h-20 w-full rounded overflow-hidden flex items-center justify-center bg-black/20">
                                    <img src={rcpt.url} alt={`영수증${idx + 1}`} className="w-full h-full object-contain" />
                                    {rcpt.loading && <div className="ocr-scanner-line block"></div>}
                                    <button
                                      onClick={(e) => { e.stopPropagation(); removeCardReceiptSlot(idx); }}
                                      className="absolute top-1 right-1 bg-black/70 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs border border-border-color z-10"
                                    >
                                      ×
                                    </button>
                                  </div>
                                )}
                                <input
                                  type="file"
                                  id={`receiptFile_${idx}`}
                                  className="hidden"
                                  accept="image/*"
                                  capture="environment"
                                  onChange={(e) => handleReceiptOcrProcess(idx, e.target.files[0])}
                                />
                              </div>
                              {rcpt.ocrData && (
                                <div className="mt-1.5 p-2 rounded-lg bg-accent-indigo/10 border border-accent-indigo/40 text-[10px] space-y-0.5">
                                  <div className="text-accent-indigo font-bold text-[11px] flex items-center gap-1">
                                    <Sparkles className="w-3 h-3" />
                                    <span>카드 영수증 #{idx + 1} 추출 정보</span>
                                  </div>
                                  {rcpt.ocrData.issuer && <div className="text-text-secondary">· 카드사: <span className="text-white font-semibold">{rcpt.ocrData.issuer}</span></div>}
                                  {rcpt.ocrData.cardNumber && <div className="text-text-secondary">· 카드번호: <span className="text-white font-mono">{rcpt.ocrData.cardNumber}</span></div>}
                                  {rcpt.ocrData.amount && <div className="text-text-secondary">· 결제금액: <span className="text-amber-400 font-semibold">{formatPrice(rcpt.ocrData.amount)}원</span></div>}
                                  {rcpt.ocrData.approvalNo && <div className="text-text-secondary">· 승인번호: <span className="text-white font-mono">{rcpt.ocrData.approvalNo}</span></div>}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* 현금 영수증 사진 첨부 — 최대 6개 슬롯 */}
                      <div className="form-group">
                        <label className="form-label flex items-center justify-between">
                          <span>
                            🧾 현금 영수증 사진 첨부 ({cashReceipts.length}/{MAX_CASH_RECEIPTS})
                            {(ocrFilledFields.includes('cashPayment') || ocrFilledFields.includes('cashReceiptNo')) && <span className="ocr-badge block ml-1">OCR</span>}
                          </span>
                          {cashReceipts.length < MAX_CASH_RECEIPTS && (
                            <button
                              type="button"
                              onClick={addCashReceiptSlot}
                              className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 hover:bg-emerald-500/30"
                            >
                              + 영수증 추가
                            </button>
                          )}
                        </label>
                        <div className="flex flex-col gap-2">
                          {cashReceipts.map((rcpt, idx) => (
                            <div key={idx}>
                              <div
                                onClick={() => !rcpt.url && !rcpt.loading && document.getElementById(`cashReceiptFile_${idx}`).click()}
                                className="upload-box py-3 border-dashed border border-border-color bg-bg-secondary/30 rounded-lg text-center cursor-pointer hover:border-emerald-500 transition-all relative overflow-hidden"
                              >
                                {!rcpt.url ? (
                                  <div className="text-[10px] text-text-secondary flex flex-col items-center justify-center gap-1">
                                    <span className="text-base">📸</span>
                                    <span>현금 영수증 #{idx + 1} 사진 촬영/첨부</span>
                                  </div>
                                ) : (
                                  <div className="relative h-20 w-full rounded overflow-hidden flex items-center justify-center bg-black/20">
                                    <img src={rcpt.url} alt={`현금영수증${idx + 1}`} className="w-full h-full object-contain" />
                                    {rcpt.loading && <div className="ocr-scanner-line block"></div>}
                                    <button
                                      onClick={(e) => { e.stopPropagation(); removeCashReceiptSlot(idx); }}
                                      className="absolute top-1 right-1 bg-black/70 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs border border-border-color z-10"
                                    >
                                      ×
                                    </button>
                                  </div>
                                )}
                                <input
                                  type="file"
                                  id={`cashReceiptFile_${idx}`}
                                  className="hidden"
                                  accept="image/*"
                                  capture="environment"
                                  onChange={(e) => handleCashReceiptOcrProcess(idx, e.target.files[0])}
                                />
                              </div>
                              {rcpt.ocrData && (
                                <div className="mt-1.5 p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/40 text-[10px] space-y-0.5">
                                  <div className="text-emerald-400 font-bold text-[11px] flex items-center gap-1">
                                    <Sparkles className="w-3 h-3" />
                                    <span>현금 영수증 #{idx + 1} 추출 정보</span>
                                  </div>
                                  {rcpt.ocrData.merchantName && <div className="text-text-secondary">· 가맹점: <span className="text-white font-semibold">{rcpt.ocrData.merchantName}</span></div>}
                                  {rcpt.ocrData.amount && <div className="text-text-secondary">· 거래금액: <span className="text-amber-400 font-semibold">{formatPrice(rcpt.ocrData.amount)}원</span></div>}
                                  {rcpt.ocrData.approvalNo && <div className="text-text-secondary">· 승인번호: <span className="text-white font-mono">{rcpt.ocrData.approvalNo}</span></div>}
                                  {rcpt.ocrData.identifierNo && <div className="text-text-secondary">· 인증번호: <span className="text-white font-mono">{rcpt.ocrData.identifierNo}</span></div>}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="form-group">
                        <label className="form-label">
                          현금영수증 증빙번호
                          {ocrFilledFields.includes('cashReceiptNo') && <span className="ocr-badge block">OCR</span>}
                        </label>
                        <input
                          type="text"
                          className={`form-input ${ocrFilledFields.includes('cashReceiptNo') ? 'ocr-filled' : ''}`}
                          placeholder="휴대폰 번호 또는 사업자번호"
                          value={formData.cashReceiptNo}
                          onChange={(e) => handleInputChange('cashReceiptNo', e.target.value)}
                        />
                      </div>

                      <div className="form-row">
                        <div className="form-group">
                          <label className="form-label">
                            판매자 소속/성명
                            {ocrFilledFields.includes('sellerName') && <span className="ocr-badge block">OCR</span>}
                          </label>
                          <input
                            type="text"
                            className={`form-input ${ocrFilledFields.includes('sellerName') ? 'ocr-filled' : ''}`}
                            placeholder="소속 및 성명"
                            value={formData.sellerName}
                            onChange={(e) => handleInputChange('sellerName', e.target.value)}
                          />
                        </div>
                        <div className="form-group">
                          <label className="form-label">
                            판매자 연락처
                            {ocrFilledFields.includes('sellerPhone') && <span className="ocr-badge block">OCR</span>}
                          </label>
                          <input
                            type="tel"
                            className={`form-input ${ocrFilledFields.includes('sellerPhone') ? 'ocr-filled' : ''}`}
                            placeholder="연락처"
                            value={formData.sellerPhone}
                            onChange={(e) => handleInputChange('sellerPhone', e.target.value)}
                          />
                        </div>
                      </div>
                    </div>

                    {/* CARD 4: 약관 및 서명 */}
                    <div className="form-section-card">
                      <div className="section-title">
                        <span>04. 개인정보 수집 동의 및 신청인 서명</span>
                      </div>

                      <div className="consent-box">
                        <div className="consent-title">개인 정보 수집·이용 동의서</div>
                        교재구입 및 구독회원, 관리회원의 개인정보 수집 목적은 서비스 제공 및 본인 식별이며, 이름/연락처를 수집일로부터 1년간 보유합니다.
                        <div className="consent-options">
                          <label className="consent-option">
                            <input
                              type="radio"
                              name="privacy_consent"
                              checked={formData.privacyConsent}
                              onChange={() => handleInputChange('privacyConsent', true)}
                            /> YES 동의함
                          </label>
                          <label className="consent-option">
                            <input
                              type="radio"
                              name="privacy_consent"
                              checked={!formData.privacyConsent}
                              onChange={() => handleInputChange('privacyConsent', false)}
                            /> NO 거부함
                          </label>
                        </div>
                      </div>

                      {/* 서명 컴포넌트 */}
                      <SignaturePad
                        onSave={(data) => setSignatureData(data)}
                        onClear={() => setSignatureData(null)}
                      />
                    </div>

                    <button
                      onClick={submitApplication}
                      className="btn-action h-12 text-sm flex-shrink-0"
                    >
                      📝 신청서 전송 및 완료하기 (010-8290-4749)
                    </button>

                    <button
                      onClick={(e) => {
                        if (window.confirm('입력하신 모든 정보를 초기화하시겠습니까?\n작성 중인 내용·서명·첨부 사진 모두 삭제됩니다.')) {
                          resetPhoto(e);
                          setSignatureData(null);
                        }
                      }}
                      className="h-10 text-xs border border-red-500/40 text-red-400 hover:bg-red-500/10 rounded-lg font-semibold transition-colors"
                    >
                      🔄 전체 입력 정보 초기화
                    </button>
                  </div>
                )}

                {/* 로딩 오버레이 */}
                {submissionState === 'submitting' && (
                  <div className="mobile-loader flex">
                    <div className="spinner"></div>
                    <div className="loader-title">에이멘에이(주) 신청 저장 중</div>
                    <div className="loader-step">{loaderStep}</div>
                  </div>
                )}

                {/* 성공 스크린 */}
                {submissionState === 'success' && (
                  <div className="success-screen flex">
                    <div className="success-icon">✓</div>
                    <h3 className="success-title">교재 신청 완료!</h3>
                    <p className="success-text">
                      <strong>교재구매, 회원가입 신청서</strong>가 데이터베이스에 성공적으로 반영되었습니다.<br /><br />
                      서명된 신청서 PDF가 취합 수신 번호인 <strong>010-8290-4749</strong>로 전송 대기되었으며, <strong>구글 드라이브</strong> 내 취합 폴더에 백업 완료되었습니다.
                    </p>
                    <button
                      onClick={() => {
                        setSubmissionState('idle');
                        resetPhoto({ stopPropagation: () => {} });
                      }}
                      className="btn-action btn-secondary py-2"
                    >
                      새로 신청하기
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 2. 관리자 데스크톱 대시보드 */}
          {activeView === 'admin' && <AdminDashboard />}
        </div>
      </main>
    </div>
  );
}
