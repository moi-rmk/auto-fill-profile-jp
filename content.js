// ======================================================
// content.js — フォーム自動入力 v3.5.1（日本語版）
//   v3.5.1: iframe対応 + 全ページリトライ（SPA限定を廃止）
//   v3.5: Microsoft Forms対応 + SPAリトライ機構 + guessLabel親要素探索強化
//   v3.4: input[type="email"]直接マッチ + autocomplete属性対応 + guessLabel強化
//   v3.3.1: Google Forms 日付フィールド対応を強化
//   v3.3: Bug修正 + 生年月日・郵便番号・住所対応
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
  prefecture: ['都道府県', '都道府県名', 'prefecture', 'state', 'province'],
  jobTitle:   ['役職', '職位', '肩書', 'ご役職', 'job title', 'position', 'role'],
  department: ['診療科', '科目', '専門科', '標榜科', 'department', 'specialty', 'clinical department'],
  jobType:    ['職種', 'ご職種', '資格', 'occupation', 'job type', 'profession'],
  birthDate:  ['生年月日', '誕生日', 'birthday', 'date of birth', 'birth date', '生まれ'],
  postalCode: ['郵便番号', 'postal code', 'zip code', 'zip', '〒', 'zipcode', 'postcode'],
  address:    ['住所', 'address', '所在地'],
};

// --- autocomplete 属性値 → フィールドキーのマッピング ---
const AUTOCOMPLETE_MAP = {
  'email':              'email',
  'organization':       'facility',
  'organization-title': 'jobTitle',
  'tel':                'phone',
  'tel-national':       'phone',
  'tel-local':          'phone',
  'postal-code':        'postalCode',
  'address-line1':      'address',
  'address-line2':      'address',
  'street-address':     'address',
  'address-level1':     'prefecture',
  'bday':               'birthDate',
  'family-name':        'lastName',
  'given-name':         'firstName',
  'name':               'fullName',
};

// --------------------------------------------------
// メッセージ受信（全ページリトライ対応）
// --------------------------------------------------
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action !== 'fill') return;

  const profile = msg.profile;
  profile.fullName = [profile.lastName, profile.firstName].filter(Boolean).join(' ');
  profile.fullNameKana = [profile.lastNameKana, profile.firstNameKana].filter(Boolean).join(' ');

  function attemptFill() {
    let filled = 0;

    if (isGoogleForm()) {
      filled += fillGoogleFormBuiltinEmail(profile);
      filled += fillGoogleForm(profile);
      filled += fillGoogleFormRadio(profile);
      filled += fillGoogleFormDate(profile);
    }

    if (filled === 0 && isMicrosoftForm()) {
      filled += fillMicrosoftForm(profile);
    }

    if (filled === 0) {
      filled += fillGenericForm(profile);
    }

    return filled;
  }

  let filled = attemptFill();

  // 全ページでリトライ（動的フォームの描画完了待ち）
  if (filled === 0) {
    let retries = 0;
    const maxRetries = 3;
    const retryInterval = 500;

    const retryTimer = setInterval(() => {
      retries++;
      filled = attemptFill();

      if (filled > 0 || retries >= maxRetries) {
        clearInterval(retryTimer);
        sendResponse({ filled });
      }
    }, retryInterval);

    return true; // 非同期応答のためチャネルを開いたままにする
  }

  sendResponse({ filled });
});

// ==================================================
// フォーム種別判定
// ==================================================
function isGoogleForm() {
  return location.hostname.includes('docs.google.com') &&
         location.pathname.startsWith('/forms');
}

function isMicrosoftForm() {
  return location.hostname.includes('forms.cloud.microsoft') ||
         location.hostname.includes('forms.office.com') ||
         location.hostname.includes('forms.microsoft.com');
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

function wantsKatakana(originalLabel) {
  return /\u30D5\u30EA\u30AC\u30CA|\u30AB\u30CA|\u30AB\u30BF\u30AB\u30CA/.test(originalLabel);
}

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
  if (FIELD_MAP.fullNameKana.some((kw) => label.includes(kw.toLowerCase()))) {
    return 'fullNameKana';
  }
  if (FIELD_MAP.lastNameKana.some((kw) => label.includes(kw.toLowerCase()))) {
    return 'lastNameKana';
  }
  if (FIELD_MAP.firstNameKana.some((kw) => label.includes(kw.toLowerCase()))) {
    return 'firstNameKana';
  }
  if (/ふりがな|フリガナ|かな|カナ/.test(label)) {
    return 'fullNameKana';
  }

  if (FIELD_MAP.phone.some((kw) => label.includes(kw.toLowerCase()))) {
    return 'phone';
  }
  if (FIELD_MAP.email.some((kw) => label.includes(kw.toLowerCase()))) {
    return 'email';
  }
  if (FIELD_MAP.postalCode.some((kw) => label.includes(kw.toLowerCase()))) {
    return 'postalCode';
  }
  if (FIELD_MAP.birthDate.some((kw) => label.includes(kw.toLowerCase()))) {
    return 'birthDate';
  }
  if (FIELD_MAP.address.some((kw) => label.includes(kw.toLowerCase()))) {
    return 'address';
  }

  if (FIELD_MAP.facility.some((kw) => label.includes(kw.toLowerCase()))) {
    return 'facility';
  }

  if (FIELD_MAP.lastName.some((kw) => label.includes(kw.toLowerCase()))) {
    return 'lastName';
  }

  if (FIELD_MAP.firstName.some((kw) => label.includes(kw.toLowerCase()))) {
    return 'firstName';
  }
  if (isExactMei(label)) {
    return 'firstName';
  }

  const otherKeys = ['prefecture', 'jobTitle', 'department', 'jobType'];
  for (const key of otherKeys) {
    if (FIELD_MAP[key].some((kw) => label.includes(kw.toLowerCase()))) {
      return key;
    }
  }

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
// プロフィールから値を取得
// ==================================================
function getProfileValue(profile, key, originalLabel) {
  const value = profile[key];
  if (!value) return value;

  if (key === 'fullNameKana' || key === 'lastNameKana' || key === 'firstNameKana') {
    return convertKana(value, originalLabel);
  }
  return value;
}

// ==================================================
// autocomplete 属性からフィールドキーを取得
// ==================================================
function getKeyFromAutocomplete(el) {
  const ac = (el.getAttribute('autocomplete') || '').trim().toLowerCase();
  if (!ac || ac === 'off' || ac === 'on' || ac === 'new-password' || ac === 'current-password') {
    return null;
  }
  const tokens = ac.split(/\s+/);
  const lastToken = tokens[tokens.length - 1];
  return AUTOCOMPLETE_MAP[lastToken] || null;
}

// ==================================================
// Google Form 組み込みメール欄の自動入力
// ==================================================
function fillGoogleFormBuiltinEmail(profile) {
  if (!profile.email) return 0;
  let filled = 0;

  const emailByName = document.querySelector('input[name="emailAddress"]');
  if (emailByName && (!emailByName.value || emailByName.value.trim() === '')) {
    setNativeValue(emailByName, profile.email);
    filled++;
    return filled;
  }

  const emailInputs = document.querySelectorAll('input[type="email"]');
  for (const input of emailInputs) {
    if (input.closest('[data-params]')) continue;
    if (input.value && input.value.trim() !== '') continue;
    setNativeValue(input, profile.email);
    filled++;
    return filled;
  }

  const allInputs = document.querySelectorAll('input');
  for (const input of allInputs) {
    if (input.closest('[data-params]')) continue;
    if (input.value && input.value.trim() !== '') continue;
    const ariaLabel = (input.getAttribute('aria-label') || '').toLowerCase();
    if (ariaLabel.includes('メール') || ariaLabel.includes('email') ||
        ariaLabel.includes('e-mail') || ariaLabel.includes('mail address')) {
      setNativeValue(input, profile.email);
      filled++;
      return filled;
    }
  }

  return filled;
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
    if (key && key !== 'birthDate') {
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
// 日付コンポーネント判定ヘルパー
// ==================================================
function classifyDateInput(input) {
  const aria = (input.getAttribute('aria-label') || '');
  const ph   = (input.placeholder || '');
  const combined = (aria + ' ' + ph).toLowerCase();
  const ml   = input.getAttribute('maxlength');

  if (/年|year|jahr|année|año|ano|anno|년|yyyy|jjjj|aaaa/i.test(combined)) {
    return 'year';
  }
  if (/月|month|monat|mois|mes|mês|mese|월/i.test(combined)) {
    return 'month';
  }
  if (/日|day|tag|jour|día|dia|giorno|일/i.test(combined)) {
    return 'day';
  }

  if (ml === '4') return 'year';

  return null;
}

// ==================================================
// Google Form 日付フィールド
// ==================================================
function fillGoogleFormDate(profile) {
  if (!profile.birthDate) return 0;

  const parts = profile.birthDate.split('-');
  if (parts.length !== 3) return 0;
  const [yearStr, monthStr, dayStr] = parts;
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);
  if (isNaN(year) || isNaN(month) || isNaN(day)) return 0;

  let filled = 0;
  const questionBlocks = document.querySelectorAll('[data-params]');

  questionBlocks.forEach((block) => {
    const labelEl = block.querySelector('[role="heading"]')
                 || block.querySelector('.freebirdFormviewItemItemTitle');
    if (!labelEl) return;

    const labelText = normalizeLabel(labelEl.textContent);
    const key = matchFieldKey(labelText);
    if (key !== 'birthDate') return;

    const dateInput = block.querySelector('input[type="date"]');
    if (dateInput) {
      setNativeValue(dateInput, profile.birthDate);
      filled++;
      return;
    }

    const allInputs = Array.from(block.querySelectorAll('input'));
    const candidateInputs = allInputs.filter((inp) => {
      const t = (inp.type || '').toLowerCase();
      return !['submit', 'hidden', 'radio', 'checkbox', 'button', 'date'].includes(t);
    });

    let yearInput = null;
    let monthInput = null;
    let dayInput = null;
    let filledInBlock = false;

    for (const inp of candidateInputs) {
      const cls = classifyDateInput(inp);
      if (cls === 'year')  yearInput  = inp;
      if (cls === 'month') monthInput = inp;
      if (cls === 'day')   dayInput   = inp;
    }

    if (yearInput || monthInput || dayInput) {
      if (yearInput)  setNativeValue(yearInput,  String(year));
      if (monthInput) setNativeValue(monthInput, String(month));
      if (dayInput)   setNativeValue(dayInput,   String(day));
      filledInBlock = true;
    }

    if (!filledInBlock) {
      const selects = Array.from(block.querySelectorAll('select'));
      for (const sel of selects) {
        const aria = (sel.getAttribute('aria-label') || '').toLowerCase();
        let targetValue = null;

        if (/年|year|jahr|année|año|anno|년|jjjj|aaaa/i.test(aria)) {
          targetValue = String(year);
        } else if (/月|month|monat|mois|mes|mese|월/i.test(aria)) {
          targetValue = String(month);
        } else if (/日|day|tag|jour|día|dia|giorno|일/i.test(aria)) {
          targetValue = String(day);
        }

        if (targetValue) {
          for (const opt of sel.options) {
            if (opt.value === targetValue || opt.text.trim() === targetValue) {
              sel.value = opt.value;
              sel.dispatchEvent(new Event('change', { bubbles: true }));
              filledInBlock = true;
              break;
            }
          }
        }
      }
    }

    if (!filledInBlock && candidateInputs.length >= 2) {
      const yearByMl = candidateInputs.find((inp) => inp.getAttribute('maxlength') === '4');
      const others = candidateInputs.filter((inp) => inp !== yearByMl);

      if (yearByMl && others.length >= 2) {
        setNativeValue(yearByMl, String(year));
        setNativeValue(others[0], String(month));
        setNativeValue(others[1], String(day));
        filledInBlock = true;
      }
    }

    if (!filledInBlock && candidateInputs.length >= 3) {
      setNativeValue(candidateInputs[0], String(year));
      setNativeValue(candidateInputs[1], String(month));
      setNativeValue(candidateInputs[2], String(day));
      filledInBlock = true;
    }

    if (!filledInBlock && candidateInputs.length === 2) {
      setNativeValue(candidateInputs[0], String(month));
      setNativeValue(candidateInputs[1], String(day));
      filledInBlock = true;
    }

    if (filledInBlock) filled++;
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
// Microsoft Forms 専用ハンドラ
// ==================================================
function fillMicrosoftForm(profile) {
  let filled = 0;

  const questionContainers = document.querySelectorAll(
    '[data-automation-id="questionItem"], ' +
    '.office-form-question, ' +
    '[role="group"], ' +
    '.question-content, ' +
    '[class*="question"], ' +
    '[class*="Question"]'
  );

  if (questionContainers.length > 0) {
    filled += fillMicrosoftFormFromContainers(profile, questionContainers);
  }

  if (filled === 0) {
    filled += fillMicrosoftFormDirect(profile);
  }

  return filled;
}

function fillMicrosoftFormFromContainers(profile, containers) {
  let filled = 0;

  containers.forEach((container) => {
    const labelEl = container.querySelector(
      '[data-automation-id="questionTitle"], ' +
      '.question-title-box, ' +
      '[class*="title"], ' +
      '[class*="Title"], ' +
      'legend, ' +
      'label, ' +
      'span[id]'
    );

    let originalLabel = '';
    if (labelEl) {
      originalLabel = labelEl.textContent.trim();
    } else {
      const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
      let textNode = walker.nextNode();
      while (textNode) {
        const text = textNode.textContent.trim();
        if (text.length > 0 && text.length < 200) {
          originalLabel = text;
          break;
        }
        textNode = walker.nextNode();
      }
    }

    if (!originalLabel) return;

    const label = normalizeLabel(originalLabel);
    const key = matchFieldKey(label);
    if (!key) return;

    const input = container.querySelector(
      'input[type="text"], input[type="email"], input[type="tel"], ' +
      'input[type="date"], input:not([type]), textarea'
    );
    if (!input) return;
    if (input.value && input.value.trim() !== '') return;

    if (key === 'birthDate' && profile.birthDate) {
      setNativeValue(input, profile.birthDate);
      filled++;
      return;
    }

    const value = getProfileValue(profile, key, originalLabel);
    if (value) {
      setNativeValue(input, value);
      filled++;
    }
  });

  return filled;
}

function fillMicrosoftFormDirect(profile) {
  let filled = 0;

  const inputs = document.querySelectorAll(
    'input[type="text"], input[type="email"], input[type="tel"], ' +
    'input[type="date"], input:not([type]), textarea'
  );

  inputs.forEach((input) => {
    if (input.value && input.value.trim() !== '') return;
    if (input.type === 'hidden' || input.type === 'submit' || input.type === 'button') return;

    if (input.type === 'email' && profile.email) {
      setNativeValue(input, profile.email);
      filled++;
      return;
    }

    const acKey = getKeyFromAutocomplete(input);
    if (acKey) {
      const acValue = (acKey === 'birthDate') ? profile.birthDate : profile[acKey];
      if (acValue) {
        setNativeValue(input, acValue);
        filled++;
        return;
      }
    }

    const originalLabel = guessLabelDeep(input);
    const label = normalizeLabel(originalLabel);
    if (!label) return;

    const key = matchFieldKey(label);
    if (key) {
      if (key === 'birthDate' && profile.birthDate) {
        setNativeValue(input, profile.birthDate);
        filled++;
        return;
      }
      const value = getProfileValue(profile, key, originalLabel);
      if (value) {
        setNativeValue(input, value);
        filled++;
      }
    }
  });

  filled += fillRadioButtons(profile);

  return filled;
}

// ==================================================
// 汎用フォーム テキスト入力
// ==================================================
function fillGenericForm(profile) {
  let filled = 0;

  const inputs = document.querySelectorAll(
    'input[type="text"], input[type="email"], input[type="tel"], input[type="date"], input:not([type]), textarea'
  );

  inputs.forEach((input) => {
    if (input.value && input.value.trim() !== '') return;
    if (input.type === 'hidden' || input.type === 'submit' || input.type === 'button') return;

    if (input.type === 'email' && profile.email) {
      setNativeValue(input, profile.email);
      filled++;
      return;
    }

    const acKey = getKeyFromAutocomplete(input);
    if (acKey) {
      if (acKey === 'birthDate' && profile.birthDate) {
        setNativeValue(input, profile.birthDate);
        filled++;
        return;
      }
      const acValue = profile[acKey];
      if (acValue) {
        setNativeValue(input, acValue);
        filled++;
        return;
      }
    }

    const originalLabel = guessLabelDeep(input);
    const label = normalizeLabel(originalLabel);
    if (!label) return;

    const key = matchFieldKey(label);
    if (key) {
      if (key === 'birthDate' && profile.birthDate) {
        setNativeValue(input, profile.birthDate);
        filled++;
        return;
      }
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
    const acKey = getKeyFromAutocomplete(sel);
    const target = acKey
      ? selectTargets.find((t) => t.key === acKey)
      : null;

    if (target && target.value) {
      for (const opt of sel.options) {
        if (opt.text.toLowerCase().includes(target.value.toLowerCase()) ||
            opt.value.toLowerCase().includes(target.value.toLowerCase())) {
          sel.value = opt.value;
          sel.dispatchEvent(new Event('change', { bubbles: true }));
          filled++;
          return;
        }
      }
    }

    const label = normalizeLabel(guessLabelDeep(sel));
    if (!label) return;

    const fieldKey = matchFieldKey(label);
    if (!fieldKey) return;

    const fallbackTarget = selectTargets.find((t) => t.key === fieldKey);
    if (!fallbackTarget || !fallbackTarget.value) return;

    for (const opt of sel.options) {
      if (opt.text.toLowerCase().includes(fallbackTarget.value.toLowerCase()) ||
          opt.value.toLowerCase().includes(fallbackTarget.value.toLowerCase())) {
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
    const label = document.querySelector(`label[for="${CSS.escape(radio.id)}"]`);
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
// ラジオボタンのグループラベル
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
// ラベル推測（強化版）
// ==================================================
function guessLabelDeep(el) {
  const basic = guessLabel(el);
  if (basic) {
    const testLabel = normalizeLabel(basic);
    if (matchFieldKey(testLabel)) return basic;
  }

  let parent = el.parentElement;
  for (let depth = 0; depth < 6 && parent; depth++) {
    const candidates = parent.querySelectorAll(
      'label, legend, ' +
      '[class*="title"], [class*="Title"], [class*="label"], [class*="Label"], ' +
      '[data-automation-id="questionTitle"], ' +
      '[role="heading"], ' +
      'span[id], div[id]'
    );

    for (const cand of candidates) {
      if (cand === el || cand.contains(el)) continue;
      const text = cand.textContent.trim();
      if (text.length > 0 && text.length < 200) {
        const testLabel = normalizeLabel(text);
        if (matchFieldKey(testLabel)) return text;
      }
    }

    const prevSibling = parent.previousElementSibling;
    if (prevSibling) {
      const text = prevSibling.textContent.trim();
      if (text.length > 0 && text.length < 200) {
        const testLabel = normalizeLabel(text);
        if (matchFieldKey(testLabel)) return text;
      }
    }

    parent = parent.parentElement;
  }

  return basic || '';
}

// ==================================================
// ラベル推測（基本版）
// ==================================================
function guessLabel(el) {
  if (el.id) {
    const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
    if (label) return label.textContent.trim();
  }

  const parentLabel = el.closest('label');
  if (parentLabel) return parentLabel.textContent.trim();

  if (el.getAttribute('aria-label')) return el.getAttribute('aria-label');

  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const ids = labelledBy.split(/\s+/);
    const texts = ids.map((id) => {
      const labelEl = document.getElementById(id);
      return labelEl ? labelEl.textContent.trim() : '';
    }).filter(Boolean);
    if (texts.length > 0) return texts.join(' ');
  }

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
  el.dispatchEvent(new Event('blur', { bubbles: true }));
}
