const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

let driveClient = null;
let isOAuthUserMode = false;

const keyPath = path.join(__dirname, '..', 'config', 'google-key.json');
const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

// 1. [우선순위 1] 만약 .env에 개인 OAuth2 인증 자격증명이 존재하면 일반 사용자 권한 모드 가동!
if (clientId && clientSecret && refreshToken) {
  try {
    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      'http://localhost:3001/api/auth/google/callback'
    );
    oauth2Client.setCredentials({ refresh_token: refreshToken });
    driveClient = google.drive({ version: 'v3', auth: oauth2Client });
    isOAuthUserMode = true;
    console.log("📂 [OAuth2 User Mode] 사용자 계정 권한 구글 드라이브 클라이언트가 무제한 적재 모드로 가동되었습니다!");
  } catch (error) {
    console.error("❌ OAuth2 사용자 드라이브 초기화 실패:", error.message);
  }
} 
// 2. [우선순위 2] OAuth2가 없고 서비스 계정 키가 있으면 서비스 계정 폴백 모드 가동
else if (fs.existsSync(keyPath)) {
  try {
    const auth = new google.auth.GoogleAuth({
      keyFile: keyPath,
      scopes: ['https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/drive']
    });
    driveClient = google.drive({ version: 'v3', auth });
    console.log("📂 [Service Account Mode] Google Drive 서비스 계정 클라이언트가 활성화되었습니다.");
  } catch (error) {
    console.error("❌ Google Drive API 서비스 계정 초기화 실패:", error.message);
  }
} else {
  console.warn("⚠️ 구글 연동에 필요한 정보(OAuth2 또는 서비스 계정 키)가 없어 로컬 서버 uploads 폴더 백업 모드로 동작합니다.");
}

const driveService = {
  uploadApplicationFiles: async (buyerName, phoneNumber, pdfBuffer, photoBuffer = null, receiptBuffer = null) => {
    const cleanPhone = phoneNumber.replace(/-/g, '');
    const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '') + '_' + new Date().toTimeString().slice(0, 8).replace(/:/g, '');
    const pdfFileName = `신청서_${buyerName}_${cleanPhone}_${timestamp}.pdf`;
    const photoFileName = `원본사진_${buyerName}_${cleanPhone}_${timestamp}.jpg`;
    const receiptFileName = `카드영수증_${buyerName}_${cleanPhone}_${timestamp}.jpg`;

    const parentId = process.env.GOOGLE_DRIVE_FOLDER_ID;

    // A. 구글 드라이브 연동 클라이언트가 생성된 경우
    if (driveClient) {
      try {
        // [OAuth2 User Mode]에서는 사용자 본인의 권한이므로 0바이트 롤백이나 쿼타 우회 트릭 없이 
        // 완벽하고 기풍 있게 본래의 연월 분류 하위 폴더 구조까지 아름답게 자동 생성하여 100% 무제한 업로드합니다!
        if (isOAuthUserMode) {
          console.log(`📤 [OAuth2 User Mode] 최상위 폴더[${parentId}] 내에 연월 폴더 조회/생성 중...`);
          const currentYearMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
          const folderId = await getOrCreateFolder(currentYearMonth);
          const targetParentId = folderId || parentId;

          console.log(`📤 [OAuth2 User Mode] 드라이브에 신청서 PDF 업로드 중: ${pdfFileName}`);
          const pdfFileMetadata = { name: pdfFileName, parents: targetParentId ? [targetParentId] : [] };
          const pdfMedia = { mimeType: 'application/pdf', body: require('stream').Readable.from(pdfBuffer) };
          const pdfUpload = await driveClient.files.create({
            resource: pdfFileMetadata,
            media: pdfMedia,
            fields: 'id, webViewLink',
            supportsAllDrives: true
          });

          let photoFileId = null;
          if (photoBuffer) {
            console.log(`📤 [OAuth2 User Mode] 드라이브에 원본사진 업로드 중: ${photoFileName}`);
            const photoFileMetadata = { name: photoFileName, parents: targetParentId ? [targetParentId] : [] };
            const photoMedia = { mimeType: 'image/jpeg', body: require('stream').Readable.from(photoBuffer) };
            const photoUpload = await driveClient.files.create({
              resource: photoFileMetadata,
              media: photoMedia,
              fields: 'id',
              supportsAllDrives: true
            });
            photoFileId = photoUpload.data.id;
          }

          let receiptFileId = null;
          if (receiptBuffer) {
            console.log(`📤 [OAuth2 User Mode] 드라이브에 카드 영수증 업로드 중: ${receiptFileName}`);
            const receiptFileMetadata = { name: receiptFileName, parents: targetParentId ? [targetParentId] : [] };
            const receiptMedia = { mimeType: 'image/jpeg', body: require('stream').Readable.from(receiptBuffer) };
            const receiptUpload = await driveClient.files.create({
              resource: receiptFileMetadata,
              media: receiptMedia,
              fields: 'id',
              supportsAllDrives: true
            });
            receiptFileId = receiptUpload.data.id;
          }

          console.log(`🎉 [OAuth2 User Mode] 구글 드라이브 무제한 업로드 완료! PDF ID: ${pdfUpload.data.id}`);
          return {
            pdfFileId: pdfUpload.data.id,
            pdfViewUrl: pdfUpload.data.webViewLink,
            photoFileId: photoFileId,
            receiptFileId: receiptFileId
          };
        } 
        
        // [Service Account Mode] 쿼타 차단 해소 우회 시퀀스 (동의 문제로 인해 로컬 폴백을 동반)
        else {
          console.log(`📤 [Service Account Mode] 지능형 우회 엔진 가동 시작...`);
          const folderInfo = await driveClient.files.get({ fileId: parentId, fields: 'owners' });
          if (!folderInfo.data.owners || folderInfo.data.owners.length === 0) {
            throw new Error("부모 폴더의 소유자 정보를 찾을 수 없습니다.");
          }
          const ownerEmail = folderInfo.data.owners[0].emailAddress;

          const uploadAndTransfer = async (fileName, mimeType, buffer) => {
            const fileMetadata = { name: fileName, parents: parentId ? [parentId] : [] };
            const fileCreate = await driveClient.files.create({ resource: fileMetadata, fields: 'id', supportsAllDrives: true });
            const fileId = fileCreate.data.id;

            try {
              // 1단계: writer 부여
              const permCreate = await driveClient.permissions.create({
                fileId: fileId,
                resource: { role: 'writer', type: 'user', emailAddress: ownerEmail },
                fields: 'id',
                supportsAllDrives: true
              });
              
              // 2단계: owner 승격
              await driveClient.permissions.update({
                fileId: fileId,
                permissionId: permCreate.data.id,
                resource: { role: 'owner' },
                transferOwnership: true,
                supportsAllDrives: true
              });
            } catch (permError) {
              // 소유권 위임 거부 시 0바이트 찌꺼기 파일 즉시 롤백 삭제
              await driveClient.files.delete({ fileId: fileId, supportsAllDrives: true });
              throw new Error(`구글 보안 정책(Consent)에 의해 서비스 계정의 0-쿼타 저장이 차단되었습니다.`);
            }

            const media = { mimeType: mimeType, body: require('stream').Readable.from(buffer) };
            const fileUpdate = await driveClient.files.update({
              fileId: fileId,
              media: media,
              fields: 'id, webViewLink',
              supportsAllDrives: true
            });
            return { id: fileUpdate.data.id, webViewLink: fileUpdate.data.webViewLink };
          };

          const pdfResult = await uploadAndTransfer(pdfFileName, 'application/pdf', pdfBuffer);
          let photoFileId = null;
          if (photoBuffer) {
            const photoResult = await uploadAndTransfer(photoFileName, 'image/jpeg', photoBuffer);
            photoFileId = photoResult.id;
          }
          let receiptFileId = null;
          if (receiptBuffer) {
            const receiptResult = await uploadAndTransfer(receiptFileName, 'image/jpeg', receiptBuffer);
            receiptFileId = receiptResult.id;
          }

          console.log(`🎉 [Service Account Mode] 우회 적재 성공!`);
          return {
            pdfFileId: pdfResult.id,
            pdfViewUrl: pdfResult.webViewLink,
            photoFileId: photoFileId,
            receiptFileId: receiptFileId
          };
        }
      } catch (error) {
        console.error("❌ Google Drive 업로드 오류. 안전 로컬 보관 모드로 폴백 가동합니다:", error.message);
        if (!isOAuthUserMode) {
          console.error("   ↳ 원인: 서비스 계정은 Google Drive 저장 쿼타가 0이며, personal Gmail 폴더로의 ownership 자동 위임도 차단됩니다.");
          console.error("   ↳ 조치: server/.env 의 GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN 을 설정해 OAuth2 User Mode 로 전환하세요.");
          console.error("   ↳ 가이드: http://localhost:3001/api/auth/google 접속 → 구글 로그인 → REFRESH_TOKEN 발급");
        }
      }
    }

    // B. 구글 계정이 미연동된 경우 - 로컬 uploads 보관
    console.log("ℹ️ [Local Drive Fallback] 구글 계정 미작동으로 파일을 로컬 uploads 폴더에 백업 보관합니다.");
    const uploadDir = path.join(__dirname, '..', 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const localPdfPath = path.join(uploadDir, pdfFileName);
    fs.writeFileSync(localPdfPath, pdfBuffer);
    console.log(`💾 로컬 PDF 보관 완료: ${localPdfPath}`);

    if (photoBuffer) {
      const localPhotoPath = path.join(uploadDir, photoFileName);
      fs.writeFileSync(localPhotoPath, photoBuffer);
    }
    if (receiptBuffer) {
      const localReceiptPath = path.join(uploadDir, receiptFileName);
      fs.writeFileSync(localReceiptPath, receiptBuffer);
    }

    return {
      pdfFileId: `gdrive_file_id_${Math.random().toString(36).substring(2, 12)}`,
      pdfViewUrl: `http://localhost:3001/uploads/${pdfFileName}`,
      photoFileId: photoBuffer ? `gdrive_photo_id_${Math.random().toString(36).substring(2, 12)}` : null,
      receiptFileId: receiptBuffer ? `gdrive_receipt_id_${Math.random().toString(36).substring(2, 12)}` : null
    };
  }
};

// 구글 드라이브 또는 로컬 uploads 폴더의 파일 삭제
driveService.deleteFile = async (fileId, fallbackFileName = null) => {
  if (!fileId) return false;

  // 로컬 폴백 ID (gdrive_file_id_xxx 패턴)인 경우 로컬 파일 삭제 시도
  if (fileId.startsWith('gdrive_') || fileId.startsWith('gdrive_file_id_')) {
    if (!fallbackFileName) return false;
    const localPath = path.join(__dirname, '..', 'uploads', fallbackFileName);
    if (fs.existsSync(localPath)) {
      fs.unlinkSync(localPath);
      console.log(`🗑️ 로컬 파일 삭제: ${localPath}`);
      return true;
    }
    return false;
  }

  if (!driveClient) return false;
  try {
    await driveClient.files.delete({ fileId, supportsAllDrives: true });
    console.log(`🗑️ 구글 드라이브 파일 삭제: ${fileId}`);
    return true;
  } catch (e) {
    console.error(`❌ 드라이브 파일 삭제 실패 (${fileId}):`, e.message);
    return false;
  }
};

// 공유 폴더 내 하위 연월 폴더 검색 및 생성 도우미 함수 (OAuth2 User Mode용)
async function getOrCreateFolder(folderName) {
  if (!driveClient) return null;
  try {
    const parentId = process.env.GOOGLE_DRIVE_FOLDER_ID;
    let query = `name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    if (parentId) {
      query += ` and '${parentId}' in parents`;
    }

    const response = await driveClient.files.list({
      q: query,
      fields: 'files(id)',
      spaces: 'drive',
      supportsAllDrives: true
    });

    if (response.data.files && response.data.files.length > 0) {
      return response.data.files[0].id;
    }

    const fileMetadata = {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder'
    };
    if (parentId) {
      fileMetadata.parents = [parentId];
    }

    const folder = await driveClient.files.create({
      resource: fileMetadata,
      fields: 'id',
      supportsAllDrives: true
    });

    console.log(`📂 [OAuth2 User Mode] 신규 연월 폴더 생성 완료 [${folderName}]: ${folder.data.id}`);
    return folder.data.id;
  } catch (e) {
    console.error("하위 연월 폴더 검색/생성 중 오류:", e.message);
    return null;
  }
}

module.exports = driveService;
