// ===== DOM 要素 =====
const lastNameEl      = document.getElementById('lastName');
const firstNameEl     = document.getElementById('firstName');
const lastNameKanaEl  = document.getElementById('lastNameKana');
const firstNameKanaEl = document.getElementById('firstNameKana');
const birthDateEl     = document.getElementById('birthDate');
const facilityEl      = document.getElementById('facility');
const emailEl         = document.getElementById('email');
const phoneEl         = document.getElementById('phone');
const postalCodeEl    = document.getElementById('postalCode');
const prefectureEl    = document.getElementById('prefecture');
const addressEl       = document.getElementById('address');
const jobTitleEl      = document.getElementById('jobTitle');
const departmentEl    = document.getElementById('department');
const jobTypeEl       = document.getElementById('jobType');
const saveBtn         = document.getElementById('save');
const fillBtn         = document.getElementById('fill');
const backupBtn       = document.getElementById('backup');
const restoreBtn      = document.getElementById('restore');
const restoreFileEl   = document.getElementById('restoreFile');
const statusEl        = document.getElementById('status');

// ===== フィールドキー一覧（順序固定） =====
const FIELD_KEYS = [
  'lastName', 'firstName', 'lastNameKana', 'firstNameKana',
  'birthDate', 'facility', 'email', 'phone',
  'postalCode', 'prefecture', 'address',
  'jobTitle', 'department', 'jobType',
];

const FIELD_ELS = {
  lastName: lastNameEl, firstName: firstNameEl,
  lastNameKana: lastNameKanaEl, firstNameKana: firstNameKanaEl,
  birthDate: birthDateEl, facility: facilityEl,
  email: emailEl, phone: phoneEl,
  postalCode: postalCodeEl, prefecture: prefectureEl,
  address: addressEl, jobTitle: jobTitleEl,
  department: departmentEl, jobType: jobTypeEl,
};

// ===== ヘルパー：フォームからプロフィールオブジェクトを作成 =====
function getProfileFromForm() {
  const profile = {};
  for (const key of FIELD_KEYS) {
    profile[key] = FIELD_ELS[key].value.trim();
  }
  return profile;
}

// ===== ヘルパー：プロフィールオブジェクトをフォームに反映 =====
function setFormFromProfile(p) {
  for (const key of FIELD_KEYS) {
    FIELD_ELS[key].value = p[key] || '';
  }
}

// ===== 起動時：保存済みデータを読み込む =====
chrome.storage.local.get(['profile'], (result) => {
  setFormFromProfile(result.profile || {});
});

// ===== 保存ボタン =====
saveBtn.addEventListener('click', () => {
  const profile = getProfileFromForm();
  chrome.storage.local.set({ profile }, () => {
    showStatus('✅ 保存しました');
  });
});

// ===== 自動入力ボタン =====
fillBtn.addEventListener('click', async () => {
  const { profile } = await chrome.storage.local.get(['profile']);
  if (!profile || (!profile.lastName && !profile.firstName)) {
    showStatus('⚠️ 先にプロフィールを保存してください');
    return;
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  // 全フレーム（iframe含む）にスクリプトを注入
  chrome.scripting.executeScript(
    { target: { tabId: tab.id, allFrames: true }, files: ['content.js'] },
    () => {
      if (chrome.runtime.lastError) {
        // allFrames で一部のフレームが失敗しても続行
        console.warn('executeScript warning:', chrome.runtime.lastError.message);
      }

      // 全フレームにメッセージを送信し、応答を集約
      sendFillMessageToAllFrames(tab.id, profile);
    }
  );
});

// ===== 全フレームにメッセージを送信し、応答を集約 =====
async function sendFillMessageToAllFrames(tabId, profile) {
  try {
    // タブ内の全フレームを取得
    const frames = await chrome.webNavigation.getAllFrames({ tabId });
    if (!frames || frames.length === 0) {
      // webNavigation が使えない場合は従来方式でフォールバック
      sendFillMessageSimple(tabId, profile);
      return;
    }

    let totalFilled = 0;
    let responseCount = 0;
    const totalFrames = frames.length;

    for (const frame of frames) {
      chrome.tabs.sendMessage(
        tabId,
        { action: 'fill', profile },
        { frameId: frame.frameId },
        (response) => {
          // エラーは無視（content script がないフレーム等）
          if (chrome.runtime.lastError) {
            // 無視
          } else if (response && response.filled > 0) {
            totalFilled += response.filled;
          }

          responseCount++;
          // 全フレームからの応答が揃ったら結果表示
          if (responseCount >= totalFrames) {
            if (totalFilled > 0) {
              showStatus(`✅ ${totalFilled} 件入力しました`);
            } else {
              showStatus('⚠️ 対象の入力欄が見つかりませんでした');
            }
          }
        }
      );
    }
  } catch (err) {
    // webNavigation 権限がない場合のフォールバック
    sendFillMessageSimple(tabId, profile);
  }
}

// ===== フォールバック: 従来の単純メッセージ送信 =====
function sendFillMessageSimple(tabId, profile) {
  chrome.tabs.sendMessage(tabId, { action: 'fill', profile }, (response) => {
    if (chrome.runtime.lastError) {
      showStatus('❌ このページでは実行できません');
      return;
    }
    if (response && response.filled > 0) {
      showStatus(`✅ ${response.filled} 件入力しました`);
    } else {
      showStatus('⚠️ 対象の入力欄が見つかりませんでした');
    }
  });
}

// ===== バックアップボタン（JSONダウンロード） =====
backupBtn.addEventListener('click', () => {
  const profile = getProfileFromForm();
  const json = JSON.stringify(profile, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const date = new Date().toISOString().slice(0, 10);
  a.download = `auto-fill-profile-backup-${date}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showStatus('📥 バックアップを保存しました');
});

// ===== リストアボタン（JSONアップロード） =====
restoreBtn.addEventListener('click', () => {
  restoreFileEl.click();
});

restoreFileEl.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const data = JSON.parse(ev.target.result);
      const hasValidKey = FIELD_KEYS.some(k => k in data);
      if (!hasValidKey) {
        showStatus('❌ 無効なバックアップファイルです');
        return;
      }
      setFormFromProfile(data);
      const profile = getProfileFromForm();
      chrome.storage.local.set({ profile }, () => {
        showStatus('📤 リストアしました（保存済み）');
      });
    } catch {
      showStatus('❌ JSONの読み込みに失敗しました');
    }
  };
  reader.readAsText(file);
  restoreFileEl.value = '';
});

// ===== ステータス表示 =====
function showStatus(msg) {
  statusEl.textContent = msg;
  setTimeout(() => { statusEl.textContent = ''; }, 3000);
}
