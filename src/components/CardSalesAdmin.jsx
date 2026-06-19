import React, { useState, useEffect } from 'react';
import { API_BASE } from '../config';
import { Download, Search, RotateCw, Mail, Save, Eye, Trash2, Plus, Tag } from 'lucide-react';

// 카드결제 등록 어드민 화면 — 어드민 인증된 상태에서만 노출 (부모 AdminDashboard 내부에서 렌더)
export default function CardSalesAdmin() {
  const [filter, setFilter] = useState({
    from: '', to: '', type: '', businessUnit: '', buyer: '', registrantOrg: '', registrantName: ''
  });
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  // 일일보고 수신 이메일 설정
  const [reportEmail, setReportEmail] = useState('');
  const [reportEmailLoading, setReportEmailLoading] = useState(false);
  const [reportEmailSaved, setReportEmailSaved] = useState(false);

  // 분류 마스터 관리
  const [categories, setCategories] = useState([]);
  const [newCatLabel, setNewCatLabel] = useState('');
  const [newCatMax, setNewCatMax] = useState(10);

  const fetchCategories = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/card-sales-categories`);
      const json = await res.json();
      if (json.success) setCategories(json.data || []);
    } catch (err) { console.error('분류 로드 실패:', err); }
  };

  const addCategory = async () => {
    if (!newCatLabel.trim()) { alert('분류 이름을 입력해 주세요.'); return; }
    try {
      const res = await fetch(`${API_BASE}/api/card-sales-categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: newCatLabel.trim(), maxSplit: Number(newCatMax) || 10 })
      });
      const json = await res.json();
      if (json.success) {
        setNewCatLabel(''); setNewCatMax(10);
        await fetchCategories();
      } else {
        alert('분류 추가 실패: ' + (json.error || '알 수 없는 오류'));
      }
    } catch (err) { alert('분류 추가 요청 실패: ' + err.message); }
  };

  const deleteCategory = async (cat) => {
    if (!window.confirm(`분류 "${cat.label}"을(를) 삭제하시겠습니까?\n(기존 등록 데이터는 그대로 유지됩니다)`)) return;
    try {
      const res = await fetch(`${API_BASE}/api/card-sales-categories/${cat.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) await fetchCategories();
      else alert('삭제 실패: ' + (json.error || '알 수 없는 오류'));
    } catch (err) { alert('삭제 요청 실패: ' + err.message); }
  };

  // 상세보기/수정 모달
  const [editRow, setEditRow] = useState(null); // null | row 객체
  const [editForm, setEditForm] = useState({ buyer: '', registrantOrg: '', registrantName: '' });
  const [editSaving, setEditSaving] = useState(false);

  const openEdit = (row) => {
    setEditRow(row);
    setEditForm({
      buyer: row.buyer || '',
      registrantOrg: row.registrantOrg || '',
      registrantName: row.registrantName || ''
    });
  };
  const closeEdit = () => { setEditRow(null); };

  const saveEdit = async () => {
    if (!editRow) return;
    if (!editForm.buyer.trim()) { alert('구매자는 필수입니다.'); return; }
    setEditSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/card-sales/${editRow.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm)
      });
      const json = await res.json();
      if (json.success) {
        closeEdit();
        await fetchData();
      } else {
        alert('수정 실패: ' + (json.error || '알 수 없는 오류'));
      }
    } catch (err) {
      alert('수정 요청 실패: ' + err.message);
    } finally {
      setEditSaving(false);
    }
  };

  const deleteRow = async (row) => {
    if (!window.confirm(`이 카드결제 등록(ID ${row.id}, ${row.buyer})을 삭제하시겠습니까?`)) return;
    try {
      const res = await fetch(`${API_BASE}/api/card-sales/${row.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        await fetchData();
      } else {
        alert('삭제 실패: ' + (json.error || '알 수 없는 오류'));
      }
    } catch (err) {
      alert('삭제 요청 실패: ' + err.message);
    }
  };

  const fetchReportEmail = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/system/config/daily-report-email`);
      const json = await res.json();
      if (json.success) setReportEmail(json.email || '');
    } catch (err) { console.error('수신 이메일 로드 실패:', err); }
  };

  const saveReportEmail = async () => {
    // 콤마/세미콜론 구분 다수 수신자 지원 — 각 항목 검증
    const parts = (reportEmail || '').split(/[,;]/).map(s => s.trim()).filter(Boolean);
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const invalid = parts.filter(p => !emailRegex.test(p));
    if (parts.length === 0 || invalid.length > 0) {
      alert(invalid.length > 0
        ? `유효하지 않은 이메일이 포함되어 있습니다:\n${invalid.join('\n')}`
        : '이메일을 입력해 주세요.');
      return;
    }
    setReportEmailLoading(true);
    setReportEmailSaved(false);
    try {
      const res = await fetch(`${API_BASE}/api/system/config/daily-report-email`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: reportEmail })
      });
      const json = await res.json();
      if (json.success) {
        setReportEmail(json.email); // 서버 정규화 결과로 갱신
        setReportEmailSaved(true);
        setTimeout(() => setReportEmailSaved(false), 2500);
      } else {
        alert('저장 실패: ' + (json.error || '알 수 없는 오류'));
      }
    } catch (err) {
      alert('저장 요청 실패: ' + err.message);
    } finally {
      setReportEmailLoading(false);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      Object.entries(filter).forEach(([k, v]) => { if (v) q.append(k, v); });
      const res = await fetch(`${API_BASE}/api/card-sales?${q.toString()}`);
      const json = await res.json();
      if (json.success) setRows(json.data || []);
    } catch (err) {
      console.error('카드결제 조회 실패:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); fetchReportEmail(); fetchCategories(); }, []);

  const downloadExcel = () => {
    const q = new URLSearchParams();
    Object.entries(filter).forEach(([k, v]) => { if (v) q.append(k, v); });
    const url = `${API_BASE}/api/card-sales/export?${q.toString()}`;
    window.open(url, '_blank');
  };

  const resetFilter = () => {
    setFilter({ from: '', to: '', type: '', businessUnit: '', buyer: '', registrantOrg: '', registrantName: '' });
  };

  const setF = (k, v) => setFilter(prev => ({ ...prev, [k]: v }));

  return (
    <div className="w-full flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white">카드결제 등록 관리</h2>
        <div className="flex gap-2">
          <button onClick={fetchData} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white text-xs rounded-lg">
            <RotateCw className="w-3.5 h-3.5" /> 새로고침
          </button>
          <button onClick={downloadExcel} className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs rounded-lg">
            <Download className="w-3.5 h-3.5" /> 엑셀 다운로드
          </button>
        </div>
      </div>

      {/* 일일보고 수신 이메일 설정 */}
      <div className="bg-bg-secondary border border-border-color rounded-xl p-3 flex items-center gap-3 text-xs">
        <Mail className="w-4 h-4 text-accent-indigo flex-shrink-0" />
        <div className="text-text-secondary whitespace-nowrap">일일보고 수신 이메일</div>
        <input
          type="text"
          value={reportEmail}
          onChange={(e) => setReportEmail(e.target.value)}
          placeholder="a@x.com, b@y.com (콤마로 다수 가능)"
          className="flex-1 bg-bg-card border border-border-color rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-accent-indigo"
        />
        <button
          onClick={saveReportEmail}
          disabled={reportEmailLoading}
          className="flex items-center gap-1 px-3 py-1 bg-accent-indigo hover:bg-accent-indigo/90 text-white text-xs rounded disabled:opacity-50 whitespace-nowrap"
        >
          <Save className="w-3 h-3" /> {reportEmailLoading ? '저장 중...' : '저장'}
        </button>
        {reportEmailSaved && <span className="text-emerald-400 text-[11px] whitespace-nowrap">✓ 저장됨</span>}
      </div>

      {/* 분류 관리 — 추가/삭제 */}
      <div className="bg-bg-secondary border border-border-color rounded-xl p-3 flex flex-col gap-2 text-xs">
        <div className="flex items-center gap-2 text-text-secondary">
          <Tag className="w-4 h-4 text-accent-indigo" />
          <span className="font-semibold">카드결제 분류 관리</span>
          <span className="text-[10px]">— 어드민이 등록한 분류가 카드결제등록 페이지의 드롭다운에 노출됩니다</span>
        </div>
        <div className="flex flex-wrap gap-1">
          {categories.length === 0 && <span className="text-text-secondary text-[11px]">등록된 분류가 없습니다.</span>}
          {categories.map(c => (
            <span key={c.id} className="inline-flex items-center gap-1 px-2 py-1 bg-bg-card border border-border-color rounded-md text-[11px]">
              <span className="text-white font-semibold">{c.label}</span>
              <span className="text-text-secondary">(max {c.maxSplit})</span>
              <button onClick={() => deleteCategory(c)} className="ml-1 text-red-400 hover:text-red-300" title="삭제">
                <Trash2 className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2 pt-1">
          <input
            type="text"
            value={newCatLabel}
            onChange={(e) => setNewCatLabel(e.target.value)}
            placeholder="새 분류 이름 (예: LAS On 파트장)"
            className="flex-1 bg-bg-card border border-border-color rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-accent-indigo"
          />
          <label className="text-[10px] text-text-secondary whitespace-nowrap">최대 매수</label>
          <input
            type="number"
            min={1} max={20}
            value={newCatMax}
            onChange={(e) => setNewCatMax(e.target.value)}
            className="w-16 bg-bg-card border border-border-color rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-accent-indigo"
          />
          <button onClick={addCategory} className="flex items-center gap-1 px-3 py-1 bg-accent-indigo hover:bg-accent-indigo/90 text-white text-xs rounded whitespace-nowrap">
            <Plus className="w-3 h-3" /> 추가
          </button>
        </div>
      </div>

      {/* 필터 패널 — 데스크탑 1줄 배치, 모바일은 자동 wrap */}
      <div className="bg-bg-secondary border border-border-color rounded-xl p-3 flex flex-wrap items-end gap-2 text-xs">
        <Filter label="기간 시작" type="date" value={filter.from} onChange={(v) => setF('from', v)} />
        <Filter label="기간 종료" type="date" value={filter.to} onChange={(v) => setF('to', v)} />
        <FilterSelect label="종류" value={filter.type} onChange={(v) => setF('type', v)} options={[
          { v: '', t: '전체' },
          { v: 'dok_teacher', t: '독서지도사' },
          { v: 'las_owner', t: '점주보증금' }
        ]} />
        <Filter label="사업부" value={filter.businessUnit} onChange={(v) => setF('businessUnit', v)} placeholder="포함" />
        <Filter label="구매자" value={filter.buyer} onChange={(v) => setF('buyer', v)} placeholder="포함" />
        <Filter label="입력자 소속" value={filter.registrantOrg} onChange={(v) => setF('registrantOrg', v)} placeholder="포함" />
        <Filter label="입력자 성명" value={filter.registrantName} onChange={(v) => setF('registrantName', v)} placeholder="포함" />
        <div className="flex items-end gap-1 flex-shrink-0">
          <button onClick={fetchData} className="py-1.5 px-3 bg-accent-indigo text-white rounded-lg flex items-center justify-center gap-1 whitespace-nowrap">
            <Search className="w-3 h-3" /> 검색
          </button>
          <button onClick={resetFilter} className="px-2 py-1.5 bg-slate-700 text-white rounded-lg whitespace-nowrap">초기화</button>
        </div>
      </div>

      {/* 결과 테이블 */}
      <div className="bg-bg-secondary border border-border-color rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border-color">
          <div className="text-xs text-text-secondary">총 <strong className="text-white">{rows.length}</strong>건</div>
          {loading && <div className="text-xs text-amber-400">로딩 중...</div>}
        </div>
        <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-800 text-text-secondary sticky top-0">
              <tr>
                <th className="p-2 text-left">번호</th>
                <th className="p-2 text-left">날짜</th>
                <th className="p-2 text-left">CAT ID</th>
                <th className="p-2 text-left">사업부</th>
                <th className="p-2 text-left">구매자</th>
                <th className="p-2 text-left">내용</th>
                <th className="p-2 text-right">금액</th>
                <th className="p-2 text-left">카드사</th>
                <th className="p-2 text-left">카드번호</th>
                <th className="p-2 text-left">승인번호</th>
                <th className="p-2 text-left">담당</th>
                <th className="p-2 text-center">관리</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && !loading && (
                <tr><td colSpan={12} className="p-8 text-center text-text-secondary">조회된 데이터가 없습니다.</td></tr>
              )}
              {rows.map((r, i) => (
                <tr key={r.id} className={`border-t border-border-color hover:bg-white/5 ${r.transactionGroupId ? 'bg-amber-500/5' : ''}`}>
                  <td className="p-2 text-slate-400">
                    {i + 1}
                    {r.transactionGroupId && (
                      <span title={`분할결제 그룹 ${r.transactionGroupId.slice(0,8)}`} className="ml-1 inline-block px-1 py-0.5 bg-amber-500/20 text-amber-300 text-[9px] font-bold rounded">
                        🧾{r.transactionGroupId.slice(0,4)}
                      </span>
                    )}
                  </td>
                  <td className="p-2 font-mono">{r.date}</td>
                  <td className="p-2 font-mono text-[11px]">{r.catId || '-'}</td>
                  <td className="p-2">{r.businessUnit || '-'}</td>
                  <td className="p-2 font-semibold text-white">{r.buyer}</td>
                  <td className="p-2">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${r.type === 'dok_teacher' ? 'bg-sky-500/20 text-sky-300' : 'bg-emerald-500/20 text-emerald-300'}`}>
                      {r.content}
                    </span>
                  </td>
                  <td className="p-2 text-right text-amber-400 font-semibold">{Number(r.amount || 0).toLocaleString()}</td>
                  <td className="p-2 text-[11px]">{r.cardIssuer || '-'}</td>
                  <td className="p-2 font-mono text-[11px]">{r.cardNumber || '-'}</td>
                  <td className="p-2 font-mono text-[11px]">{r.approvalNo || '-'}</td>
                  <td className="p-2 text-text-secondary text-[11px]">
                    {[r.registrantOrg, r.registrantName].filter(Boolean).join('/') || '-'}
                  </td>
                  <td className="p-2 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <button
                        onClick={() => openEdit(r)}
                        className="w-7 h-7 bg-slate-800 hover:bg-accent-indigo border border-border-color rounded-md flex items-center justify-center text-white transition-colors"
                        title="상세보기 / 수정"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => deleteRow(r)}
                        className="w-7 h-7 bg-slate-800 hover:bg-red-600 border border-border-color rounded-md flex items-center justify-center text-red-400 hover:text-white transition-colors"
                        title="삭제"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 상세보기 / 수정 모달 */}
      {editRow && (
        <div className="fixed inset-0 bg-black/85 z-[1000] flex items-center justify-center p-4">
          <div className="bg-bg-secondary border border-border-color w-full max-w-md rounded-2xl overflow-hidden shadow-2xl">
            <div className="px-5 py-4 border-b border-border-color flex justify-between items-center bg-slate-800/40">
              <h3 className="text-white font-semibold text-sm">카드결제 상세 (ID {editRow.id})</h3>
              <button onClick={closeEdit} className="text-xl text-text-secondary hover:text-white">×</button>
            </div>
            <div className="p-5 flex flex-col gap-3 text-xs">
              <div className="grid grid-cols-2 gap-2 bg-bg-card p-3 rounded-lg border border-border-color text-text-secondary">
                <div>날짜: <span className="text-white font-mono">{editRow.date}</span></div>
                <div>종류: <span className="text-white">{editRow.content}</span></div>
                <div>사업부: <span className="text-white">{editRow.businessUnit || '-'}</span></div>
                <div>금액: <span className="text-amber-400 font-semibold">{Number(editRow.amount || 0).toLocaleString()}원</span></div>
                <div>CAT ID: <span className="text-white font-mono">{editRow.catId || '-'}</span></div>
                <div>승인번호: <span className="text-white font-mono">{editRow.approvalNo || '-'}</span></div>
                <div>카드사: <span className="text-white">{editRow.cardIssuer || '-'}</span></div>
                <div className="col-span-2">카드번호: <span className="text-white font-mono">{editRow.cardNumber || '-'}</span></div>
              </div>
              <div className="border-t border-border-color pt-3 flex flex-col gap-3">
                <div className="text-accent-indigo font-semibold text-[11px]">▼ 수정 가능</div>
                <EditField label="구매자 *" value={editForm.buyer} onChange={(v) => setEditForm({ ...editForm, buyer: v })} />
                <EditField label="담당 소속" value={editForm.registrantOrg} onChange={(v) => setEditForm({ ...editForm, registrantOrg: v })} />
                <EditField label="담당 성명" value={editForm.registrantName} onChange={(v) => setEditForm({ ...editForm, registrantName: v })} />
              </div>
              <div className="flex gap-2 mt-2">
                <button onClick={closeEdit} className="flex-1 py-2 bg-slate-700 text-white text-xs rounded-lg">취소</button>
                <button
                  onClick={saveEdit}
                  disabled={editSaving}
                  className="flex-1 py-2 bg-accent-indigo hover:bg-accent-indigo/90 text-white text-xs rounded-lg disabled:opacity-50"
                >
                  {editSaving ? '저장 중...' : '저장'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EditField({ label, value, onChange }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] text-text-secondary font-semibold">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-bg-card border border-border-color rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-accent-indigo w-full"
      />
    </div>
  );
}

function Filter({ label, value, onChange, type = 'text', placeholder }) {
  return (
    <div className="flex flex-col gap-1 flex-1 min-w-[110px]">
      <label className="text-[10px] text-text-secondary font-semibold">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="bg-bg-card border border-border-color rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-accent-indigo w-full" />
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }) {
  return (
    <div className="flex flex-col gap-1 flex-1 min-w-[110px]">
      <label className="text-[10px] text-text-secondary font-semibold">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="bg-bg-card border border-border-color rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-accent-indigo w-full">
        {options.map(o => <option key={o.v} value={o.v}>{o.t}</option>)}
      </select>
    </div>
  );
}
