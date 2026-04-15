# Auto Fill Profile — Chrome拡張機能（日本語版）

Zoom・セミナー・Google Form 等の入力フォームに、予め登録したプロフィール情報をワンクリックで自動入力するChrome拡張機能です。

## ✨ 機能

| 項目 | 入力方式 | 対応フォーム |
|---|---|---|
| 姓・名 | テキスト自動入力 | 姓名分離 / 一括どちらも対応 |
| 施設名・組織名 | テキスト自動入力 | 医療機関名・企業名等にも対応 |
| メールアドレス | テキスト自動入力 | — |
| 電話番号 | テキスト自動入力 | — |
| 都道府県 | テキスト / プルダウン | — |
| 役職 | ラジオボタン / プルダウン | 理事長・院長・勤務医 等 |
| 診療科 | ラジオボタン / プルダウン | 内科・外科 等 |
| 職種 | ラジオボタン / プルダウン | 医師・看護師・薬剤師 等 |

## 🖥️ 対応サイト

- Google Forms
- Zoom ウェビナー登録フォーム
- セミナー申し込みフォーム
- その他の一般的なWebフォーム

## 📁 ファイル構成

```
auto-fill-profile-jp/
├── manifest.json   … 拡張機能の設定ファイル（Manifest V3）
├── popup.html      … ポップアップ画面のHTML
├── popup.js        … ポップアップの保存・自動入力ロジック
├── content.js      … フォーム解析・値セットのロジック
├── style.css       … ポップアップのスタイル
├── README.md       … このファイル
├── LICENSE         … ライセンス
├── .gitignore      … Git除外設定
└── icons/
    └── icon128.png … 拡張機能アイコン（128×128）
```

## 🚀 インストール方法

1. このリポジトリをクローンまたはダウンロード
   ```bash
   git clone https://github.com/moi-rmk/auto-fill-profile-jp.git
   ```
2. Chromeで `chrome://extensions` を開く
3. 右上の「デベロッパーモード」をONにする
4. 「パッケージ化されていない拡張機能を読み込む」をクリック
5. ダウンロードした `auto-fill-profile-jp` フォルダを選択
6. ツールバーにアイコンが表示されたら完了

## 📖 使い方

1. ツールバーの拡張アイコンをクリック
2. プロフィール情報（姓・名・施設名など）を入力し「💾 保存」
3. 入力したいフォームのページを開く
4. 拡張アイコンをクリック →「✏️ 自動入力」を押す
5. フォームに値が自動入力されます

## ⚙️ 技術仕様

- **Manifest Version**: V3
- **権限**: `storage`, `activeTab`, `scripting`
- **データ保存**: `chrome.storage.local`（ブラウザ内にローカル保存、外部送信なし）
- **フォーム検出**: ラベルテキスト・placeholder・aria-label 等からキーワードマッチ
- **SPA対応**: React等のフレームワークで管理されるinputにも対応（nativeValueSetter使用）

## 🔧 カスタマイズ

- **キーワード追加**: `content.js` の `FIELD_MAP` にキーワードを追加すれば、他のフォームラベルにも対応可能
- **項目追加**: `popup.html` にフィールドを追加し、`FIELD_MAP` に対応キーを追加

## 📝 ライセンス

MIT License

Copyright (c) 2026 Dr.MCY

- X (Twitter): [https://x.com/broadmann/](https://x.com/broadmann/)
