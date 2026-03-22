// ── Utility ──────────────────────────────────────────────
function normalizeDomainLine(input) {
    if (!input) return '';
    let s = input.trim().toLowerCase().replace(/^https?:\/\//, '');
    try {
        const url = new URL('http://' + s);
        let host = url.hostname;
        if (host.startsWith('www.')) host = host.substring(4);
        return host;
    } catch (e) {
        return s.replace(/^www\./, '');
    }
}

function getWeekdays(containerId) {
    const boxes = document.querySelectorAll(`#${containerId} input[type="checkbox"]`);
    return [...boxes].filter(c => c.checked).map(c => parseInt(c.value));
}

function setWeekdays(containerId, weekdays) {
    const boxes = document.querySelectorAll(`#${containerId} input[type="checkbox"]`);
    boxes.forEach(c => { c.checked = weekdays.includes(parseInt(c.value)); });
}

const DAY_NAMES = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

// ── Toggle-all button ────────────────────────────────────
function syncToggleAllBtn(containerId, btnId) {
    const boxes = document.querySelectorAll(`#${containerId} input[type="checkbox"]`);
    const allChecked = [...boxes].every(c => c.checked);
    document.getElementById(btnId).textContent = allChecked ? '取消全選' : '全選';
}

function bindToggleAll(containerId, btnId) {
    const btn = document.getElementById(btnId);
    const getBoxes = () => document.querySelectorAll(`#${containerId} input[type="checkbox"]`);

    // Sync label on any checkbox change
    getBoxes().forEach(c => {
        c.addEventListener('change', () => syncToggleAllBtn(containerId, btnId));
    });

    btn.addEventListener('click', () => {
        const boxes = getBoxes();
        const allChecked = [...boxes].every(c => c.checked);
        boxes.forEach(c => { c.checked = !allChecked; });
        syncToggleAllBtn(containerId, btnId);
    });

    syncToggleAllBtn(containerId, btnId); // initial label
}

// ── Status toast ─────────────────────────────────────────
let statusTimer = null;
function showStatus(message, type = 'success') {
    const el = document.getElementById('status');
    el.textContent = message;
    el.className = type;
    el.style.display = 'block';
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => { el.style.display = 'none'; }, 2500);
}

// ── General settings ─────────────────────────────────────
function loadSettings() {
    chrome.storage.sync.get({
        customBlockMessage: '此網站已被時段封鎖，請在指定時間後再瀏覽。',
        overrideEnabled: false
    }, data => {
        document.getElementById('customMessage').value = data.customBlockMessage;
        document.getElementById('overrideEnabled').checked = data.overrideEnabled;
    });
}

document.getElementById('saveSettings').addEventListener('click', () => {
    const customMessage = document.getElementById('customMessage').value.trim();
    const overrideEnabled = document.getElementById('overrideEnabled').checked;
    chrome.storage.sync.set({
        customBlockMessage: customMessage || '此網站已被時段封鎖，請在指定時間後再瀏覽。',
        overrideEnabled
    }, () => showStatus('設定已儲存'));
});

// ── Rules list ───────────────────────────────────────────
function loadAndDisplayRules() {
    chrome.storage.sync.get({ rules: [] }, data => {
        const container = document.getElementById('rulesContainer');
        container.innerHTML = '';

        if (data.rules.length === 0) {
            container.innerHTML = '<p class="empty-hint">目前沒有任何規則，點擊「新增規則」開始設定。</p>';
            return;
        }

        data.rules.forEach(rule => {
            const days = rule.weekdays
                .slice().sort((a, b) => a - b)
                .map(d => DAY_NAMES[d]).join('、');

            const div = document.createElement('div');
            div.className = 'rule-item' + (rule.enabled ? '' : ' disabled');
            div.innerHTML = `
                <div class="rule-header">
                    <div class="rule-title">${rule.urls.join(', ') || '(無網域)'}</div>
                    <div class="rule-actions">
                        <button class="btn-blue edit-btn" data-id="${rule.id}">編輯</button>
                        <button class="btn-orange toggle-btn" data-id="${rule.id}" data-enabled="${rule.enabled}">
                            ${rule.enabled ? '停用' : '啟用'}
                        </button>
                        <button class="btn-danger delete-btn" data-id="${rule.id}">刪除</button>
                    </div>
                </div>
                <div class="rule-details">
                    <span><strong>時間：</strong>${rule.startTime} – ${rule.endTime}</span>
                    <span><strong>週幾：</strong>${days}</span>
                    <span class="status-badge ${rule.enabled ? 'on' : 'off'}">${rule.enabled ? '啟用中' : '已停用'}</span>
                </div>`;
            container.appendChild(div);
        });

        container.querySelectorAll('.edit-btn').forEach(btn =>
            btn.addEventListener('click', () => openEditModal(btn.dataset.id)));
        container.querySelectorAll('.toggle-btn').forEach(btn =>
            btn.addEventListener('click', () => toggleRule(btn.dataset.id, btn.dataset.enabled === 'true')));
        container.querySelectorAll('.delete-btn').forEach(btn =>
            btn.addEventListener('click', () => deleteRule(btn.dataset.id)));
    });
}

// ── Add rule (inline form) ───────────────────────────────
const addSection = document.getElementById('addRuleSection');

document.getElementById('addRuleBtn').addEventListener('click', () => {
    const isVisible = addSection.style.display === 'block';
    if (isVisible) {
        addSection.style.display = 'none';
    } else {
        // Reset to defaults
        document.getElementById('addUrls').value = '';
        document.getElementById('addStartTime').value = '08:00';
        document.getElementById('addEndTime').value = '22:00';
        setWeekdays('addWeekdays', [0, 1, 2, 3, 4, 5, 6]);
        syncToggleAllBtn('addWeekdays', 'addToggleAll');
        addSection.style.display = 'block';
        document.getElementById('addUrls').focus();
    }
});

document.getElementById('cancelAddRule').addEventListener('click', () => {
    addSection.style.display = 'none';
});

document.getElementById('saveNewRule').addEventListener('click', () => {
    const urlsText = document.getElementById('addUrls').value.trim();
    const startTime = document.getElementById('addStartTime').value;
    const endTime = document.getElementById('addEndTime').value;
    const weekdays = getWeekdays('addWeekdays');

    if (!urlsText || !startTime || !endTime || weekdays.length === 0) {
        showStatus('請填寫所有欄位並至少選一天', 'error');
        return;
    }

    const urls = urlsText.split('\n')
        .map(u => normalizeDomainLine(u))
        .filter(u => u.length > 0);

    if (urls.length === 0) {
        showStatus('請至少輸入一個有效網域', 'error');
        return;
    }

    chrome.storage.sync.get({ rules: [] }, data => {
        const newRule = {
            id: Date.now().toString(),
            urls,
            startTime,
            endTime,
            weekdays,
            enabled: true
        };
        data.rules.push(newRule);
        chrome.storage.sync.set({ rules: data.rules }, () => {
            showStatus('規則已新增');
            addSection.style.display = 'none';
            loadAndDisplayRules();
        });
    });
});

// ── Edit rule (modal) ────────────────────────────────────
function openEditModal(id) {
    chrome.storage.sync.get({ rules: [] }, data => {
        const rule = data.rules.find(r => r.id === id);
        if (!rule) return;

        document.getElementById('editRuleId').value = rule.id;
        document.getElementById('editUrls').value = rule.urls.join('\n');
        document.getElementById('editStartTime').value = rule.startTime;
        document.getElementById('editEndTime').value = rule.endTime;
        setWeekdays('editWeekdays', rule.weekdays);
        syncToggleAllBtn('editWeekdays', 'editToggleAll');

        document.getElementById('editModal').classList.add('show');
    });
}

function closeEditModal() {
    document.getElementById('editModal').classList.remove('show');
    document.getElementById('editRuleForm').reset();
}

document.getElementById('cancelEdit').addEventListener('click', closeEditModal);

// Close modal when clicking overlay
document.getElementById('editModal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeEditModal();
});

document.getElementById('editRuleForm').addEventListener('submit', e => {
    e.preventDefault();

    const id = document.getElementById('editRuleId').value;
    const urlsText = document.getElementById('editUrls').value.trim();
    const startTime = document.getElementById('editStartTime').value;
    const endTime = document.getElementById('editEndTime').value;
    const weekdays = getWeekdays('editWeekdays');

    if (!urlsText || !startTime || !endTime || weekdays.length === 0) {
        showStatus('請填寫所有欄位並至少選一天', 'error');
        return;
    }

    const urls = urlsText.split('\n')
        .map(u => normalizeDomainLine(u))
        .filter(u => u.length > 0);

    if (urls.length === 0) {
        showStatus('請至少輸入一個有效網域', 'error');
        return;
    }

    chrome.storage.sync.get({ rules: [] }, data => {
        const rules = data.rules.map(r =>
            r.id === id ? { ...r, urls, startTime, endTime, weekdays } : r
        );
        chrome.storage.sync.set({ rules }, () => {
            showStatus('規則已更新');
            closeEditModal();
            loadAndDisplayRules();
        });
    });
});

// ── Toggle / Delete ──────────────────────────────────────
function toggleRule(id, currentEnabled) {
    chrome.storage.sync.get({ rules: [] }, data => {
        const rules = data.rules.map(r =>
            r.id === id ? { ...r, enabled: !currentEnabled } : r
        );
        chrome.storage.sync.set({ rules }, () => {
            showStatus(`規則已${!currentEnabled ? '啟用' : '停用'}`);
            loadAndDisplayRules();
        });
    });
}

function deleteRule(id) {
    if (!confirm('確定要刪除此規則嗎？')) return;
    chrome.storage.sync.get({ rules: [] }, data => {
        const rules = data.rules.filter(r => r.id !== id);
        chrome.storage.sync.set({ rules }, () => {
            showStatus('規則已刪除');
            loadAndDisplayRules();
        });
    });
}

// ── Import / Export ──────────────────────────────────────
document.getElementById('exportRules').addEventListener('click', () => {
    chrome.storage.sync.get({ rules: [], customBlockMessage: '', overrideEnabled: false }, data => {
        const blob = new Blob([JSON.stringify({ ...data, exportedAt: new Date().toISOString() }, null, 2)], { type: 'application/json' });
        const a = Object.assign(document.createElement('a'), {
            href: URL.createObjectURL(blob),
            download: `timespan-blocker-${new Date().toISOString().slice(0, 10)}.json`
        });
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
        showStatus('規則已匯出');
    });
});

document.getElementById('importFileBtn').addEventListener('click', () =>
    document.getElementById('importFile').click());

document.getElementById('importFile').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = event => {
        try {
            const imported = JSON.parse(event.target.result);
            if (!imported.rules || !Array.isArray(imported.rules)) throw new Error('無效的規則資料');
            chrome.storage.sync.set({
                rules: imported.rules,
                customBlockMessage: imported.customBlockMessage || '此網站已被時段封鎖，請在指定時間後再瀏覽。',
                overrideEnabled: imported.overrideEnabled || false
            }, () => {
                showStatus('規則已匯入');
                loadAndDisplayRules();
                e.target.value = '';
            });
        } catch (err) {
            showStatus('匯入失敗：' + err.message, 'error');
            e.target.value = '';
        }
    };
    reader.readAsText(file);
});

// ── Init ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    loadSettings();
    loadAndDisplayRules();
    bindToggleAll('addWeekdays', 'addToggleAll');
    bindToggleAll('editWeekdays', 'editToggleAll');
});
