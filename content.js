// ======================================================
// content.js — フォーム自動入力 v3.2（日本語版）
//   v3.2: ふりがな（ひらがな）/ フリガナ（カタカナ）自動判定対応
// ======================================================

// --- キーワード定義 ---
const FIELD_MAP = {
  lastName:      ['姓', 'せい', 'last name', 'family name', 'surname'],
  firstName:     ['first name', 'given name'],
  fullName:      ['名前', '氏名', 'お名前', 'フルネーム', 'full name', 'your name'],
  fullNameKana:  ['氏名（ふりがな）', '氏名（フリガナ）', '氏名（かな）', '氏名（カナ）',
                  '名前（ふりがな）', '名前（フリガナ）', '名前（かな）', '名前（カナ）',
                  'お名前（ふりがな）', 'お名前（フリガナ）',
                  '氏名フリガナ', '氏名ふりがな', '名前フリガナ', '名前ふりがな'],
  lastNameKana:  ['姓（ふりがな）', '姓（フリガナ）', '姓（かな）', '姓（カナ）',
                  'せい（ふりがな）', 'せい（フリガナ）',
                  '姓フリガナ', '姓ふりがな'],
  firstNameKana: ['名（ふりがな）', '名（フリガナ）', '名（かな）', '名（カナ）',
                  'めい（ふりがな）', 'めい（フリガナ）',
                  '名フリガナ', '名ふりがな'],
  facility:  [
    '施設', '組織', '会社', '所属', '勤務先', '法人',
    '医療機関', '病院', 'クリニック', '企業名', '企業',
    '団体', '事業所', '院名', '機関名',
    'organization', 'company', 'affiliation', 'institution',
    'hospital', 'clinic', 'employer'
  ],
  email:      ['メール', 'email', 'e-mail', 'メールアドレス', 'eメール', 'mail'],
  phone:      ['電話', 'tel', 'phone', '連絡先', '携帯'],
  prefecture: ['都道府県', '都道府県名', 'prefecture', 'state', 'province', '所在地'],
  jobTitle:   ['役職', '職位', '肩書', 'ご役職', 'job title', 'position', 'role'],
  department: ['診療科', '科目', '専門科', '標榜科', 'department', 'specialty', 'clinical department'],
  jobType:    ['職種', 'ご職種', '資格', 'occupation', 'job type', 'profession'],
};

// --------------------------------------------------
// メッセージ受信
// --------------------------------------------------
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action !== 'fill') return;

  const profile = msg.profile;
  profile.fullName = [profile.lastName, profile.firstName].filter(Boolean).join(' ');
  // フルネームのふりがなを合成
  profile.fullNameKana = [profile.lastNameKana, profile.firstNameKana].filter(Boolean).join(' ');

  let filled = 0;

  if (isGoogleForm()) {
    filled += fillGoogleForm(profile);
    filled += fillGoogleFormRadio(profile);
  }

  if (filled === 0) {
    filled += fillGenericForm(profile);
  }

  sendResponse({ filled });
});

// ==================================================
// Google Form 判定
// ==================================================
function isGoogleForm() {
  return location.hostname.includes('docs.google.com') &&
         location.pathname.startsWith('/forms');
}

// ==================================================
// ひらがな ↔ カタカナ 変換
// ==================================================
function toKatakana(str) {
  return str.replace(/[\u3041-\u3096]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) + 0x60)
  );
}

function toHiragana(str) {
  return str.replace(/[\u30A1-\u30F6]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60)
  );
}

// ==================================================
// ラベルがカタカナを要求しているか判定
//   ラベルにカタカナが含まれていればカタカナ、そうでなければひらがな
// ==================================================
function wantsKatakana(originalLabel) {
  return /\u30D5\u30EA\u30AC\u30CA|\u30AB\u30CA|\u30AB\u30BF\u30AB\u30CA/.test(originalLabel);
}

// ==================================================
// ふりがな値をラベルに応じて変換して返す
// ==================================================
function convertKana(value, originalLabel) {
  if (!value) return value;
  if (wantsKatakana(originalLabel)) {
    return toKatakana(value);
  }
  return toHiragana(value);
}

// ==================================================
// ラベルを正規化（必須マーク等を除去）
// ==================================================
function normalizeLabel(text) {
  return text
    .trim()
    .toLowerCase()
    .replace(/[\s*\uFF0A\u203B]+$/g, '')
    .replace(/^[\s*\uFF0A\u203B]+/g, '')
    .trim();
}

// ==================================================
// ラベルからフィールドキーを特定
// ==================================================
function matchFieldKey(label) {
  // 0) ふりがな系を最優先（「氏名」「名前」より先に判定）
  if (FIELD_MAP.fullNameKana.some((kw) => label.includes(kw.toLowerCase()))) {
    return 'fullNameKana';
  }
  if (FIELD_MAP.lastNameKana.some((kw) => label.includes(kw.toLowerCase()))) {
    return 'lastNameKana';
  }
  if (FIELD_MAP.firstNameKana.some((kw) => label.includes(kw.toLowerCase()))) {
    return 'firstNameKana';
  }
  // 「ふりがな」「フリガナ」「かな」「カナ」がラベルに含まれていればフルネームふりがなと判定
  if (/ふりがな|フリガナ|かな|カナ/.test(label)) {
    return 'fullNameKana';
  }

  // 1) 施設系を優先
  if (FIELD_MAP.facility.some((kw) => label.includes(kw.toLowerCase()))) {
    return 'facility';
  }

  // 2) 姓
  if (FIELD_MAP.lastName.some((kw) => label.includes(kw.toLowerCase()))) {
    return 'lastName';
  }

  // 3) 名（英語キーワード）
  if (FIELD_MAP.firstName.some((kw) => label.includes(kw.toLowerCase()))) {
    return 'firstName';
  }
  if (isExactMei(label)) {
    return 'firstName';
  }

  // 4) その他
  const otherKeys = ['email', 'phone', 'prefecture', 'jobTitle', 'department', 'jobType'];
  for (const key of otherKeys) {
    if (FIELD_MAP[key].some((kw) => label.includes(kw.toLowerCase()))) {
      return key;
    }
  }

  // 5) フルネーム（最後に判定）
  if (FIELD_MAP.fullName.some((kw) => label.includes(kw.toLowerCase()))) {
    return 'fullName';
  }
  if (/\bname\b/i.test(label) && !label.includes('company') && !label.includes('organization')) {
    return 'fullName';
  }

  return null;
}

// ==================================================
// 「名」の厳密マッチ
// ==================================================
function isExactMei(label) {
  const falsePositives = [
    '名前', '氏名', '企業名', '機関名', '施設名', '院名',
    '団体名', '法人名', '会社名', '事業所名', '組織名',
    '都道府県名', 'フルネーム'
  ];
  for (const fp of falsePositives) {
    if (label.includes(fp.toLowerCase())) return false;
  }

  const cleaned = label.replace(/[\s*\uFF0A\u203B:\uFF1A()\uFF08\uFF09]/g, '').trim();
  if (cleaned === '名' || cleaned === 'めい') return true;

  if (/(?:^|[\s\uFF08(])名(?:$|[\s\uFF09):\uFF1A*\uFF0A\u203B])/.test(label)) return true;
  if (label === '名') return true;

  return false;
}

// ==================================================
// プロフィールから値を取得（ふりがなはラベルに応じて変換）
// ==================================================
function getProfileValue(profile, key, originalLabel) {
  const value = profile[key];
  if (!value) return value;

  // ふりがな系のキーならラベルに応じて変換
  if (key === 'fullNameKana' || key === 'lastNameKana' || key === 'firstNameKana') {
    return convertKana(value, originalLabel);
  }
  return value;
}

// ==================================================
// Google Form テキスト入力
// ==================================================
function fillGoogleForm(profile) {
  let filled = 0;
  const questionBlocks = document.querySelectorAll('[data-params]');

  questionBlocks.forEach((block) => {
    const labelEl = block.querySelector('[role="heading"]')
                 || block.querySelector('.freebirdFormviewItemItemTitle');
    if (!labelEl) return;

    const originalLabel = labelEl.textContent.trim();
    const labelText = normalizeLabel(originalLabel);

    const input = block.querySelector(
      'input[type="text"], input[type="email"], input[type="tel"], textarea'
    );
    if (!input) return;

    const key = matchFieldKey(labelText);
    if (key) {
      const value = getProfileValue(profile, key, originalLabel);
      if (value) {
        setNativeValue(input, value);
        filled++;
      }
    }
  });

  return filled;
}

// ==================================================
// Google Form ラジオボタン / プルダウン
// ==================================================
function fillGoogleFormRadio(profile) {
  let filled = 0;

  const radioTargets = [
    { key: 'jobTitle',   value: profile.jobTitle },
    { key: 'department', value: profile.department },
    { key: 'jobType',    value: profile.jobType },
    { key: 'prefecture', value: profile.prefecture },
  ];

  const questionBlocks = document.querySelectorAll('[data-params]');

  questionBlocks.forEach((block) => {
    const labelEl = block.querySelector('[role="heading"]')
                 || block.querySelector('.freebirdFormviewItemItemTitle');
    if (!labelEl) return;

    const groupLabel = normalizeLabel(labelEl.textContent);
    const fieldKey = matchFieldKey(groupLabel);
    if (!fieldKey) return;

    const target = radioTargets.find((t) => t.key === fieldKey);
    if (!target || !target.value) return;

    const options = block.querySelectorAll('[role="radio"], [data-value]');
    for (const opt of options) {
      const optText = opt.textContent.trim().toLowerCase();
      if (optText.includes(target.value.toLowerCase()) ||
          target.value.toLowerCase().includes(optText)) {
        opt.click();
        filled++;
        return;
      }
    }

    const select = block.querySelector('select');
    if (select) {
      for (const opt of select.options) {
        if (opt.text.toLowerCase().includes(target.value.toLowerCase())) {
          select.value = opt.value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
          filled++;
          return;
        }
      }
    }
  });

  return filled;
}

// ==================================================
// 汎用フォーム テキスト入力（Zoom 等）
// ==================================================
function fillGenericForm(profile) {
  let filled = 0;

  const inputs = document.querySelectorAll(
    'input[type="text"], input[type="email"], input[type="tel"], input:not([type]), textarea'
  );

  inputs.forEach((input) => {
    if (input.value && input.value.trim() !== '') return;

    const originalLabel = guessLabel(input);
    const label = normalizeLabel(originalLabel);
    if (!label) return;

    const key = matchFieldKey(label);
    if (key) {
      const value = getProfileValue(profile, key, originalLabel);
      if (value) {
        setNativeValue(input, value);
        filled++;
      }
    }
  });

  const selectTargets = [
    { key: 'prefecture', value: profile.prefecture },
    { key: 'jobTitle',   value: profile.jobTitle },
    { key: 'department', value: profile.department },
    { key: 'jobType',    value: profile.jobType },
  ];

  const selects = document.querySelectorAll('select');
  selects.forEach((sel) => {
    const label = normalizeLabel(guessLabel(sel));
    if (!label) return;

    const fieldKey = matchFieldKey(label);
    if (!fieldKey) return;

    const target = selectTargets.find((t) => t.key === fieldKey);
    if (!target || !target.value) return;

    for (const opt of sel.options) {
      if (opt.text.toLowerCase().includes(target.value.toLowerCase()) ||
          opt.value.toLowerCase().includes(target.value.toLowerCase())) {
        sel.value = opt.value;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        filled++;
        break;
      }
    }
  });

  filled += fillRadioButtons(profile);

  return filled;
}

// ==================================================
// ラジオボタン / チェックボックスの自動選択
// ==================================================
function fillRadioButtons(profile) {
  let filled = 0;

  const radioTargets = [
    { key: 'jobTitle',   value: profile.jobTitle },
    { key: 'department', value: profile.department },
    { key: 'jobType',    value: profile.jobType },
    { key: 'prefecture', value: profile.prefecture },
  ];

  for (const target of radioTargets) {
    if (!target.value) continue;

    const radios = document.querySelectorAll('input[type="radio"], input[type="checkbox"]');

    for (const radio of radios) {
      const radioLabel = getRadioLabel(radio).toLowerCase();
      if (!radioLabel) continue;

      if (radioLabel.includes(target.value.toLowerCase()) ||
          target.value.toLowerCase().includes(radioLabel)) {

        const groupLabel = normalizeLabel(getRadioGroupLabel(radio));

        if (!groupLabel) {
          radio.click();
          filled++;
          break;
        }

        const fieldKey = matchFieldKey(groupLabel);
        if (fieldKey === target.key) {
          radio.click();
          filled++;
          break;
        }
      }
    }
  }

  return filled;
}

// ==================================================
// ラジオボタン個別のラベルを取得
// ==================================================
function getRadioLabel(radio) {
  if (radio.id) {
    const label = document.querySelector(`label[for="${radio.id}"]`);
    if (label) return label.textContent.trim();
  }

  const parentLabel = radio.closest('label');
  if (parentLabel) return parentLabel.textContent.trim();

  const next = radio.nextSibling;
  if (next && next.textContent) return next.textContent.trim();

  const nextEl = radio.nextElementSibling;
  if (nextEl) return nextEl.textContent.trim();

  if (radio.value) return radio.value;

  return '';
}

// ==================================================
// ラジオボタンのグループラベル（質問タイトル）を取得
// ==================================================
function getRadioGroupLabel(radio) {
  const fieldset = radio.closest('fieldset');
  if (fieldset) {
    const legend = fieldset.querySelector('legend');
    if (legend) return legend.textContent.trim();
  }

  let parent = radio.parentElement;
  for (let i = 0; i < 5 && parent; i++) {
    const prev = parent.previousElementSibling;
    if (prev) {
      const text = prev.textContent.trim();
      if (text.length > 0 && text.length < 100) return text;
    }
    parent = parent.parentElement;
  }

  return '';
}

// ==================================================
// ラベル推測（input / select / textarea 共用）
// ==================================================
function guessLabel(el) {
  if (el.id) {
    const label = document.querySelector(`label[for="${el.id}"]`);
    if (label) return label.textContent.trim();
  }

  const parentLabel = el.closest('label');
  if (parentLabel) return parentLabel.textContent.trim();

  if (el.getAttribute('aria-label')) return el.getAttribute('aria-label');
  if (el.placeholder) return el.placeholder;
  if (el.name) return el.name;

  const prev = el.previousElementSibling;
  if (prev) return prev.textContent.trim();

  return '';
}

// ==================================================
// React / SPA 対応の値セット
// ==================================================
function setNativeValue(el, value) {
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype, 'value'
  )?.set;
  const nativeTextareaValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype, 'value'
  )?.set;

  const setter = el.tagName === 'TEXTAREA'
    ? nativeTextareaValueSetter
    : nativeInputValueSetter;

  if (setter) {
    setter.call(el, value);
  } else {
    el.value = value;
  }

  el.dispatchEvent(new Event('input',  { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}
