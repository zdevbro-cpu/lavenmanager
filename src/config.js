// 프로덕션 빌드에선 VITE_API_BASE 환경 변수가 주입됨 (예: https://lavenmanager-xxx.run.app)
// 로컬 개발에선 .env.development 또는 기본값 사용
export const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3001';
