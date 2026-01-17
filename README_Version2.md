# Mini YouTube - Complete (Server-side thumbnails + Docker)

このリポジトリは、簡易的な YouTube 風の動画投稿アプリです。  
匿名閲覧が可能で、登録/ログインすると動画の投稿と削除ができます。サーバー側で ffmpeg を使ってサムネイルを生成します。

主な機能
- 公開：誰でも動画を一覧・再生・いいね・コメント閲覧可能
- 認証：登録 / ログイン（JWT）
- 投稿：ログインユーザのみ動画のアップロード（動画ファイル保存、サムネイルはクライアント送信 or サーバーで ffmpeg による生成）
- DB：SQLite（軽量で手軽）
- Docker：ffmpeg を含むコンテナで動作可能

注意点（本番では更なる対策が必要）
- 入力検証、XSS/CSRF 対策、CSP、パスワードポリシー、アップロードサイズ／型チェック、レート制限等を強化してください
- 大量ファイルは外部ストレージ（S3 等）へ保存することを推奨します

セットアップ（ローカル）
1. リポジトリをクローンまたはファイルを保存
2. Node.js 16+ をインストール
3. システムに ffmpeg をインストール（Linux: apt install ffmpeg、macOS: brew install ffmpeg）
4. 依存インストール:
   - npm install
5. 設定:
   - `.env.example` をコピーして `.env` に。JWT_SECRET を設定
6. 起���:
   - npm start
7. ブラウザで http://localhost:3000 にアクセス

セットアップ（Docker）
1. Docker と docker-compose をインストール
2. 同ディレクトリで:
   - docker compose up --build
3. ブラウザで http://localhost:3000 にアクセス

その他
- サムネイル: クライアントがサムネイルデータURLを送ればその画像を保存します。送られない場合はサーバー側で ffmpeg を呼び出して1秒付近のフレームを抽出して保存します（ffmpeg が必要）。
- SQLite DB は `mini_yt.sqlite`（デフォルト）に作成されます。

拡張案（やること）
- S3 に動画を保存、CDN 経由で配信
- HLS / DASH によるトランスコード（ffmpeg で対応）
- メール認証 / パスワードリセット
- プロフィール、チャンネル、フォロー機能
- ページネーションとフルテキスト検索

ご希望があれば次のどれを優先して進めるか教えてください:
- (A) UI をさらにリッチ（Material/Tailwind）に変更
- (B) 動画トランスコード + HLS（ffmpeg）を追加
- (C) S3 対応（環境変数で切り替え可能に）
- (D) 本番向けセキュリティ強化（CSP, helmet, rate-limit, validation）