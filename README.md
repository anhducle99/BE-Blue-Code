# BE-Blue-Code

Backend cua BlueCode, cung cap REST API, Socket.IO realtime va truy cap du lieu Postgres qua Prisma cung cac model/service hien co.

## Pham vi repo

Current state backend chiu trach nhiem cho:

- Auth web bang email/password
- Zalo login, link token, QR login session
- Mini app dev-login local cho `localhost` de test browser khong co Zalo SDK
- Mini app password-login bang email/password web account, nhung van giu guard chi cho department account hop le vao mini app
- Mini app dashboard options route de tra `floorAccounts` va `departments` scoped theo organization cho home mini app; danh sach `departments` duoc mini app dung nhu cac doi phan ung de goi
- Mini app outbound call route `POST /api/mini/call` dung chung dispatch logic voi web
- Quan ly user, department, organization
- Lich su cuoc goi va thong ke
- Tao va cap nhat call log theo thoi gian thuc cho ca web `/api/call` va mini app `/api/mini/call`
- Incident case aggregation
- Scope theo organization cho du lieu va realtime rooms

## Entry points chinh

- `src/app.ts`
- `src/index.ts`
- `src/routes/*`
- `src/controllers/*`
- `src/models/*`
- `src/services/*`
- `src/socketStore.ts`
- `prisma/schema.prisma`

## Cai dat va chay local

```powershell
cd BE-Blue-Code
npm install
Copy-Item .env.local .env
npm run prisma:generate
npx prisma migrate deploy
npm run dev:app
```

Backend mac dinh chay o `http://localhost:5000`.

Luu y current state:

- `npm run dev:app` va `npm run build` hien tu chay `npm run prisma:generate` truoc de tranh dung Prisma client stale/sai engine sau khi doi schema hoac client tung duoc generate theo mode khac.

## Scripts chinh

| Script | Muc dich current state |
| --- | --- |
| `npm run build` | Build TypeScript sang `dist` |
| `npm start` | Chay `dist/index.js` |
| `npm run dev:app` | Chay `src/index.ts` bang `ts-node` |
| `npm run dev:local` | Copy `.env.local` sang `.env` roi chay app |
| `npm run prisma:generate` | Tao Prisma client |
| `npm run prisma:migrate` | Chay Prisma migrate dev |
| `npm run prisma:deploy` | Deploy migration |
| `npm run prisma:seed` | Seed du lieu |
| `npm run test:mini-link` | Chay test flow mini app link token |

## Env dang dung

Bien nen tang:

- `DATABASE_URL`
- `DB_HOST`
- `DB_USER`
- `DB_PASSWORD`
- `DB_NAME`
- `DB_PORT`
- `JWT_SECRET`
- `JWT_EXPIRES_IN`
- `PORT`
- `NODE_ENV`

Bien mini app / production:

- `MINI_APP_LAUNCH_MODE`
- `MINI_APP_WEB_URL`
- `ZALO_MINI_APP_ID`
- `MINI_APP_TESTING_VERSION`
- `CALL_PENDING_TIMEOUT_MS`
- `MINI_PENDING_GRACE_MS`

## Current-state notes

- `src/app.ts` tao ca Express app lan Socket.IO server; `src/index.ts` la listener entrypoint chinh.
- Repo hien dung dong thoi Prisma va model layer trong `src/models`.
- `create-env-files.ps1` khong tao day du cac bien mini app production dang duoc code su dung.
- `POST /api/mini/auth/dev-login` chi hoat dong ngoai production va chi nhan request local (`localhost`, `127.0.0.1`, `::1`) de dang nhap mini app browser local bang email/password cua department account.
- `POST /api/mini/auth/password-login` cho phep dang nhap mini app bang email/password cua tai khoan web, nhung current state van chi cho user co `isDepartmentAccount = true`, khong phai `isFloorAccount`, va co `organizationId`.
- `GET /api/mini/dashboard-options` tra du lieu home mini app gom `floorAccounts` va `departments` theo `organizationId` cua mini token; mini app dung `departments` lam danh sach doi phan ung.
- Account `is_department_account` khong con bi chan goi ra o backend; `validateCallPermission` van nap `userFull` va backend tiep tuc khoa sender/target theo organization.
- `POST /api/mini/call` va `POST /api/call` hien dung chung `src/services/callDispatchService.ts` de tao call log, incident case va socket event; ca route mini app va web deu truyen `excludeUserNames` de neu goi vao chinh doi hien tai thi user gui se bi loai khoi receiver list. Rieng mini app route hien tra them `receiverNames` cung `callId` de frontend mo modal theo doi trang thai cuoc goi.

### Update 2026-03-07

- Route write cho `organization`, `user`, `department` va `POST /api/auth/register` da duoc guard theo auth/role; controller tiep tuc khoa theo organization cua requester.
- Socket online user, handler state, history va statistics da uu tien scope theo `organization_id`, co fallback cho du lieu legacy chua gan `organization_id`.
- Current state khong con script/socket process rieng hay PM2 app `bluecode-socket`; backend chi con entrypoint chung `src/index.ts` -> `dist/index.js`.

## Tai lieu lien quan

- [README goc workspace](../README.md)
- [Project context](../docs/PROJECT_CONTEXT.md)
- [Architecture](../docs/ARCHITECTURE.md)
- [HDSD](../docs/HDSD.md)
- [Rules](../docs/RULES.md)
