// ===== DOM 要素 =====
const lastNameEl      = document.getElementById('lastName');
const firstNameEl     = document.getElementById('firstName');
const lastNameKanaEl  = document.getElementById('lastNameKana');
const firstNameKanaEl = document.getElementById('firstNameKana');
const facilityEl      = document.getElementById('facility');
const emailEl         = document.getElementById('email');
const phoneEl         = document.getElementById('phone');
const prefectureEl    = document.getElementById('prefecture');
const jobTitleEl      = document.getElementById('jobTitle');
const departmentEl    = document.getElementById('department');
const jobTypeEl       = document.getElementById('jobType');
const saveBtn         = document.getElementById('save');
const fillBtn         = document.getElementById('fill');
const statusEl        = document.getElementById('status');

// ===== 起動時：保存済みデータを読み込む =====
chrome.storage.local.get(['profile'], (result) => {
  const p = result.profile || {};
  lastNameEl.value      = p.lastName      || '';
  firstNameEl.value     = p.firstName     || '';
  lastNameKanaEl.value  = p.lastNameKana  || '';
  firstNameKanaEl.value = p.firstNameKana || '';
  facilityEl.value      = p.facility      || '';
  emailEl.value         = p.email         || '';
  phoneEl.value         = p.phone         || '';
  prefectureEl.value    = p.prefecture    || '';
  jobTitleEl.value      = p.jobTitle      || '';
  departmentEl.value    = p.department    || '';
  jobTypeEl.value       = p.jobType       || '';
});

// ===== 保存ボタン =====
saveBtn.addEventListener('click', () => {
  const profile = {
    lastName:      lastNameEl.value.trim(),
    firstName:     firstNameEl.value.trim(),
    lastNameKana:  lastNameKanaEl.value.trim(),
    firstNameKana: firstNameKanaEl.value.trim(),
    facility:      facilityEl.value.trim(),
    email:         emailEl.value.trim(),
    phone:         phoneEl.value.trim(),
    prefecture:    prefectureEl.value.trim(),
    jobTitle:      jobTitleEl.value.trim(),
    department:    departmentEl.value.trim(),
    jobType:       jobTypeEl.value.trim(),
  };
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

  chrome.scripting.executeScript(
    { target: { tabId: tab.id }, files: ['content.js'] },
    () => {
      chrome.tabs.sendMessage(tab.id, { action: 'fill', profile }, (response) => {
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
  );
});

// ===== ステータス表示 =====
function showStatus(msg) {
  statusEl.textContent = msg;
  setTimeout(() => { statusEl.textContent = ''; }, 3000);
}
