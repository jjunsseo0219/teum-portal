/**
 * 틈 (Teum) 실시간 기기 동기화 설정
 *
 * [무료 Firebase 실시간 동기화 연결 3단계]
 * 1. https://console.firebase.google.com 에서 프로젝트 생성 → Firestore Database 만들기(테스트/프로덕션)
 * 2. 프로젝트 설정(톱니바퀴) → 내 앱(웹 `</>`) 추가 → 아래 `firebase` 객체에 값 복사
 * 3. Firestore 규칙(Rules)을 아래처럼 설정:
 *
 *    rules_version = '2';
 *    service cloud.firestore {
 *      match /databases/{database}/documents {
 *        match /teum_sync/{roomId} {
 *          allow list, delete: if false;
 *          allow get, create, update: if roomId.size() == 64 && request.resource.size() < 200000;
 *        }
 *      }
 *    }
 */
window.TEUM_SYNC_CONFIG = {
  provider: 'firebase',
  collection: 'teum_sync',
  publicCollection: 'teum_public',
  publicDocId: 'portal',
  adminEmail: 'admin@teum.seojeon',
  adminPrefix: 'TEUM-ADMIN-',
  firebase: {
    apiKey: 'AIzaSyAo027JUtLg0TD67aijPRQBirZME8ASOcI',
    authDomain: 'teum-portal-seojeon-2bf52.firebaseapp.com',
    projectId: 'teum-portal-seojeon-2bf52',
    storageBucket: 'teum-portal-seojeon-2bf52.firebasestorage.app',
    messagingSenderId: '147515137110',
    appId: '1:147515137110:web:c82108d2e723485b232ff7'
  }
};
