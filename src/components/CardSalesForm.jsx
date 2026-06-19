import React, { useState, useEffect } from 'react';
import { API_BASE } from '../config';

// 3자리 콤마 포맷
const formatPrice = (raw) => {
  const clean = String(raw || '').replace(/[^0-9]/g, '');
  if (!clean) return '';
  return clean.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};

const REGISTRANT_LS_KEY = 'lavenmanager_card_form_registrant';
const DEFAULT_BUSINESS_UNIT = '교육사업부';

// 카드결제등록 폼 — 새 흐름:
//   진입 → 단일결제/분할결제 선택 → (분할일 때 매수 선택) → 입력 폼 (상단에 분류 드롭다운)
export default function CardSalesForm({ onBack }) {
  const [mode, setMode] = useState(null); // null | 'single' | 'split'
  const [splitCount, setSplitCount] = useState(null); // 분할 매수
  const [categories, setCategories] = useState([]);
  const [type, setType] = useState(''); // 카테고리 key

  const selectedCat = categories.find(c => c.key === type);
  const contentLabel = selectedCat ? selectedCat.label : '';
  const maxSplit = selectedCat ? selectedCat.maxSplit : 10;

  // 카테고리 목록 로드
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/card-sales-categories`);
        const json = await res.json();
        if (json.success && json.data && json.data.length > 0) {
          setCategories(json.data);
          if (!type) setType(json.data[0].key);
        }
      } catch (err) { console.error('카테고리 로드 실패:', err); }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadRegistrant = () => {
    try {
      const raw = localStorage.getItem(REGISTRANT_LS_KEY);
      if (raw) {
        const obj = JSON.parse(raw);
        return {
          businessUnit: obj.businessUnit || DEFAULT_BUSINESS_UNIT,
          registrantOrg: obj.registrantOrg || '',
          registrantName: obj.registrantName || ''
        };
      }
    } catch {}
    return { businessUnit: DEFAULT_BUSINESS_UNIT, registrantOrg: '', registrantName: '' };
  };

  const newCard = () => ({ catId: '', amount: '', cardIssuer: '', cardNumber: '', approvalNo: '', photoUrl: '', ocrLoading: false });

  const [common, setCommon] = useState(() => {
    const reg = loadRegistrant();
    return {
      date: new Date().toISOString().slice(0, 10),
      buyer: '',
      businessUnit: reg.businessUnit,
      registrantOrg: reg.registrantOrg,
      registrantName: reg.registrantName
    };
  });
  const setC = (k, v) => setCommon(prev => ({ ...prev, [k]: v }));

  const [single, setSingle] = useState(newCard());
  const [cards, setCards] = useState([]);
  const setCardField = (idx, k, v) => setCards(prev => prev.map((c, i) => i === idx ? { ...c, [k]: v } : c));

  const [submitState, setSubmitState] = useState('idle');

  const handleOcr = async (file, applyResult) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => applyResult({ photoUrl: e.target.result, ocrLoading: true });
    reader.readAsDataURL(file);

    const fd = new FormData();
    fd.append('photo', file);
    fd.append('type', 'sales');
    try {
      const res = await fetch(`${API_BASE}/api/ocr`, { method: 'POST', body: fd });
      const json = await res.json();
      if (json.success && json.data) {
        applyResult({
          ocrLoading: false,
          catId: json.data.terminalNo || '',
          amount: json.data.amount || '',
          cardIssuer: json.data.issuer || '',
          cardNumber: json.data.cardNumber || '',
          approvalNo: json.data.approvalNo || '',
          transactionDate: json.data.transactionDate ? String(json.data.transactionDate).slice(0, 10) : null
        });
      } else applyResult({ ocrLoading: false });
    } catch (err) {
      alert('카드영수증 OCR 분석 실패: ' + err.message);
      applyResult({ ocrLoading: false });
    }
  };

  const handleSingleOcr = (file) => handleOcr(file, (r) => {
    setSingle(prev => ({
      ...prev,
      photoUrl: r.photoUrl !== undefined ? r.photoUrl : prev.photoUrl,
      ocrLoading: r.ocrLoading,
      catId: r.catId || prev.catId,
      amount: r.amount || prev.amount,
      cardIssuer: r.cardIssuer || prev.cardIssuer,
      cardNumber: r.cardNumber || prev.cardNumber,
      approvalNo: r.approvalNo || prev.approvalNo
    }));
    if (r.transactionDate) setC('date', r.transactionDate);
  });

  const handleCardOcr = (idx, file) => handleOcr(file, (r) => {
    setCards(prev => prev.map((c, i) => i === idx ? {
      ...c,
      photoUrl: r.photoUrl !== undefined ? r.photoUrl : c.photoUrl,
      ocrLoading: r.ocrLoading,
      catId: r.catId || c.catId,
      amount: r.amount || c.amount,
      cardIssuer: r.cardIssuer || c.cardIssuer,
      cardNumber: r.cardNumber || c.cardNumber,
      approvalNo: r.approvalNo || c.approvalNo
    } : c));
    if (r.transactionDate) setC('date', r.transactionDate);
  });

  const goBackToModeSelect = () => { setMode(null); setSplitCount(null); setSingle(newCard()); setCards([]); };
  const goBackToSplitCountSelect = () => { setSplitCount(null); setCards([]); };

  const splitTotal = cards.reduce((s, c) => s + (Number(String(c.amount).replace(/\D/g, '')) || 0), 0);

  const handleSubmit = async () => {
    if (!type) { alert('분류를 선택해 주세요.'); return; }
    if (!common.buyer.trim()) { alert('구매자는 필수 입력입니다.'); return; }
    let body;
    if (mode === 'split') {
      const validCards = cards.filter(c => c.amount && Number(String(c.amount).replace(/\D/g, '')) > 0);
      if (validCards.length === 0) { alert('금액이 입력된 카드 영수증이 없습니다.'); return; }
      body = {
        type, date: common.date, buyer: common.buyer, businessUnit: common.businessUnit,
        registrantOrg: common.registrantOrg, registrantName: common.registrantName,
        cards: validCards.map(c => ({ catId: c.catId, amount: c.amount, cardIssuer: c.cardIssuer, cardNumber: c.cardNumber, approvalNo: c.approvalNo }))
      };
    } else {
      if (!single.amount) { alert('금액은 필수 입력입니다.'); return; }
      body = {
        type, date: common.date, buyer: common.buyer, businessUnit: common.businessUnit,
        registrantOrg: common.registrantOrg, registrantName: common.registrantName,
        catId: single.catId, amount: single.amount, cardIssuer: single.cardIssuer, cardNumber: single.cardNumber, approvalNo: single.approvalNo
      };
    }
    setSubmitState('submitting');
    try {
      const res = await fetch(`${API_BASE}/api/card-sales`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      });
      const json = await res.json();
      if (json.success) {
        try {
          localStorage.setItem(REGISTRANT_LS_KEY, JSON.stringify({
            businessUnit: common.businessUnit, registrantOrg: common.registrantOrg, registrantName: common.registrantName
          }));
        } catch {}
        setSubmitState('done');
      } else {
        alert('등록 실패: ' + (json.error || '알 수 없는 오류'));
        setSubmitState('idle');
      }
    } catch (err) {
      alert('등록 요청 실패: ' + err.message);
      setSubmitState('idle');
    }
  };

  const resetForm = () => {
    const reg = loadRegistrant();
    setCommon({
      date: new Date().toISOString().slice(0, 10),
      buyer: '',
      businessUnit: reg.businessUnit,
      registrantOrg: reg.registrantOrg,
      registrantName: reg.registrantName
    });
    setSingle(newCard());
    if (mode === 'split' && splitCount) setCards(Array.from({ length: splitCount }, newCard));
    setSubmitState('idle');
  };

  // ─── 완료 화면 ──────────────────────────────────────────
  if (submitState === 'done') {
    return (
      <div className="w-full max-w-md mx-auto p-5 flex flex-col gap-4 items-center text-center">
        <div className="text-5xl">✅</div>
        <h2 className="text-lg font-bold text-white">등록 완료</h2>
        <p className="text-sm text-text-secondary">카드결제등록 건이 정상 저장되었습니다.</p>
        <div className="flex gap-2 w-full mt-2">
          <button onClick={resetForm} className="flex-1 py-2 bg-accent-indigo text-white rounded-lg text-sm font-semibold">추가 등록</button>
          <button onClick={onBack} className="flex-1 py-2 bg-slate-700 text-white rounded-lg text-sm font-semibold">처음으로</button>
        </div>
      </div>
    );
  }

  // ─── 1. 단일 / 분할 선택 (진입 시) ──────────────────────
  if (!mode) {
    return (
      <div className="w-full max-w-md mx-auto p-5 flex flex-col gap-4">
        <Header onBack={onBack} title="카드결제등록" backLabel="‹ 처음으로" />
        <p className="text-xs text-text-secondary text-center">결제 방식을 선택하세요</p>
        <BigCard color="from-indigo-500 to-blue-600" emoji="💳" title="단일 결제" sub="카드 영수증 1장으로 결제 등록" onClick={() => setMode('single')} />
        <BigCard color="from-amber-500 to-orange-600" emoji="🧾" title="분할 결제" sub="여러 장의 카드 영수증을 한 거래로 묶어 등록" onClick={() => setMode('split')} />
      </div>
    );
  }

  // ─── 2. 분할 매수 선택 ─────────────────────────────────
  if (mode === 'split' && !splitCount) {
    return (
      <div className="w-full max-w-md mx-auto p-5 flex flex-col gap-4">
        <Header onBack={goBackToModeSelect} title="카드결제등록" backLabel="‹ 결제 방식" />
        <div className="text-xs text-text-secondary text-center">분할 매수를 선택하세요 (최대 {maxSplit}장)</div>
        <div className="grid grid-cols-5 gap-2">
          {Array.from({ length: maxSplit }, (_, i) => i + 1).map(n => (
            <button
              key={n}
              onClick={() => { setSplitCount(n); setCards(Array.from({ length: n }, newCard)); }}
              className="aspect-square bg-bg-secondary hover:bg-accent-indigo border border-border-color text-white text-lg font-bold rounded-lg transition-colors"
            >{n}</button>
          ))}
        </div>
      </div>
    );
  }

  // ─── 3. 입력 폼 ──────────────────────────────────────
  return (
    <div className="w-full max-w-md mx-auto p-5 flex flex-col gap-4">
      <Header
        onBack={mode === 'split' ? goBackToSplitCountSelect : goBackToModeSelect}
        title="카드결제등록"
        backLabel={mode === 'split' ? '‹ 매수 선택' : '‹ 결제 방식'}
      />

      {/* 상단 분류 드롭다운 */}
      <div className="bg-bg-secondary border border-accent-indigo/40 rounded-xl p-3 flex flex-col gap-1">
        <label className="text-[11px] text-accent-indigo font-semibold">분류 *</label>
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="bg-bg-card border border-border-color rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent-indigo"
        >
          {categories.length === 0 && <option value="">(분류 없음)</option>}
          {categories.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
        <div className="text-[10px] text-text-secondary">선택 분류 — <strong className="text-amber-400">{contentLabel || '-'}</strong> · {mode === 'split' ? `분할결제 ${splitCount}장` : '단일 결제'}</div>
      </div>

      {mode === 'single' && (
        <CardSlot
          label="카드 영수증 사진 (OCR 자동 추출)"
          data={single}
          onPhoto={handleSingleOcr}
          onClear={() => setSingle(s => ({ ...s, photoUrl: '' }))}
          onField={(k, v) => setSingle(s => ({ ...s, [k]: v }))}
        />
      )}
      {mode === 'split' && cards.map((c, idx) => (
        <CardSlot
          key={idx}
          label={`카드 영수증 #${idx + 1}`}
          data={c}
          onPhoto={(file) => handleCardOcr(idx, file)}
          onClear={() => setCardField(idx, 'photoUrl', '')}
          onField={(k, v) => setCardField(idx, k, v)}
        />
      ))}

      {mode === 'split' && (
        <div className="bg-amber-500/10 border border-amber-500/40 rounded-xl p-3 flex items-center justify-between">
          <span className="text-xs text-amber-300 font-semibold">▼ 분할결제 합계</span>
          <span className="text-lg text-amber-400 font-bold">{formatPrice(splitTotal)} 원</span>
        </div>
      )}

      <div className="bg-bg-secondary border border-border-color rounded-xl p-3 flex flex-col gap-3">
        <Field label="결제 일자" type="date" value={common.date} onChange={(v) => setC('date', v)} />
        <Field label="구매자 *" value={common.buyer} onChange={(v) => setC('buyer', v)} placeholder="구매자 성명" required />
      </div>

      <div className="bg-bg-secondary border border-accent-indigo/40 rounded-xl p-3 flex flex-col gap-3">
        <div className="text-[11px] text-accent-indigo font-semibold">▼ 입력자 정보 (한 번 입력하면 다음 등록에 자동 채워집니다)</div>
        <Field label="사업부" value={common.businessUnit} onChange={(v) => setC('businessUnit', v)} placeholder="예: 교육사업부" />
        <Field label="소속" value={common.registrantOrg} onChange={(v) => setC('registrantOrg', v)} placeholder="예: 영업1팀" />
        <Field label="성명" value={common.registrantName} onChange={(v) => setC('registrantName', v)} placeholder="성명" />
      </div>

      <button
        onClick={handleSubmit}
        disabled={submitState === 'submitting'}
        className="w-full py-3 bg-accent-indigo hover:bg-accent-indigo/90 text-white font-bold rounded-xl text-sm disabled:opacity-50"
      >
        {submitState === 'submitting' ? '등록 중...' : (mode === 'split' ? `${splitCount}장 일괄 등록` : '등록하기')}
      </button>
      <button onClick={resetForm} className="w-full py-2 bg-slate-700 text-white text-xs rounded-lg">초기화 (입력자 정보는 유지)</button>
    </div>
  );
}

function Header({ onBack, title, backLabel }) {
  return (
    <div className="flex items-center justify-between">
      <button onClick={onBack} className="text-xs text-text-secondary">{backLabel}</button>
      <h2 className="text-base font-bold text-white">{title}</h2>
      <div style={{ width: 80 }} />
    </div>
  );
}

function BigCard({ color, emoji, title, sub, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`bg-gradient-to-br ${color} text-white p-5 rounded-2xl text-left shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-transform`}
    >
      <div className="flex items-center gap-3">
        <div className="text-3xl">{emoji}</div>
        <div className="flex-1">
          <div className="font-bold text-base">{title}</div>
          <div className="text-xs opacity-90 mt-1">{sub}</div>
        </div>
        <div className="text-xl opacity-70">›</div>
      </div>
    </button>
  );
}

function CardSlot({ label, data, onPhoto, onClear, onField }) {
  const fileInputId = React.useMemo(() => `cardphoto_${Math.random().toString(36).slice(2, 8)}`, []);
  return (
    <div className="bg-bg-secondary border border-border-color rounded-xl p-3 flex flex-col gap-3">
      <div className="text-xs text-text-secondary font-semibold">{label}</div>
      {!data.photoUrl ? (
        <label htmlFor={fileInputId} className="block w-full py-6 bg-bg-card border-2 border-dashed border-border-color rounded-lg text-center text-text-secondary text-xs cursor-pointer">
          📷 사진 첨부 → CAT ID / 금액 / 카드사 / 카드번호 / 승인번호 자동 입력
          <input id={fileInputId} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onPhoto(e.target.files[0])} />
        </label>
      ) : (
        <div className="relative">
          <img src={data.photoUrl} alt="카드영수증" className="w-full max-h-40 object-contain rounded-lg" />
          {data.ocrLoading && <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-white text-xs">분석 중...</div>}
          <button onClick={onClear} className="absolute top-1 right-1 w-6 h-6 bg-red-600 text-white rounded-full text-xs">×</button>
        </div>
      )}
      <Field label="CAT ID" value={data.catId} onChange={(v) => onField('catId', v)} placeholder="OCR 자동 추출" />
      <Field
        label="금액 (원) *"
        value={formatPrice(data.amount)}
        onChange={(v) => onField('amount', v.replace(/\D/g, ''))}
        placeholder="0"
        inputMode="numeric"
      />
      <Field label="카드사" value={data.cardIssuer} onChange={(v) => onField('cardIssuer', v)} placeholder="OCR 자동 추출 (예: KB국민카드)" />
      <Field label="카드번호" value={data.cardNumber} onChange={(v) => onField('cardNumber', v)} placeholder="OCR 자동 추출" />
      <Field label="승인번호" value={data.approvalNo} onChange={(v) => onField('approvalNo', v)} placeholder="OCR 자동 추출" />
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = 'text', required, inputMode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] text-text-secondary font-semibold">{label}</label>
      <input
        type={type}
        inputMode={inputMode}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="bg-bg-card border border-border-color rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent-indigo"
      />
    </div>
  );
}
