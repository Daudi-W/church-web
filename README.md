# church-web

桃園分堂各系統的**前端登入頁**（用 Google 登入取得驗證身分）。

## 這個 repo 是做什麼的

各教會 GAS 系統（場地申請、新人跟進…）原本「手打 email 就能用」，安全性不足。
這裡放一層「使用 Google 登入」前端：

```
[本 repo / GitHub Pages]  使用者按「Google 登入」→ 拿到 Google 簽章的身分票
        │ 傳票給後端
        ▼
[各系統的私有 GAS]  驗票 → 取出驗證過的 email → 比對白名單 → 准操作
```

## 為什麼可以公開

- 前端唯一的「鑰匙」是 OAuth **用戶端 ID**，Google 設計上本來就公開（網頁原始碼都看得到）。
- **沒有**用戶端密鑰、API 金鑰、白名單名單或任何個資。
- 安全完全靠後端 GAS 驗票（零信任）：前端被改也偽造不出 Google 簽章。

## 頁面

| 檔案 | 對應系統 | 後端 repo（私有）|
| :--- | :--- | :--- |
| `venue.html` | 場地申請 | `Daudi-W/Church-Venue` |
| `newcomer.html` | 新人跟進 | `Daudi-W/newcomer-followup` |

## 自動檢查

推送或開 Pull Request 時，GitHub Actions 會執行：

- 所有 HTML 行內 JavaScript 與 `.js` 檔的語法檢查。
- 正式／沙盒 GAS 端點隔離、模組 allowlist、登入返回與單次重登防迴圈測試。
- Service Worker 對平台入口、場地、新人與共用模組資源的預快取接線檢查。
- 外部網址 HTTPS allowlist、動態錯誤文字跳脫，以及新人週備註／小組名稱不得拼進 inline JavaScript 的安全回歸檢查。

本機可執行 `npm test`；測試只讀靜態檔並使用假的瀏覽器儲存空間，不會呼叫正式 API 或讀寫教會資料。

## 網址

GitHub Pages：`https://daudi-w.github.io/church-web/`
OAuth「已授權 JavaScript 來源」填：`https://daudi-w.github.io`
