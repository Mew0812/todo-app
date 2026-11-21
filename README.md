# MyTodo

iPhoneのホーム画面から使える個人用ToDoです。タスク、グループ、設定は使っているブラウザのIndexedDBに保存します。オフライン起動は、本番版をオンラインで一度開いてから利用できます。

## パソコンで使う

1. [Node.js](https://nodejs.org/) の24 LTSと [Git](https://git-scm.com/) をインストールします。
2. このフォルダーをエクスプローラーで開き、アドレスバーに `powershell` と入力して Enter を押します。
3. 次のコマンドを順番に実行します。

```powershell
npm.cmd ci
npm.cmd run dev
```

4. ターミナルの `Local` に表示されたURL（通常は [http://localhost:5173](http://localhost:5173)）をブラウザで開きます。サーバーを止めるには、ターミナルで Ctrl+C を押します。macOSやLinuxでは `npm.cmd` を `npm` に読み替えてください。

## ビルドとテスト

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd run preview
```

`build` は公開用ファイルを `dist` に出力します。`preview` のURL（通常は [http://localhost:4173](http://localhost:4173)）で本番版を試せます。オフラインを確認するには、最初にオンラインでページを開き、Service Workerが有効になってからオフラインに切り替え、再読み込みします。

ブラウザの自動テストは、本番ビルド後に次のコマンドで実行できます。実行前にプレビューを Ctrl+C で止めてください。Playwrightがテスト用のプレビューを起動します。

```powershell
npx.cmd playwright install chromium
npm.cmd run test:e2e
```

## GitHubへ保存する

GitHubで空のリポジトリを作ります。READMEの自動作成はオフにします。GitHub FreeでPagesを使う場合は公開リポジトリを選びます。JSONバックアップは個人データを含むため、GitHubには入れず、iPhoneの「ファイル」などに保管してください。

このフォルダーで次のコマンドを実行します。最初のコミットがすでにある場合は `git status` で確認し、変更があるときにコミットします。`ユーザー名` と `リポジトリ名` は実際の名前に置き換えてください。

```powershell
git add .
git commit -m "MyTodoを追加"
git branch -M main
git remote add origin https://github.com/ユーザー名/リポジトリ名.git
git push -u origin main
```

Gitが名前とメールアドレスの設定を求めた場合は、`git config user.name "名前"` と `git config user.email "メールアドレス"` を実行してからコミットします。

## 公開してiPhoneに追加する

1. GitHubのリポジトリで **Settings → Pages** を開き、**Build and deployment → Source → GitHub Actions** を選びます。
2. **Actions → GitHub Pages → Run workflow** で `main` を選択して実行します。以後は `main` への push で更新します。
3. ワークフローが成功したら **Settings → Pages** に表示される HTTPS の公開URLを iPhone の Safari で開きます。
4. Safariの共有ボタンから **ホーム画面に追加** を選びます。「Webアプリとして開く」が表示される場合はオンにして追加します。
5. ホーム画面の **MyTodo** をオンラインで一度起動します。その後、機内モードでも起動とタスク操作を試せます。

- [GitHub Pages の公式手順](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
- [Safari のホーム画面 Web アプリ](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/)

## 保存と操作

- 起動時、アプリに戻ったとき、日付が変わったときに、過去の未完了タスクの予定日を端末の現地日付へ更新します。重要フラグと手動順は維持します。完了・削除済みタスクは従来の30日経過処理の対象です。
- 「明日以降」には明日から翌月末までの日付が並びます。見出しをタップすると、その日付を設定した追加シートが開きます。表示期間外の予定日も保存され、表示範囲に入ると一覧に表示されます。
- 長押しで浮いたタスクを薄紫の線へドロップすると挿入できます。「明日以降」では別の日付や空の日にも移動でき、予定日が更新されます。グループは「今日」でドラッグして変更できます。
- グループなしのタスクは「今日」の一覧上部に並びます。グループなしの領域とグループの間もドラッグで移動できます。
- 新しいタスクには予定日が必要です。日付未設定の既存タスクは、設定の「日付未設定」から操作できます。
- 詳細シートは上端のハンドルを下へスワイプするか、ハンドルをタップして閉じます。
- Safariのデータ消去や公開URLの変更に備えて、設定からJSONを保存してください。インポートは現在のタスク・グループ・設定をまとめて置き換えます。復元前のデータも必要なら先にエクスポートしてください。

## ファイル構成

- `src/data/` データ構造、日付・保持期限、バックアップ検証、IndexedDB
- `src/screens/` ToDo一覧、タスク追加・詳細、設定
- `src/components/` 予定日選択、シート、長押し並び替え
- `src/App.tsx` 画面切り替えと保存処理の接続
- `public/` PWAマニフェストとアイコン
- `vite.config.js` 本番ビルド時のService Worker生成
- `tests/` ロジックテストとブラウザテスト
