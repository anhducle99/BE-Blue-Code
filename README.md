# BE-Blue-Code

Backend của BlueCode, cung cấp REST API, Socket.IO realtime và truy cập dữ liệu Postgres qua Prisma cùng các model/service hiện có.

## Phạm vi repo

Current state backend chịu trách nhiệm cho:

- Auth web bằng email/password
- Zalo login, link token, QR login session
- Mini app dev-login local cho `localhost` de test browser khong co Zalo SDK
- Quản lý user, department, organization
- Lịch sử cuộc gọi và thống kê
- Tạo và cập nhật call log theo thời gian thực
- Incident case aggregation
- Scope theo organization cho dữ liệu và realtime rooms

## Entry points chính

- `src/app.ts`
- `src/index.ts`
- `src/routes/*`
- `src/controllers/*`
- `src/models/*`
- `src/services/*`
- `src/socketStore.ts`
- `prisma/schema.prisma`

## Cài đặt và chạy local

```powershell
cd BE-Blue-Code
npm install
Copy-Item .env.local .env
npm run prisma:generate
npx prisma migrate deploy
npm run dev:app
```

Backend mặc định chạy ở `http://localhost:5000`.

Lưu ý current state:

- `npm run dev:app` và `npm run build` hiện tự chạy `npm run prisma:generate` trước để tránh dùng Prisma client stale/sai engine sau khi đổi schema hoặc client từng được generate theo mode khác.

## Scripts chính

| Script | Mục đích current state |
| --- | --- |
| `npm run build` | Build TypeScript sang `dist` |
| `npm start` | Chạy `dist/index.js` |
| `npm run dev:app` | Chạy `src/index.ts` bằng `ts-node` |
| `npm run dev:local` | Copy `.env.local` sang `.env` rồi chạy app |
| `npm run prisma:generate` | Tạo Prisma client |
| `npm run prisma:migrate` | Chạy Prisma migrate dev |
| `npm run prisma:deploy` | Deploy migration |
| `npm run prisma:seed` | Seed dữ liệu |
| `npm run test:mini-link` | Chạy test flow mini app link token |

## Env đang dùng

Biến nền tảng:

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

Biến mini app / production:

- `MINI_APP_LAUNCH_MODE`
- `MINI_APP_WEB_URL`
- `ZALO_MINI_APP_ID`
- `MINI_APP_TESTING_VERSION`
- `CALL_PENDING_TIMEOUT_MS`
- `MINI_PENDING_GRACE_MS`

## Current-state notes

- `src/app.ts` tạo cả Express app lẫn Socket.IO server; `src/index.ts` là listener entrypoint chính.
- Repo hiện dùng đồng thời Prisma và model layer trong `src/models`.
- `create-env-files.ps1` không tạo đầy đủ các biến mini app production đang được code sử dụng.
- `POST /api/mini/auth/dev-login` chi hoạt động ngoài production và chỉ nhận request local (`localhost`, `127.0.0.1`, `::1`) để đăng nhập mini app browser local bằng email/password của department account.

### Update 2026-03-07

- Route write cho `organization`, `user`, `department` và `POST /api/auth/register` đã được guard theo auth/role; controller tiếp tục khóa theo organization của requester.
- Socket online user, handler state, history và statistics đã ưu tiên scope theo `organization_id`, có fallback cho dữ liệu legacy chưa gán `organization_id`.
- Current state không còn script/socket process riêng hay PM2 app `bluecode-socket`; backend chỉ còn entrypoint chung `src/index.ts` -> `dist/index.js`.

## Tài liệu liên quan

- [README gốc workspace](../README.md)
- [Project context](../docs/PROJECT_CONTEXT.md)
- [Architecture](../docs/ARCHITECTURE.md)
- [HDSD](../docs/HDSD.md)
- [Rules](../docs/RULES.md)
