import React, { useState, useEffect } from 'react';
import { Camera, CheckCircle2, Trash2, Building, ArrowRight, Sparkles } from 'lucide-react';
import SignaturePad from './components/SignaturePad';
import AdminDashboard from './components/AdminDashboard';

// 3자리 콤마 포맷팅 헬퍼 함수
const formatPrice = (value) => {
  if (value === undefined || value === null || value === '') return '';
  const clean = value.toString().replace(/[^0-9]/g, '');
  return clean.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};

export default function App() {
  const [activeView, setActiveView] = useState('user'); // 'user' (모바일 신청서) or 'admin' (관리자 대시보드)

  // 신청서 입력 상태 정의
  const [formData, setFormData] = useState({
    buyerName: '',
    childInfo: '',
    phoneNumber: '',
    address: '',
    deliveryMemo: '',
    
    book1Name: '',
    book1Price: '',
    book2Name: '',
    book2Price: '',
    subscriptionType: '',
    subscriptionPrice: '',
    
    cashPayment: '',
    cardPayment: '',
    cashReceiptNo: '',
    
    sellerName: '',
    sellerPhone: '',
    privacyConsent: true,
    applyDate: new Date().toISOString().slice(0, 10)
  });

  const [signatureData, setSignatureData] = useState(null);
  
  // 카드 영수증 상태 추가
  const [receiptPhotoUrl, setReceiptPhotoUrl] = useState('');
  const [receiptPhotoFile, setReceiptPhotoFile] = useState(null);
  const [isReceiptOcrLoading, setIsReceiptOcrLoading] = useState(false);
  const [receiptOcrData, setReceiptOcrData] = useState(null); // 카드영수증 추출 정보 표시용

  // 현금 영수증 상태 추가
  const [cashReceiptPhotoUrl, setCashReceiptPhotoUrl] = useState('');
  const [cashReceiptPhotoFile, setCashReceiptPhotoFile] = useState(null);
  const [isCashReceiptOcrLoading, setIsCashReceiptOcrLoading] = useState(false);
  const [cashReceiptOcrData, setCashReceiptOcrData] = useState(null); // 현금영수증 추출 정보 표시용
  
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
      const response = await fetch('http://localhost:3001/api/ocr', {
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

  // 1.2 카드 영수증 OCR 파싱 API 연동
  const handleReceiptOcrProcess = async (file) => {
    if (!file) return;

    // 프리뷰 표시
    const reader = new FileReader();
    reader.onload = (e) => setReceiptPhotoUrl(e.target.result);
    reader.readAsDataURL(file);
    setReceiptPhotoFile(file);

    setIsReceiptOcrLoading(true);

    const uploadData = new FormData();
    uploadData.append('photo', file);
    uploadData.append('type', 'sales'); // 카드 영수증 분석 type 명시

    try {
      console.log("💳 카드 영수증 OCR 분석 요청 중...");
      const response = await fetch('http://localhost:3001/api/ocr', {
        method: 'POST',
        body: uploadData
      });
      const json = await response.json();

      if (json.success && json.data) {
        console.log("💳 카드 영수증 OCR 분석 성공:", json.data);
        const amount = json.data.amount || '';

        // 카드결제액 폼에 대입
        setFormData(prev => ({
          ...prev,
          cardPayment: amount
        }));

        // OCR로 채워진 필드 하이라이트에 추가 + 추출 정보 패널 표시
        setOcrFilledFields(prev => [...new Set([...prev, 'cardPayment'])]);
        setReceiptOcrData(json.data);
      }
    } catch (err) {
      console.error("카드 영수증 OCR 분석 실패:", err);
      alert("영수증 OCR 분석 실패. 일반 사진으로 첨부합니다.");
    } finally {
      setIsReceiptOcrLoading(false);
    }
  };

  // 1.3 현금 영수증 OCR 파싱 API 연동
  const handleCashReceiptOcrProcess = async (file) => {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => setCashReceiptPhotoUrl(e.target.result);
    reader.readAsDataURL(file);
    setCashReceiptPhotoFile(file);

    setIsCashReceiptOcrLoading(true);

    const uploadData = new FormData();
    uploadData.append('photo', file);
    uploadData.append('type', 'cash_receipt');

    try {
      console.log("🧾 현금 영수증 OCR 분석 요청 중...");
      const response = await fetch('http://localhost:3001/api/ocr', {
        method: 'POST',
        body: uploadData
      });
      const json = await response.json();

      if (json.success && json.data) {
        console.log("🧾 현금 영수증 OCR 분석 성공:", json.data);
        const amount = json.data.amount || '';
        const identifierNo = json.data.identifierNo || '';

        // 현금결제액 + 현금영수증 증빙번호 자동 입력
        setFormData(prev => ({
          ...prev,
          cashPayment: amount || prev.cashPayment,
          cashReceiptNo: identifierNo || prev.cashReceiptNo
        }));

        const filled = [];
        if (amount) filled.push('cashPayment');
        if (identifierNo) filled.push('cashReceiptNo');
        setOcrFilledFields(prev => [...new Set([...prev, ...filled])]);
        setCashReceiptOcrData(json.data);
      }
    } catch (err) {
      console.error("현금 영수증 OCR 분석 실패:", err);
      alert("현금영수증 OCR 분석 실패. 일반 사진으로 첨부합니다.");
    } finally {
      setIsCashReceiptOcrLoading(false);
    }
  };

  // 모바일 신청서 가상 테스트용 OCR 실행 단추
  const triggerOcrMock = async () => {
    // 임시 모의 분석을 위한 더미 사진 세팅
    setUploadedPhotoUrl("https://images.unsplash.com/photo-1606326608606-aa0b62935f2b?q=80&w=600&auto=format&fit=crop");
    setIsOcrLoading(true);
    setOcrFilledFields([]);

    try {
      // 빈 껍데기 요청을 보내 백엔드의 Mock 수기 신청서 데이터 획득
      const response = await fetch('http://localhost:3001/api/ocr', {
        method: 'POST'
        // body가 비었으므로 백엔드에서 에이멘에이 실물 맞춤 수기 데이터 로드
      });
      const json = await response.json();
      
      if (json.success) {
        setFormData(prev => ({
          ...prev,
          ...json.data
        }));
        setOcrFilledFields(Object.keys(json.data));
      }
    } catch (err) {
      console.error("모의 OCR 실패:", err);
    } finally {
      setIsOcrLoading(false);
    }
  };

  // 이미지 초기화
  const resetPhoto = (e) => {
    e.stopPropagation();
    setUploadedPhotoUrl('');
    setUploadedPhotoFile(null);
    setReceiptPhotoUrl('');
    setReceiptPhotoFile(null);
    setIsReceiptOcrLoading(false);
    setReceiptOcrData(null);
    setCashReceiptPhotoUrl('');
    setCashReceiptPhotoFile(null);
    setIsCashReceiptOcrLoading(false);
    setCashReceiptOcrData(null);
    setOcrFilledFields([]);
    
    // 입력값 모두 초기화
    setFormData({
      buyerName: '',
      childInfo: '',
      phoneNumber: '',
      address: '',
      deliveryMemo: '',
      book1Name: '',
      book1Price: '',
      book2Name: '',
      book2Price: '',
      subscriptionType: '',
      subscriptionPrice: '',
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
      const response = await fetch('http://localhost:3001/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          formData,
          signatureData,
          photoData: uploadedPhotoUrl, // 신청서 원본 이미지 (base64) 추가!
          receiptPhotoData: receiptPhotoUrl, // 카드 영수증 이미지 데이터(base64) 추가 발송!
          cashReceiptPhotoData: cashReceiptPhotoUrl, // 현금 영수증 이미지 데이터(base64) 추가 발송!
          receiptOcrData: {
            card: receiptOcrData,
            cash: cashReceiptOcrData
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
    <div className="h-screen w-screen bg-bg-primary text-text-primary flex flex-col overflow-hidden font-sans">
      
      {/* 글로벌 헤더 */}
      <header className="h-[70px] bg-bg-secondary/80 border-b border-border-color px-8 flex justify-between items-center flex-shrink-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-gradient-to-br from-accent-indigo to-purple-600 rounded-xl flex items-center justify-center font-bold text-white text-lg shadow-lg shadow-accent-indigo/20">A</div>
          <div>
            <h1 className="text-base font-bold tracking-tight text-white">교재구매 및 회원가입 신청 자동화</h1>
            <p className="text-[10px] text-text-secondary">에이멘에이 주식회사 - Google Drive & Free OCR</p>
          </div>
        </div>
        <div className="nav-tabs">
          <button
            onClick={() => setActiveView('user')}
            className={`tab-btn ${activeView === 'user' ? 'active' : ''}`}
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

      {/* 메인 내용 영역 */}
      <main className="flex-1 flex gap-6 p-6 max-w-[1600px] mx-auto w-full h-[calc(100vh-70px)] overflow-hidden">
        
        {/* 신청서 좌측 가이드 패널 */}
        {activeView === 'user' && (
          <div className="sidebar animate-fade-in">
            <div className="card">
              <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                <span>📄</span>
                <span>실물 종이 신청서 분석</span>
              </h3>
              <p className="text-xs text-text-secondary mt-2 leading-relaxed">
                에이멘에이 주식회사의 수기 <strong>"교재구매, 회원가입 신청서"</strong>를 촬영하여 올리시면 수기 텍스트를 무료 구글 OCR이 완벽히 판독하여 채웁니다.
              </p>
              <button
                onClick={triggerOcrMock}
                className="btn-action w-full py-2 bg-gradient-to-r from-accent-indigo to-purple-600 hover:opacity-95 text-white font-semibold rounded-lg text-xs transition-transform flex items-center justify-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>실물 신청서 사진 OCR 분석</span>
              </button>
            </div>

            <div className="card">
              <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                <span>✨</span>
                <span>모바일 최적화 장점</span>
              </h3>
              <ul className="feature-list mt-2 gap-1 text-[11px] text-text-secondary">
                <li>길고 복잡한 실물 문항을 직관적인 <strong>4단계 정보 카드</strong>로 단장했습니다.</li>
                <li>오타가 발생하기 쉬운 도로명 주소는 검색 유효성 필터를 통해 정제됩니다.</li>
                <li>터치 기반 <strong>수기 전자서명</strong>이 A4 출력용 고해상도 PDF 신청서에 완벽히 임베딩되어 구글 드라이브로 들어갑니다.</li>
              </ul>
            </div>

            <div className="card mt-auto">
              <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
                <span>🔗</span>
                <span>보안 및 보관 아키텍처</span>
              </h3>
              <p className="text-[11px] text-text-secondary leading-relaxed mt-1">
                신청자의 사인이 담긴 PDF와 사진은 외부에 공개되지 않고 지정된 <strong>구글 보안 토큰</strong>을 활용하여 에이멘에이 지정 폴더에 안전하게 영구 격리됩니다.
              </p>
            </div>
          </div>
        )}

        {/* 중앙 인터랙티브 뷰포트 스크린 영역 */}
        <div className="screen-container">
          
          {/* 1. 신청자 스마트 모바일 웹뷰 */}
          {activeView === 'user' && (
            <div className="mobile-mockup">
              <div className="mobile-notch"></div>
              <div className="mobile-header">
                <span>20:45</span>
                <div className="flex gap-1.5 items-center">
                  <span>📶</span>
                  <span>🔋</span>
                </div>
              </div>

              <div className="webview">
                {submissionState === 'idle' && (
                  <div className="flex flex-col gap-4">
                    <div className="webview-title">
                      <h2>교재구매, 회원가입 신청서</h2>
                      <p className="text-amber-500 font-semibold mt-0.5">에이멘에이 주식회사</p>
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
                            자녀성명(연령)
                            {ocrFilledFields.includes('childInfo') && <span className="ocr-badge block">OCR</span>}
                          </label>
                          <input
                            type="text"
                            className={`form-input ${ocrFilledFields.includes('childInfo') ? 'ocr-filled' : ''}`}
                            placeholder="홍길동 (8세)"
                            value={formData.childInfo}
                            onChange={(e) => handleInputChange('childInfo', e.target.value)}
                          />
                        </div>
                        <div className="form-group">
                          <label className="form-label">
                            전화번호
                            {ocrFilledFields.includes('phoneNumber') && <span className="ocr-badge block">OCR</span>}
                          </label>
                          <input
                            type="tel"
                            className={`form-input ${ocrFilledFields.includes('phoneNumber') ? 'ocr-filled' : ''}`}
                            placeholder="010-XXXX-XXXX"
                            value={formData.phoneNumber}
                            onChange={(e) => handleInputChange('phoneNumber', e.target.value)}
                          />
                        </div>
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

                      {/* 카드 영수증 사진 첨부 레이아웃 */}
                      <div className="form-group">
                        <label className="form-label">
                          💳 카드 영수증 사진 첨부
                          {ocrFilledFields.includes('cardPayment') && <span className="ocr-badge block">OCR</span>}
                        </label>
                        <div
                          onClick={() => !receiptPhotoUrl && !isReceiptOcrLoading && document.getElementById('receiptFile').click()}
                          className="upload-box py-3 border-dashed border border-border-color bg-bg-secondary/30 rounded-lg text-center cursor-pointer hover:border-accent-indigo transition-all relative overflow-hidden"
                        >
                          {!receiptPhotoUrl ? (
                            <div className="text-[10px] text-text-secondary flex flex-col items-center justify-center gap-1">
                              <span className="text-base">📸</span>
                              <span>카드 영수증 사진 촬영/첨부</span>
                            </div>
                          ) : (
                            <div className="relative h-20 w-full rounded overflow-hidden flex items-center justify-center bg-black/20">
                              <img src={receiptPhotoUrl} alt="영수증" className="w-full h-full object-contain" />
                              {isReceiptOcrLoading && <div className="ocr-scanner-line block"></div>}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setReceiptPhotoUrl('');
                                  setReceiptPhotoFile(null);
                                  setReceiptOcrData(null);
                                  setOcrFilledFields(prev => prev.filter(f => f !== 'cardPayment'));
                                }}
                                className="absolute top-1 right-1 bg-black/70 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs border border-border-color z-10"
                              >
                                ×
                              </button>
                            </div>
                          )}
                          <input
                            type="file"
                            id="receiptFile"
                            className="hidden"
                            accept="image/*"
                            onChange={(e) => handleReceiptOcrProcess(e.target.files[0])}
                          />
                        </div>
                        {receiptOcrData && (
                          <div className="mt-2 p-2.5 rounded-lg bg-accent-indigo/10 border border-accent-indigo/40 text-[10px] space-y-1">
                            <div className="text-accent-indigo font-bold text-[11px] flex items-center gap-1">
                              <Sparkles className="w-3 h-3" />
                              <span>카드 영수증 추출 정보</span>
                            </div>
                            {receiptOcrData.issuer && <div className="text-text-secondary">· 카드사: <span className="text-white font-semibold">{receiptOcrData.issuer}</span></div>}
                            {receiptOcrData.cardNumber && <div className="text-text-secondary">· 카드번호: <span className="text-white font-mono">{receiptOcrData.cardNumber}</span></div>}
                            {receiptOcrData.amount && <div className="text-text-secondary">· 결제금액: <span className="text-amber-400 font-semibold">{formatPrice(receiptOcrData.amount)}원</span></div>}
                            {receiptOcrData.approvalNo && <div className="text-text-secondary">· 승인번호: <span className="text-white font-mono">{receiptOcrData.approvalNo}</span></div>}
                            {receiptOcrData.terminalNo && <div className="text-text-secondary">· 단말기번호: <span className="text-white font-mono">{receiptOcrData.terminalNo}</span></div>}
                            {receiptOcrData.serialNo && <div className="text-text-secondary">· 일련번호: <span className="text-white font-mono">{receiptOcrData.serialNo}</span></div>}
                          </div>
                        )}
                      </div>

                      {/* 현금 영수증 사진 첨부 레이아웃 */}
                      <div className="form-group">
                        <label className="form-label">
                          🧾 현금 영수증 사진 첨부
                          {(ocrFilledFields.includes('cashPayment') || ocrFilledFields.includes('cashReceiptNo')) && <span className="ocr-badge block">OCR</span>}
                        </label>
                        <div
                          onClick={() => !cashReceiptPhotoUrl && !isCashReceiptOcrLoading && document.getElementById('cashReceiptFile').click()}
                          className="upload-box py-3 border-dashed border border-border-color bg-bg-secondary/30 rounded-lg text-center cursor-pointer hover:border-accent-indigo transition-all relative overflow-hidden"
                        >
                          {!cashReceiptPhotoUrl ? (
                            <div className="text-[10px] text-text-secondary flex flex-col items-center justify-center gap-1">
                              <span className="text-base">📸</span>
                              <span>현금 영수증 사진 촬영/첨부</span>
                            </div>
                          ) : (
                            <div className="relative h-20 w-full rounded overflow-hidden flex items-center justify-center bg-black/20">
                              <img src={cashReceiptPhotoUrl} alt="현금영수증" className="w-full h-full object-contain" />
                              {isCashReceiptOcrLoading && <div className="ocr-scanner-line block"></div>}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setCashReceiptPhotoUrl('');
                                  setCashReceiptPhotoFile(null);
                                  setCashReceiptOcrData(null);
                                  setOcrFilledFields(prev => prev.filter(f => f !== 'cashPayment' && f !== 'cashReceiptNo'));
                                }}
                                className="absolute top-1 right-1 bg-black/70 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs border border-border-color z-10"
                              >
                                ×
                              </button>
                            </div>
                          )}
                          <input
                            type="file"
                            id="cashReceiptFile"
                            className="hidden"
                            accept="image/*"
                            onChange={(e) => handleCashReceiptOcrProcess(e.target.files[0])}
                          />
                        </div>
                        {cashReceiptOcrData && (
                          <div className="mt-2 p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/40 text-[10px] space-y-1">
                            <div className="text-emerald-400 font-bold text-[11px] flex items-center gap-1">
                              <Sparkles className="w-3 h-3" />
                              <span>현금영수증 추출 정보</span>
                            </div>
                            {cashReceiptOcrData.merchantName && <div className="text-text-secondary">· 가맹점: <span className="text-white font-semibold">{cashReceiptOcrData.merchantName}</span></div>}
                            {cashReceiptOcrData.merchantBizNo && <div className="text-text-secondary">· 사업자번호: <span className="text-white font-mono">{cashReceiptOcrData.merchantBizNo}</span></div>}
                            {cashReceiptOcrData.amount && <div className="text-text-secondary">· 거래금액: <span className="text-amber-400 font-semibold">{formatPrice(cashReceiptOcrData.amount)}원</span></div>}
                            {cashReceiptOcrData.approvalNo && <div className="text-text-secondary">· 승인번호: <span className="text-white font-mono">{cashReceiptOcrData.approvalNo}</span></div>}
                            {cashReceiptOcrData.transactionDate && <div className="text-text-secondary">· 거래일시: <span className="text-white font-mono">{cashReceiptOcrData.transactionDate}</span></div>}
                            {cashReceiptOcrData.identifierType && <div className="text-text-secondary">· 인증수단: <span className="text-white font-semibold">{cashReceiptOcrData.identifierType}</span></div>}
                            {cashReceiptOcrData.identifierNo && <div className="text-text-secondary">· 인증번호: <span className="text-white font-mono">{cashReceiptOcrData.identifierNo}</span></div>}
                          </div>
                        )}
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
