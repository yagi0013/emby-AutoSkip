# Emby AutoSkip 同期API仕様 v1

`emby-autoskip-sync.js` が利用する暗号化データ保管APIの契約です。APIは設定内容や同期キーを保持せず、ブラウザーで暗号化された `envelope` だけを保存します。同期APIのURLは利用者が設定します。APIサーバー実装はこのリポジトリに含まれていません。

## 共通要件

- HTTPS必須
- `Content-Type: application/json`
- Cookieを使わず、既存データの操作は `X-Emby-AutoSkip-Token: <authToken>` で認証
- 任意のEmbyオリジンから利用するため、CORSで `X-Emby-AutoSkip-Token`、`Authorization`、`Content-Type` を許可
- 従来の `Authorization: Bearer <authToken>` も互換用に受け付ける
- `authToken` はログへ記録せず、DBには安全なハッシュだけを保存
- `syncId`、IPごとのレート制限と保存容量上限を設定
- 成功応答の `revision` は1から始まる単調増加の整数
- `envelope` は内容を解釈せず、そのまま保存・返却

推奨上限は1同期IDあたり512KB、書き込み毎分30回程度です。

## 新規作成

`POST /index.php/v1/sync`

```json
{
  "syncId": "ランダムな128bit IDのbase64url",
  "authToken": "同期キーから導出した認証トークン",
  "envelope": {
    "version": 1,
    "algorithm": "AES-GCM",
    "iv": "base64url",
    "ciphertext": "base64url"
  }
}
```

成功時は `201 Created` で、保存した `envelope` も返します。

```json
{
  "revision": 1,
  "updatedAt": "2026-10-12T12:34:56Z",
  "envelope": {
    "version": 1,
    "algorithm": "AES-GCM",
    "iv": "base64url",
    "ciphertext": "base64url"
  }
}
```

既存の `syncId` なら `409 Conflict` を返します。

## 取得

`GET /index.php/v1/sync/{syncId}`

```http
X-Emby-AutoSkip-Token: <authToken>
```

成功時は `200 OK` で、`revision`、`updatedAt`、`envelope` を返します。

## 更新

`PUT /index.php/v1/sync/{syncId}`

```json
{
  "baseRevision": 3,
  "envelope": {
    "version": 1,
    "algorithm": "AES-GCM",
    "iv": "base64url",
    "ciphertext": "base64url"
  }
}
```

`baseRevision` が現在値と一致するときだけ更新し、増加後の `revision` と保存した `envelope` を返します。一致しない場合は `409 Conflict` とし、クライアントが再取得して利用者に競合解決を求めます。

## 削除

`DELETE /index.php/v1/sync/{syncId}`

認証成功後、同期データと認証情報を削除し、`204 No Content` を返します。

## エラー形式

```json
{
  "code": "rate_limited",
  "message": "リクエスト回数が上限を超えました"
}
```

主なHTTPステータスは `400`、`401`、`403`、`404`、`409`、`413`、`429`、`500`、`503` です。認証失敗時は、同期IDの存在有無を推測しにくい同一形式の応答にしてください。

## 現在の対象外

一時ペアリングコードは、短時間トークン、試行回数制限、端末間の暗号鍵受け渡しを別途設計する必要があるため、API v1には含めません。

## サーバー実装について

この文書はクライアントが要求するAPI仕様です。`index.php/v1/...` のエンドポイントを提供するサーバーを別途用意してください。保存データへの直接アクセスを防ぎ、認証・同時更新制御・容量制限・レート制限・バックアップを実装する必要があります。
