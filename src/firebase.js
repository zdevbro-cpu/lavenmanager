import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

// 에이멘에이 교재구매 신청 웹에 연동할 Firebase 설정 자격증명
const firebaseConfig = {
  apiKey: "AIzaSyA_mAlbt-5glgh8yQrFe0JZPHqXPErtEaM",
  authDomain: "lavenmanager.firebaseapp.com",
  projectId: "lavenmanager",
  storageBucket: "lavenmanager.firebasestorage.app",
  messagingSenderId: "682089634600",
  appId: "1:682089634600:web:9ad4045b3e271df6a88e1d"
};

// 파이어베이스 초기화
const app = initializeApp(firebaseConfig);

// 파이어베이스 클라이언트 Auth 모듈 익스포트
export const auth = getAuth(app);
export default app;
