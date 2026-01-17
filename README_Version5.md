```markdown
# youtube-clone (Fullstack MVP scaffold)

概要
- Next.js (frontend) + NestJS (backend) + Prisma(Postgres) + BullMQ/Redis + MinIO (S3互換) + FFmpeg ワーカー の雛形
- ローカル開発は docker-compose で起動可能

主なコンポーネント
- frontend/: Next.js アプリ（一覧・アップロード・視聴・認証）
- backend/: NestJS API (Auth, Users, Videos, Presign/Complete)
- worker/: トランスコードワーカー（BullMQ キュー監視、FFmpeg 実行）
- prisma/: Prisma schema（Postgres）
- docker-compose.yml: Postgres, Redis, MinIO, backend, frontend, worker

早速起動（ローカル）
1. 必要: Docker & Docker Compose
2. ルートに .env を作成（.env.example をコピーして編集）
3. docker-compose up -d postgres redis minio
4. MinIO コンソールでバケット videos を作成（http://localhost:9001）
5. docker-compose run --rm backend npm run prisma:migrate
6. docker-compose up --build
7. フロント: http://localhost:3000
   バックエンド: http://localhost:4000/api

主要フロー
- フロントが /api/videos/init-upload を呼び presigned PUT URL を受け取る
- 直接 MinIO(S3) に PUT でアップロード
- フロントが /api/videos/complete-upload を呼びサーバがDBを更新しキューにjobを投入
- worker がジョブを処理、FFmpeg で HLS とサムネイルを生成して S3 にアップロード。DB を更新

注意
- これは開発雛形です。実運用用のセキュリティ/監視/スケーリングは別途必要です。
```