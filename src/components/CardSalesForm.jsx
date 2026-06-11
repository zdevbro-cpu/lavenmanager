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

// 카드결제등록 폼 — 진입 시 종류 선택 → 선택 후 입력 폼 표시
// props: onBack = () => void
export default function CardSalesForm({ onBack }) {
  const [type, setType] = useState(null); // null | 'dok_teacher' | 'las_owner'
  const isDok = type === 'dok_teacher';
  const title = '카드결제등록';
  const contentLabel = isDok ? '독서지도사' : '점주보증금';

  // 입력자 정보 localStorage 로드 (없으면 기본값 — 사업부: 교육사업부)
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

  const [form, setForm] = useState(() => {
    const reg = loadRegistrant();
    return {
      date: new Date().toISOString().slice(0, 10),
      catId: '',
      businessUnit: reg.businessUnit,
      buyer: '',
      amount: '',
      cardNumber: '',
      approvalNo: '',
      registrantOrg: reg.registrantOrg,
      registrantName: reg.registrantName
    };
  });
  const [ocrLoading, setOcrLoading] = useState(false);
  const [photoUrl, setPhotoUrl] = useState('');
  const [submitState, setSubmitState] = useState('idle'); // idle | submitting | done

  const setField = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const handleOcrUpload = async (file) => {
    if (!file) return;
    const r = new FileReader();
    r.onload = (e) => setPhotoUrl(e.target.result);
    r.readAsDataURL(file);

    setOcrLoading(true);
    const fd = new FormData();
    fd.append('photo', file);
    fd.append('type', 'sales');
    try {
      const res = await fetch(`${API_BASE}/api/ocr`, { method: 'POST', body: fd });
      const json = await res.json();
      if (json.success && json.data) {
        setForm(prev => ({
          ...prev,
          catId: json.data.terminalNo || prev.catId,
          amount: json.data.amount || prev.amount,
          cardNumber: json.data.cardNumber || prev.cardNumber,
          approvalNo: json.data.approvalNo || prev.approvalNo,
          date: (json.data.transactionDate && String(json.data.transactionDate).slice(0, 10)) || prev.date
        }));
      }
    } catch (err) {
      alert('카드영수증 OCR 분석 실패: ' + err.message);
    } finally {
      setOcrLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!form.buyer || !form.amount) {
      alert('구매자, 금액은 필수 입력입니다.');
      return;
    }
    setSubmitState('submitting');
    try {
      const res = await fetch(`${API_BASE}/api/card-sales`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, type })
      });
      const json = await res.json();
      if (json.success) {
        // 입력자 정보 localStorage 저장 (다음 등록 시 재사용)
        try {
          localStorage.setItem(REGISTRANT_LS_KEY, JSON.stringify({
            businessUnit: form.businessUnit,
            registrantOrg: form.registrantOrg,
            registrantName: form.registrantName
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

  const resetAll = () => {
    const reg = loadRegistrant(); // 입력자 정보는 보존
    setForm({
      date: new Date().toISOString().slice(0, 10),
      catId: '', businessUnit: reg.businessUnit, buyer: '', amount: '',
      cardNumber: '', approvalNo: '',
      registrantOrg: reg.registrantOrg, registrantName: reg.registrantName
    });
    setPhotoUrl('');
    setSubmitState('idle');
  };

  // 진입 시 종류 선택 화면
  if (!type) {
    return (
      <div className="w-full max-w-md mx-auto p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <button onClick={onBack} className="text-xs text-text-secondary">‹ 처음으로</button>
          <h2 className="text-base font-bold text-white">{title}</h2>
          <div style={{ width: 48 }} />
        </div>
        <p className="text-xs text-text-secondary text-center mb-2">등록할 결제 종류를 선택하세요</p>
        <button
          onClick={() => setType('dok_teacher')}
          className="bg-gradient-to-br from-sky-500 to-blue-600 text-white p-5 rounded-2xl text-left shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-transform"
        >
          <div className="flex items-center gap-3">
            <div className="text-3xl">📚</div>
            <div className="flex-1">
              <div className="font-bold text-base">독서지도사</div>
              <div className="text-xs opacity-90 mt-1">독지사 카드결제 건을 등록합니다.</div>
            </div>
            <div className="text-xl opacity-70">›</div>
          </div>
        </button>
        <button
          onClick={() => setType('las_owner')}
          className="bg-gradient-to-br from-emerald-500 to-teal-600 text-white p-5 rounded-2xl text-left shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-transform"
        >
          <div className="flex items-center gap-3">
            <div className="text-3xl">🏪</div>
            <div className="flex-1">
              <div className="font-bold text-base">점주보증금</div>
              <div className="text-xs opacity-90 mt-1">LAS매장점주 카드결제 건을 등록합니다.</div>
            </div>
            <div className="text-xl opacity-70">›</div>
          </div>
        </button>
      </div>
    );
  }

  if (submitState === 'done') {
    return (
      <div className="w-full max-w-md mx-auto p-5 flex flex-col gap-4 items-center text-center">
        <div className="text-5xl">✅</div>
        <h2 className="text-lg font-bold text-white">등록 완료</h2>
        <p className="text-sm text-text-secondary">{title} 건이 정상 저장되었습니다.</p>
        <div className="flex gap-2 w-full mt-2">
          <button onClick={resetAll} className="flex-1 py-2 bg-accent-indigo text-white rounded-lg text-sm font-semibold">추가 등록</button>
          <button onClick={onBack} className="flex-1 py-2 bg-slate-700 text-white rounded-lg text-sm font-semibold">처음으로</button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <button onClick={() => setType(null)} className="text-xs text-text-secondary">‹ 종류 선택</button>
        <h2 className="text-base font-bold text-white">{title}</h2>
        <div style={{ width: 60 }} />
      </div>
      <div className="text-[11px] text-text-secondary text-center">선택 종류 — 내용 컬럼은 <strong className="text-amber-400">{contentLabel}</strong>로 자동 저장됩니다.</div>

      {/* 카드영수증 사진 첨부 */}
      <div className="bg-bg-secondary border border-border-color rounded-xl p-3">
        <div className="text-xs text-text-secondary mb-2 font-semibold">카드 영수증 사진 (OCR 자동 추출)</div>
        {!photoUrl ? (
          <label className="block w-full py-8 bg-bg-card border-2 border-dashed border-border-color rounded-lg text-center text-text-secondary text-xs cursor-pointer">
            📷 사진을 첨부하면 결제일자 / CAT ID / 금액 / 카드번호 / 승인번호가 자동 입력됩니다
            <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handleOcrUpload(e.target.files[0])} />
          </label>
        ) : (
          <div className="relative">
            <img src={photoUrl} alt="카드영수증" className="w-full max-h-48 object-contain rounded-lg" />
            {ocrLoading && <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-white text-xs">분석 중...</div>}
            <button onClick={() => setPhotoUrl('')} className="absolute top-1 right-1 w-6 h-6 bg-red-600 text-white rounded-full text-xs">×</button>
          </div>
        )}
      </div>

      {/* 카드결제 정보 (사업부는 입력자 정보 박스로 이동) */}
      <div className="bg-bg-secondary border border-border-color rounded-xl p-3 flex flex-col gap-3">
        <Field label="결제 일자" type="date" value={form.date} onChange={(v) => setField('date', v)} />
        <Field label="CAT ID (단말기번호)" value={form.catId} onChange={(v) => setField('catId', v)} placeholder="OCR 자동 추출" />
        <Field label="구매자 *" value={form.buyer} onChange={(v) => setField('buyer', v)} placeholder="구매자 성명" required />
        <Field
          label="금액 (원) *"
          value={formatPrice(form.amount)}
          onChange={(v) => setField('amount', v.replace(/\D/g, ''))}
          placeholder="0"
          required
          inputMode="numeric"
        />
        <Field label="카드번호" value={form.cardNumber} onChange={(v) => setField('cardNumber', v)} placeholder="OCR 자동 추출" />
        <Field label="승인번호" value={form.approvalNo} onChange={(v) => setField('approvalNo', v)} placeholder="OCR 자동 추출" />
      </div>

      {/* 입력자 정보 (사업부 통합 + localStorage 재사용) */}
      <div className="bg-bg-secondary border border-accent-indigo/40 rounded-xl p-3 flex flex-col gap-3">
        <div className="text-[11px] text-accent-indigo font-semibold">▼ 입력자 정보 (한 번 입력하면 다음 등록에 자동 채워집니다)</div>
        <Field label="사용 (사업부)" value={form.businessUnit} onChange={(v) => setField('businessUnit', v)} placeholder="예: 교육사업부" />
        <Field label="입력자 소속" value={form.registrantOrg} onChange={(v) => setField('registrantOrg', v)} placeholder="예: 영업1팀" />
        <Field label="입력자 성명" value={form.registrantName} onChange={(v) => setField('registrantName', v)} placeholder="입력자 성명" />
      </div>

      <button
        onClick={handleSubmit}
        disabled={submitState === 'submitting'}
        className="w-full py-3 bg-accent-indigo hover:bg-accent-indigo/90 text-white font-bold rounded-xl text-sm disabled:opacity-50"
      >
        {submitState === 'submitting' ? '등록 중...' : '등록하기'}
      </button>
      <button onClick={resetAll} className="w-full py-2 bg-slate-700 text-white text-xs rounded-lg">초기화 (입력자 정보는 유지)</button>
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
