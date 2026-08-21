# テスト

`logic.test.js`（純ロジック、61件）と `rules.test.mjs` / `rules.signup.test.mjs`（Firestoreルール、31件）があります。

## 純ロジックのテスト（`logic.test.js`）

```bash
cd tests && node extract.mjs && node logic.test.js
```

`extract.mjs` が `index.html` から対象関数を抜き出して `pure.js` を生成します。**必ず先に走らせてください** — 生成物をコミットしてあるので、忘れると古いコードを検査してしまいます。

実際にこれで見つかった不具合:

- **`norm()` がキリル文字・ハングル・アラビア文字を消していた。** ASCII＋かな＋漢字だけを許可リストにしていたため、ロシア語・韓国語・アラビア語の利用者は**正解を入力しても必ず不正解**になり、この App の厳しいSRSでは不正解＝最初からやり直しなので、入力式の復習が学習履歴を破壊していた
- **1文字入力が正解になっていた。** 「important」に対して「a」が正解扱い（部分一致に長さの下限が無かった）。単なるズルではなく、**次の出題間隔が延びてしまう**
- **`migrateWord` の `typeof x!=='number'` が NaN を通していた。** NaN の box → `INTERVALS[box]` が undefined → 次回出題日が NaN → NaN は決して「今日以前」にならず、**その単語は二度と復習に出てこない**

## Firestore ルールのテスト

`firestore.rules` を**エミュレータ上で実際に動かして**検証します。ルールは読んで正しそうに見えても動かないことがあるため、コンソールに貼る前にここを通してください。

実際にこれで見つかった不具合:

- `match /{document=**}` は rules_version 2 では**0個以上**のパスに一致するため、親ドキュメント（`users/{uid}`）にも無条件の `write` を与えていた。権限はOR結合されるので、**ニックネームの7日制限が完全に無効化されていた**（即時に何度でも改名できた）
- `allow write` は削除も含むが、削除時 `request.resource` は null。`.data` を読むと例外になり、例外は拒否として扱われるため、**本人が自分のドキュメントを削除できなくなっていた**

## 使い方

Java が必要です（`java -version` で確認）。

ターミナル1: エミュレータを起動

```bash
npx --yes firebase-tools emulators:start --only firestore --project wordkeep-bb145
```

`firebase.json` に `{"firestore":{"rules":"firestore.rules"},"emulators":{"firestore":{"port":8099},"ui":{"enabled":false}}}` が必要です。

ターミナル2: テストを実行

```bash
cd tests && npm install @firebase/rules-unit-testing firebase && FIRESTORE_EMULATOR_HOST=127.0.0.1:8099 node rules.test.mjs && FIRESTORE_EMULATOR_HOST=127.0.0.1:8099 node rules.signup.test.mjs
```

## 何を検証しているか

`rules.test.mjs`（25件）

- 本人だけが自分の単語と要約を読み書きでき、他人からは読めない
- **管理者は要約を読めるが、単語の中身は1件も読めない・一覧もできない**
- **管理者は単語をIDで削除できる**（`wordIds` から取得。読めないまま削除だけできる）
- 管理者は他人の要約を書き換えられない
- ニックネーム: 初回設定は可、即時の改名は不可、7日経過後は可、`nicknameAt` を過去に偽装しても不可（保存済みの値で判定するため）
- 通常の同期（ニックネームを同じ値で書き戻す／含めない）はクールダウンに引っかからない
- 本人は自分のデータを削除できる
- フィードバックは誰でも送れるが、空・2000文字超は拒否。読めるのは管理者だけ

`rules.signup.test.mjs`（6件）— 新規登録の実経路。ドキュメントが存在しない状態からの作成、初回ニックネーム設定、連続同期。

## 注意

ログに出る `evaluation error at L35` は、**実際には発生しない操作種別**（既存ドキュメントへの `create` など）に対する評価で出るもので、拒否の結果は正しく、許可されるべき操作が拒否されることはありません。全31件の合格がその裏付けです。
