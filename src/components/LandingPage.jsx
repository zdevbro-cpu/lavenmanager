import React from 'react';

// 진입점 분기 페이지 — 3개 카드 세로 배치
// onSelect 콜백으로 부모(App)의 activeView 전환
export default function LandingPage({ onSelect }) {
  const cards = [
    {
      key: 'card-sales',
      title: '카드결제등록',
      sub: '독서지도사 / 점주계약금 카드결제 건을 등록합니다.',
      emoji: '💳',
      color: 'from-sky-500 to-blue-600'
    },
    {
      key: 'application',
      title: '교재구매 회원신청',
      sub: '교재구매·회원가입 신청서를 작성합니다.',
      emoji: '📝',
      color: 'from-indigo-500 to-purple-600'
    }
  ];

  return (
    <div className="w-full max-w-md mx-auto flex flex-col gap-4 p-5">
      <div className="text-center mb-2">
        <img src="/logo.png" alt="에이멘에이 로고" className="w-16 h-16 object-contain mx-auto mb-2" />
        <h1 className="text-xl font-bold text-white">에이멘에이 업무 시스템</h1>
        <p className="text-xs text-text-secondary mt-1">아래 항목 중 하나를 선택하세요</p>
      </div>

      {cards.map((c) => (
        <button
          key={c.key}
          onClick={() => onSelect(c.key)}
          className={`bg-gradient-to-br ${c.color} text-white p-5 rounded-2xl text-left shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-transform`}
        >
          <div className="flex items-center gap-3">
            <div className="text-3xl">{c.emoji}</div>
            <div className="flex-1">
              <div className="font-bold text-base">{c.title}</div>
              <div className="text-xs opacity-90 mt-1">{c.sub}</div>
            </div>
            <div className="text-xl opacity-70">›</div>
          </div>
        </button>
      ))}
    </div>
  );
}
