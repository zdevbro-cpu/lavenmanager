import React, { useState, useEffect } from 'react';
import { API_BASE } from '../config';
import { Download, Search, RotateCw } from 'lucide-react';

// 카드결제 등록 어드민 화면 — 어드민 인증된 상태에서만 노출 (부모 AdminDashboard 내부에서 렌더)
export default function CardSalesAdmin() {
  const [filter, setFilter] = useState({
    from: '', to: '', type: '', businessUnit: '', buyer: '', registrantOrg: '', registrantName: ''
  });
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

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

  useEffect(() => { fetchData(); }, []);

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
                <th className="p-2 text-left">카드번호</th>
                <th className="p-2 text-left">승인번호</th>
                <th className="p-2 text-left">입력자</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && !loading && (
                <tr><td colSpan={10} className="p-8 text-center text-text-secondary">조회된 데이터가 없습니다.</td></tr>
              )}
              {rows.map((r, i) => (
                <tr key={r.id} className="border-t border-border-color hover:bg-white/5">
                  <td className="p-2 text-slate-400">{i + 1}</td>
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
                  <td className="p-2 font-mono text-[11px]">{r.cardNumber || '-'}</td>
                  <td className="p-2 font-mono text-[11px]">{r.approvalNo || '-'}</td>
                  <td className="p-2 text-text-secondary text-[11px]">
                    {r.registrantOrg || '-'}{r.registrantName ? ` / ${r.registrantName}` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
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
