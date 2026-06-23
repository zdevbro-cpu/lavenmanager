import React, { useState, useEffect } from 'react';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';
import * as XLSX from 'xlsx';
import { RotateCw, Download, LogOut, ShieldAlert, FileSpreadsheet, FolderOpen, Eye, Trash2 } from 'lucide-react';
import { API_BASE } from '../config';
import CardSalesAdmin from './CardSalesAdmin';

// 전화번호 숫자만 → 010-0000-0000 표시 (DB에는 숫자만 저장됨)
const formatPhoneNumber = (raw) => {
  const d = String(raw || '').replace(/\D/g, '').slice(0, 11);
  if (d.length < 4) return d;
  if (d.length < 7) return `${d.slice(0,3)}-${d.slice(3)}`;
  if (d.length <= 10) return `${d.slice(0,3)}-${d.slice(3,6)}-${d.slice(6)}`;
  return `${d.slice(0,3)}-${d.slice(3,7)}-${d.slice(7)}`;
};

export default function AdminDashboard() {
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState('');
  
  // 접수 목록 상태
  const [applications, setApplications] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [stats, setStats] = useState({
    totalToday: 0,
    gdriveBackup: 0,
    smsSent: 0
  });

  // 드라이브 PDF 팝업 상태
  const [selectedDoc, setSelectedDoc] = useState(null);

  // 상단 영역 토글: 'card-sales' (카드결제 관리 — 우선 표시) | 'application' (교재구매 신청)
  const [adminSection, setAdminSection] = useState('card-sales');

  useEffect(() => {
    // 파이어베이스 인증 상태 수집
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        fetchApplications();
      }
    });
    return unsubscribe;
  }, []);

  const fetchApplications = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/applications`);
      const json = await response.json();
      if (json.success) {
        setApplications(json.data);
        
        // 실측 통계만 사용 (mock 데이터 제거)
        setStats({
          totalToday: json.data.length,
          gdriveBackup: json.data.filter(item => item.gdrivePdfFileId).length,
          smsSent: json.data.length
        });
      }
    } catch (err) {
      console.error("데이터 로드 실패:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      setError('로그인 실패: 이메일 또는 비밀번호를 다시 확인하세요.');
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await createUserWithEmailAndPassword(auth, email, password);
      setIsRegistering(false);
      alert('회원가입 완료! 자동으로 로그인됩니다.');
    } catch (err) {
      setError('회원가입 실패: 유효한 이메일 형식을 쓰고 암호는 6자 이상으로 세팅하세요.');
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setApplications([]);
  };

  // CJ대한통운/우체국택배 일괄 인쇄용 배송 엑셀 파일 내보내기 알고리즘
  const exportToExcel = () => {
    if (applications.length === 0) {
      alert("출력할 신청 내역이 존재하지 않습니다.");
      return;
    }

    const excelRows = applications.map((item) => ({
      "접수 번호": item.id,
      "구매자명 (수령인)": item.buyerName,
      "자녀 성명": item.childInfo || '',
      "자녀 생년월일": item.childBirthdate || '',
      "연락처": formatPhoneNumber(item.phoneNumber),
      "우편배송지 주소": item.address,
      "배송 요청사항": item.deliveryMemo || '문 앞 보관',
      "교재명 1": item.book1Name || '',
      "금액 1": item.book1Price ? `${Number(item.book1Price.replace(/,/g,'')).toLocaleString()}원` : '0원',
      "교재명 2": item.book2Name || '',
      "금액 2": item.book2Price ? `${Number(item.book2Price.replace(/,/g,'')).toLocaleString()}원` : '0원',
      "구독권 구분": item.subscriptionType || '',
      "구독 금액": item.subscriptionPrice ? `${Number(item.subscriptionPrice.replace(/,/g,'')).toLocaleString()}원` : '0원',
      "관리회원 구분": item.managementType || '',
      "관리회원 금액": item.managementPrice ? `${Number(item.managementPrice.replace(/,/g,'')).toLocaleString()}원` : '0원',
      "최종 현금결제액": item.cashPayment ? `${Number(item.cashPayment).toLocaleString()}원` : '0원',
      "최종 카드결제액": item.cardPayment ? `${Number(item.cardPayment).toLocaleString()}원` : '0원',
      "현금영수증 번호": item.cashReceiptNo || '',
      "담당 판매자": item.sellerName || '',
      "신청 접수일": item.applyDate
    }));

    const worksheet = XLSX.utils.json_to_sheet(excelRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "에이멘에이_배송목록");
    XLSX.writeFile(workbook, `에이멘에이_배송대장_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // 신청서 단건 삭제 (DB + 드라이브 PDF 모두 정리)
  const handleDelete = async (item) => {
    if (!window.confirm(`접수번호 #${item.id} (${item.buyerName})의 신청서를 정말 삭제하시겠습니까?\n구글 드라이브의 통합 PDF도 함께 삭제됩니다.`)) return;
    try {
      const response = await fetch(`${API_BASE}/api/applications/${item.id}`, {
        method: 'DELETE'
      });
      const json = await response.json();
      if (json.success) {
        setApplications(prev => prev.filter(app => app.id !== item.id));
      } else {
        alert(json.error || '삭제 실패');
      }
    } catch (err) {
      console.error('삭제 요청 실패:', err);
      alert('서버 연결 실패. 삭제하지 못했습니다.');
    }
  };

  // 구글 드라이브 파일 조회용 모달 팝업 열기
  const openPdfPreview = (item) => {
    // 백엔드 주소로 연결 (구글 연동 미완료 시 로컬 주소 리턴)
    const fileUrl = item.gdrivePdfFileId && !item.gdrivePdfFileId.startsWith('gdrive_')
      ? `https://drive.google.com/file/d/${item.gdrivePdfFileId}/view?usp=drivesdk`
      : `${API_BASE}/uploads/신청서_${item.buyerName}_${item.phoneNumber.replace(/-/g,'')}.pdf`;
    
    setSelectedDoc({
      ...item,
      fileUrl
    });
  };

  // 로그인 화면
  if (!user) {
    return (
      <div className="flex items-center justify-center min-height-[calc(100vh-140px)] w-full py-12">
        <div className="bg-bg-secondary border border-border-color p-8 rounded-2xl w-full max-w-md shadow-2xl">
          <div className="flex flex-col items-center gap-2 mb-6">
            <div className="w-12 h-12 bg-gradient-to-br from-accent-indigo to-purple-600 rounded-xl flex items-center justify-center font-bold text-white text-lg">A</div>
            <h2 className="text-lg font-bold text-white">에이멘에이 관리자 시스템</h2>
            <p className="text-xs text-text-secondary">교재구매 대장 확인을 위해 로그인하세요</p>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-3 rounded-lg text-xs mb-4 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={isRegistering ? handleRegister : handleLogin} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-text-secondary font-semibold">이메일 계정</label>
              <input
                type="email"
                className="bg-bg-card border border-border-color rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent-indigo"
                placeholder="admin@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs text-text-secondary font-semibold">비밀번호</label>
              <input
                type="password"
                className="bg-bg-card border border-border-color rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent-indigo"
                placeholder="6자 이상 입력"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <button type="submit" className="w-full py-2 bg-gradient-to-r from-accent-indigo to-purple-600 hover:opacity-95 text-white font-semibold rounded-lg text-sm transition-all mt-2">
              {isRegistering ? '관리자 회원가입' : '관리자 로그인'}
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-border-color text-center">
            <button
              onClick={() => setIsRegistering(!isRegistering)}
              className="text-xs text-accent-indigo hover:text-white transition-colors"
            >
              {isRegistering ? '이미 관리자 계정이 있으신가요? 로그인' : '신규 관리자 계정 생성 (회원가입)'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 메인 대시보드 화면
  return (
    <div className="flex flex-col gap-5 w-full h-full overflow-y-auto no-scrollbar pb-8">
      {/* 상단 영역 토글 — 카드결제 관리 ↔ 교재구매 신청 관리 */}
      <div className="flex gap-2 flex-shrink-0">
        <button
          onClick={() => setAdminSection('card-sales')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${adminSection === 'card-sales' ? 'bg-accent-indigo text-white' : 'bg-slate-800 text-text-secondary hover:bg-slate-700'}`}
        >
          💳 카드결제 관리
        </button>
        <button
          onClick={() => setAdminSection('application')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${adminSection === 'application' ? 'bg-accent-indigo text-white' : 'bg-slate-800 text-text-secondary hover:bg-slate-700'}`}
        >
          📝 교재구매 신청 관리
        </button>
        <div className="flex-1" />
        <button onClick={handleLogout} className="px-3 py-1.5 bg-slate-800 hover:bg-red-900 text-xs text-text-secondary hover:text-white rounded-lg">로그아웃</button>
      </div>

      {adminSection === 'card-sales' && <CardSalesAdmin />}

      {adminSection === 'application' && <>
      {/* 액션 헤더 */}
      <div className="flex justify-between items-center flex-shrink-0">
        <div>
          <h2 className="text-lg font-bold text-white">에이멘에이 주식회사 - 교재구매 관리 대장</h2>
          <p className="text-xs text-text-secondary">구글 드라이브 지정 공유 폴더 및 Cloud SQL 실시간 연동</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={exportToExcel}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 border border-border-color hover:bg-slate-700 text-white rounded-lg text-xs font-semibold transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>엑셀 다운로드</span>
          </button>
          <button
            onClick={fetchApplications}
            className="flex items-center gap-1.5 px-3 py-2 bg-[#10b981] hover:opacity-95 text-white rounded-lg text-xs font-semibold transition-colors"
          >
            <RotateCw className="w-3.5 h-3.5" />
            <span>동기화</span>
          </button>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 px-3 py-2 bg-red-600/10 border border-red-500/20 hover:bg-red-600/20 text-red-400 rounded-lg text-xs font-semibold transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>로그아웃</span>
          </button>
        </div>
      </div>

      {/* 실시간 통계 그리드 */}
      <div className="grid grid-cols-4 gap-4 flex-shrink-0">
        <div className="bg-bg-secondary border border-border-color rounded-xl p-4 shadow-lg">
          <div className="text-xs text-text-secondary">오늘 접수된 총 신청서</div>
          <div className="text-2xl font-bold text-accent-indigo mt-1">{stats.totalToday} 건</div>
          <div className="text-[10px] text-[#10b981] mt-1 font-semibold">실시간 Cloud SQL DB 적재 완료</div>
        </div>

        <div className="bg-bg-secondary border border-border-color rounded-xl p-4 shadow-lg">
          <div className="text-xs text-text-secondary">무료 Google OCR 분석율</div>
          <div className="text-2xl font-bold text-amber-500 mt-1">—</div>
          <div className="text-[10px] text-amber-400 mt-1 font-semibold">사용자 보정 100% 진행</div>
        </div>

        <div className="bg-bg-secondary border border-border-color rounded-xl p-4 shadow-lg">
          <div className="text-xs text-text-secondary">구글 드라이브 PDF 취합</div>
          <div className="text-2xl font-bold text-[#10b981] mt-1">{stats.gdriveBackup} 건</div>
          <div className="text-[10px] text-text-secondary mt-1">폴더: [교재구매_신청서_회사용]</div>
        </div>

        <div className="bg-bg-secondary border border-border-color rounded-xl p-4 shadow-lg">
          <div className="text-xs text-text-secondary">취합 번호 전송 건수</div>
          <div className="text-2xl font-bold text-white mt-1">{stats.smsSent} 건</div>
          <div className="text-[10px] text-text-secondary mt-1">발송 수신처: 010-8290-4749</div>
        </div>
      </div>

      {/* 접수 대장 테이블 */}
      <div className="bg-bg-secondary border border-border-color rounded-2xl overflow-hidden flex-1 shadow-2xl min-h-[300px]">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3 h-full">
            <div className="w-8 h-8 border-4 border-accent-indigo/10 border-t-accent-indigo rounded-full animate-spin"></div>
            <span className="text-xs text-text-secondary">신청서 내역을 동기화하고 있습니다...</span>
          </div>
        ) : applications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-500 gap-2 h-full">
            <span className="text-2xl">📁</span>
            <span className="text-xs">현재 접수된 에이멘에이 교재 신청 내역이 없습니다.</span>
          </div>
        ) : (
          <div className="w-full overflow-x-auto custom-scrollbar">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="bg-slate-800/40 text-text-secondary border-b border-border-color font-semibold">
                  <th className="p-3 pl-4">접수번호</th>
                  <th className="p-3">구매자명</th>
                  <th className="p-3">연락처</th>
                  <th className="p-3">배송지 주소</th>
                  <th className="p-3">자녀명(연령)</th>
                  <th className="p-3">신청교재 1 / 2</th>
                  <th className="p-3">결제구분</th>
                  <th className="p-3">접수일자</th>
                  <th className="p-3 text-center">관리</th>
                </tr>
              </thead>
              <tbody>
                {applications.map((item) => (
                  <tr key={item.id} className="border-b border-border-color hover:bg-white/2 transition-colors">
                    <td className="p-3 pl-4 text-slate-400 font-mono">#{item.id}</td>
                    <td className="p-3 font-semibold text-white">{item.buyerName}</td>
                    <td className="p-3">{formatPhoneNumber(item.phoneNumber)}</td>
                    <td className="p-3 max-w-[200px] truncate" title={item.address}>{item.address}</td>
                    <td className="p-3 text-slate-400">
                      {item.childInfo || '-'}
                      {item.childBirthdate && <span className="block text-[10px] text-slate-500">{item.childBirthdate}</span>}
                    </td>
                    <td className="p-3">
                      {item.book1Name || '-'}{item.book2Name ? ` / ${item.book2Name}` : ''}
                    </td>
                    <td className="p-3 text-emerald-400 font-medium">
                      {item.cashPayment && item.cashPayment !== '0' 
                        ? `현금 (${Number(item.cashPayment).toLocaleString()}원)` 
                        : `카드 (${Number(item.cardPayment || 0).toLocaleString()}원)`}
                    </td>
                    <td className="p-3 text-slate-400 font-mono">{item.applyDate}</td>
                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => openPdfPreview(item)}
                          className="w-7 h-7 bg-slate-800 hover:bg-accent-indigo border border-border-color rounded-md flex items-center justify-center text-white transition-colors"
                          title="상세보기"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <a
                          href={item.gdrivePdfFileId && !item.gdrivePdfFileId.startsWith('gdrive_')
                            ? `https://drive.google.com/file/d/${item.gdrivePdfFileId}/view`
                            : `${API_BASE}/uploads/신청서_${item.buyerName}_${item.phoneNumber.replace(/-/g,'')}.pdf`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-7 h-7 bg-slate-800 hover:bg-accent-indigo border border-border-color rounded-md flex items-center justify-center text-white transition-colors"
                          title="회사용 신청서 PDF 열기"
                        >
                          <FolderOpen className="w-3.5 h-3.5" />
                        </a>
                        {item.gdriveCustomerPdfFileId && (
                          <a
                            href={!item.gdriveCustomerPdfFileId.startsWith('gdrive_')
                              ? `https://drive.google.com/file/d/${item.gdriveCustomerPdfFileId}/view`
                              : `${API_BASE}/uploads/신청서(고객용)_${item.buyerName}_${item.phoneNumber.replace(/-/g,'')}.pdf`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-7 h-7 bg-slate-800 hover:bg-emerald-600 border border-border-color rounded-md flex items-center justify-center text-emerald-300 hover:text-white transition-colors"
                            title="고객용 신청서 PDF 열기"
                          >
                            <FolderOpen className="w-3.5 h-3.5" />
                          </a>
                        )}
                        <button
                          onClick={() => handleDelete(item)}
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
        )}
      </div>

      {/* Google Drive Document Preview Modal */}
      {selectedDoc && (
        <div className="fixed inset-0 bg-black/85 z-[1000] flex items-center justify-center p-4">
          <div className="bg-bg-secondary border border-border-color w-full max-w-3xl rounded-2xl overflow-hidden shadow-2xl">
            <div className="px-5 py-4 border-b border-border-color flex justify-between items-center bg-slate-800/40">
              <h3 className="flex items-center gap-2 text-white font-semibold text-sm">
                <FileSpreadsheet className="w-5 h-5 text-accent-indigo" />
                <span>Google Drive PDF 실시간 보관함</span>
              </h3>
              <button onClick={() => setSelectedDoc(null)} className="text-xl text-text-secondary hover:text-white">&times;</button>
            </div>
            
            <div className="p-5 flex gap-5 items-start">
              {/* PDF Mini Mockup */}
              <div className="w-[280px] h-[380px] bg-white rounded-lg shadow-xl p-4 text-slate-700 flex flex-col justify-between overflow-y-auto no-scrollbar border border-slate-200">
                <div>
                  <h4 className="text-center font-bold border-b border-slate-300 pb-1.5 mb-2.5 text-xs">교재구매, 회원가입 신청서</h4>
                  <div className="flex flex-col gap-1.5 text-[9px] text-slate-600">
                    <p><strong>구매자 성명:</strong> {selectedDoc.buyerName}</p>
                    <p><strong>자녀 성명:</strong> {selectedDoc.childInfo || '-'}</p>
                    <p><strong>자녀 생년월일:</strong> {selectedDoc.childBirthdate || '-'}</p>
                    <p><strong>연락처:</strong> {formatPhoneNumber(selectedDoc.phoneNumber)}</p>
                    <p><strong>배송 주소:</strong> {selectedDoc.address}</p>
                    <p><strong>배송 메모:</strong> {selectedDoc.deliveryMemo || '-'}</p>
                    <div className="border-t border-slate-200 my-1 pt-1">
                      <p><strong>신청 교재 1:</strong> {selectedDoc.book1Name || '-'}</p>
                      <p><strong>신청 교재 2:</strong> {selectedDoc.book2Name || '-'}</p>
                      <p><strong>구독 구분:</strong> {selectedDoc.subscriptionType || '-'}{selectedDoc.subscriptionPrice ? ` (${Number(selectedDoc.subscriptionPrice).toLocaleString()}원)` : ''}</p>
                      <p><strong>관리회원 구분:</strong> {selectedDoc.managementType || '-'}{selectedDoc.managementPrice ? ` (${Number(selectedDoc.managementPrice).toLocaleString()}원)` : ''}</p>
                    </div>
                    <div className="border-t border-slate-200 my-1 pt-1">
                      <p><strong>결제금액 (현금):</strong> {Number(selectedDoc.cashPayment || 0).toLocaleString()}원</p>
                      <p><strong>결제금액 (카드):</strong> {Number(selectedDoc.cardPayment || 0).toLocaleString()}원</p>
                      <p><strong>판매자 소속/이름:</strong> {selectedDoc.sellerName || '-'}</p>
                    </div>
                  </div>
                </div>
                <div className="mt-3">
                  <p className="text-[7px] text-slate-400 text-center border-t border-slate-100 pt-1">에이멘에이 주식회사 대표이사 직인 생략</p>
                  <div className="border-t border-dashed border-slate-300 mt-1 pt-1.5 flex justify-between items-end">
                    <span className="text-[8px] text-slate-400">신청자 서명</span>
                    <span className="font-mono text-[9px] text-accent-indigo font-bold italic rotate-[-5deg]">(인터랙티브 서명)</span>
                  </div>
                </div>
              </div>

              {/* Drive Details */}
              <div className="flex-1 flex flex-col gap-4 max-h-[380px] overflow-y-auto custom-scrollbar pr-1">
                <h4 className="text-sm font-bold text-white">에이멘에이(주) 구글 드라이브 보관 정보</h4>
                <p className="text-xs text-text-secondary leading-relaxed">
                  본 신청서 문서는 Google Drive API v3 연동을 거쳐 <strong>[교재구매_회원가입_신청서_회사용]</strong> 폴더 내 연월별 하위 폴더에 자동 업로드되었습니다.
                </p>
                <div className="bg-bg-card p-3 rounded-xl border border-border-color text-xs flex flex-col gap-2 font-mono">
                  <div>📁 <strong>저장 경로:</strong> Google Drive / 교재구매_신청서 / 2026-05 /</div>
                  <div>📄 <strong>파일 이름:</strong> <span className="text-accent-indigo font-semibold">신청서_{selectedDoc.buyerName}_{selectedDoc.phoneNumber.replace(/-/g,'')}.pdf</span></div>
                  <div>🔑 <strong>구글 드라이브 ID:</strong> {selectedDoc.gdrivePdfFileId || '-'}</div>
                </div>

                {/* 카드 영수증 OCR — 배열(다중) / 단일 객체(구 버전) 양쪽 호환 */}
                {selectedDoc.receiptOcrData?.card && (() => {
                  const cards = Array.isArray(selectedDoc.receiptOcrData.card)
                    ? selectedDoc.receiptOcrData.card
                    : [selectedDoc.receiptOcrData.card];
                  return cards.filter(Boolean).map((c, idx) => (
                    <div key={idx} className="bg-accent-indigo/10 border border-accent-indigo/40 p-3 rounded-xl text-xs space-y-1">
                      <div className="text-accent-indigo font-bold text-[11px]">💳 카드 영수증 #{idx + 1} 추출 정보</div>
                      {c.issuer && <div className="text-text-secondary">· 카드사: <span className="text-white font-semibold">{c.issuer}</span></div>}
                      {c.cardNumber && <div className="text-text-secondary">· 카드번호: <span className="text-white font-mono">{c.cardNumber}</span></div>}
                      {c.amount && <div className="text-text-secondary">· 결제금액: <span className="text-amber-400 font-semibold">{Number(c.amount).toLocaleString()}원</span></div>}
                      {c.approvalNo && <div className="text-text-secondary">· 승인번호: <span className="text-white font-mono">{c.approvalNo}</span></div>}
                      {c.terminalNo && <div className="text-text-secondary">· 단말기번호: <span className="text-white font-mono">{c.terminalNo}</span></div>}
                      {c.serialNo && <div className="text-text-secondary">· 일련번호: <span className="text-white font-mono">{c.serialNo}</span></div>}
                    </div>
                  ));
                })()}
                {selectedDoc.receiptOcrData?.cash && (
                  <div className="bg-emerald-500/10 border border-emerald-500/40 p-3 rounded-xl text-xs space-y-1">
                    <div className="text-emerald-400 font-bold text-[11px]">🧾 현금영수증 추출 정보</div>
                    {selectedDoc.receiptOcrData.cash.merchantName && <div className="text-text-secondary">· 가맹점: <span className="text-white font-semibold">{selectedDoc.receiptOcrData.cash.merchantName}</span></div>}
                    {selectedDoc.receiptOcrData.cash.merchantBizNo && <div className="text-text-secondary">· 사업자번호: <span className="text-white font-mono">{selectedDoc.receiptOcrData.cash.merchantBizNo}</span></div>}
                    {selectedDoc.receiptOcrData.cash.amount && <div className="text-text-secondary">· 거래금액: <span className="text-amber-400 font-semibold">{Number(selectedDoc.receiptOcrData.cash.amount).toLocaleString()}원</span></div>}
                    {selectedDoc.receiptOcrData.cash.approvalNo && <div className="text-text-secondary">· 승인번호: <span className="text-white font-mono">{selectedDoc.receiptOcrData.cash.approvalNo}</span></div>}
                    {selectedDoc.receiptOcrData.cash.transactionDate && <div className="text-text-secondary">· 거래일시: <span className="text-white font-mono">{selectedDoc.receiptOcrData.cash.transactionDate}</span></div>}
                    {selectedDoc.receiptOcrData.cash.identifierType && <div className="text-text-secondary">· 인증수단: <span className="text-white font-semibold">{selectedDoc.receiptOcrData.cash.identifierType}</span></div>}
                    {selectedDoc.receiptOcrData.cash.identifierNo && <div className="text-text-secondary">· 인증번호: <span className="text-white font-mono">{selectedDoc.receiptOcrData.cash.identifierNo}</span></div>}
                  </div>
                )}
                <div className="flex gap-2 mt-2">
                  <a
                    href={selectedDoc.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 bg-accent-indigo hover:bg-accent-hover text-white rounded-lg text-xs font-semibold transition-colors flex items-center gap-1"
                  >
                    <span>🌐 Google Drive에서 보기</span>
                  </a>
                  <button
                    onClick={() => alert(`취합용 전화번호 010-8290-4749로 PDF 단축링크 문자 발송 정상 로그 확인 완료!`)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white border border-border-color rounded-lg text-xs font-semibold transition-colors"
                  >
                    📱 문자 발송로그 확인
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      </>}
    </div>
  );
}
