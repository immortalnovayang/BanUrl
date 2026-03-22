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

function getWeekdays() {
    return [...document.querySelectorAll('#weekdayGroup input[type="checkbox"]')]
        .filter(c => c.checked).map(c => parseInt(c.value));
}

function setWeekdays(weekdays) {
    document.querySelectorAll('#weekdayGroup input[type="checkbox"]')
        .forEach(c => { c.checked = weekdays.includes(parseInt(c.value)); });
    syncToggleBtn();
}

const DAY_SHORT = ['日', '一', '二', '三', '四', '五', '六'];

// ── Toggle-all button ─────────────────────────────────────
function syncToggleBtn() {
    const boxes = document.querySelectorAll('#weekdayGroup input[type="checkbox"]');
    document.getElementById('toggleAll').textContent =
        [...boxes].every(c => c.checked) ? '取消全選' : '全選';
}

document.getElementById('toggleAll').addEventListener('click', () => {
    const boxes = document.querySelectorAll('#weekdayGroup input[type="checkbox"]');
    const allChecked = [...boxes].every(c => c.checked);
    boxes.forEach(c => { c.checked = !allChecked; });
    syncToggleBtn();
});

document.querySelectorAll('#weekdayGroup input[type="checkbox"]')
    .forEach(c => c.addEventListener('change', syncToggleBtn));

// ── Status ────────────────────────────────────────────────
let statusTimer = null;
function showStatus(msg, type = '') {
    const el = document.getElementById('status');
    el.textContent = msg;
    el.className = type;
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => { el.textContent = ''; el.className = ''; }, 2500);
}

// ── Form helpers ──────────────────────────────────────────
function resetForm() {
    document.getElementById('urls').value = '';
    document.getElementById('startTime').value = '08:00';
    document.getElementById('endTime').value = '22:00';
    document.getElementById('editingId').value = '';
    setWeekdays([0, 1, 2, 3, 4, 5, 6]);
    document.getElementById('formTitle').textContent = '＋ 新增規則';
    document.getElementById('formTitle').classList.remove('edit-mode');
    document.getElementById('saveRule').textContent = '儲存規則';
    document.getElementById('saveRule').style.background = '#4CAF50';
    document.getElementById('cancelEdit').style.display = 'none';
}

function loadFormForEdit(rule) {
    document.getElementById('urls').value = rule.urls.join('\n');
    document.getElementById('startTime').value = rule.startTime;
    document.getElementById('endTime').value = rule.endTime;
    document.getElementById('editingId').value = rule.id;
    setWeekdays(rule.weekdays);
    document.getElementById('formTitle').textContent = '✏ 編輯規則';
    document.getElementById('formTitle').classList.add('edit-mode');
    document.getElementById('saveRule').textContent = '更新規則';
    document.getElementById('saveRule').style.background = '#1976d2';
    document.getElementById('cancelEdit').style.display = 'block';
    // Scroll to top of form
    document.getElementById('ruleForm').scrollIntoView({ behavior: 'smooth' });
}

document.getElementById('cancelEdit').addEventListener('click', resetForm);

// ── Save (add or update) ──────────────────────────────────
document.getElementById('saveRule').addEventListener('click', () => {
    const urlsText = document.getElementById('urls').value.trim();
    const startTime = document.getElementById('startTime').value;
    const endTime = document.getElementById('endTime').value;
    const weekdays = getWeekdays();
    const editingId = document.getElementById('editingId').value;

    if (!urlsText || !startTime || !endTime || weekdays.length === 0) {
        showStatus('請填寫所有欄位並至少選一天', 'error');
        return;
    }

    const urls = urlsText.split('\n')
        .map(u => normalizeDomainLine(u)).filter(u => u.length > 0);
    if (urls.length === 0) {
        showStatus('請至少輸入一個有效網域', 'error');
        return;
    }

    chrome.storage.sync.get({ rules: [] }, data => {
        let rules = data.rules;

        if (editingId) {
            // Update existing rule
            rules = rules.map(r =>
                r.id === editingId ? { ...r, urls, startTime, endTime, weekdays } : r
            );
            chrome.storage.sync.set({ rules }, () => {
                showStatus('規則已更新');
                resetForm();
                loadAndDisplayRules();
            });
        } else {
            // Add new rule
            rules.push({
                id: Date.now().toString(),
                urls, startTime, endTime, weekdays,
                enabled: true
            });
            chrome.storage.sync.set({ rules }, () => {
                showStatus('規則已新增');
                resetForm();
                loadAndDisplayRules();
            });
        }
    });
});

// ── Rules list ────────────────────────────────────────────
function isActiveNow(rule) {
    if (!rule.enabled) return false;
    const now = new Date();
    const day = now.getDay();
    const time = now.toTimeString().slice(0, 5);
    if (!rule.weekdays.includes(day)) return false;
    if (rule.startTime <= rule.endTime) {
        return time >= rule.startTime && time <= rule.endTime;
    }
    return time >= rule.startTime || time <= rule.endTime;
}

function loadAndDisplayRules() {
    chrome.storage.sync.get({ rules: [] }, data => {
        const list = document.getElementById('rulesList');
        list.innerHTML = '';

        if (data.rules.length === 0) {
            list.innerHTML = '<p class="empty-hint">尚無任何規則</p>';
            return;
        }

        data.rules.forEach(rule => {
            const active = isActiveNow(rule);
            const days = rule.weekdays.slice().sort((a, b) => a - b)
                .map(d => DAY_SHORT[d]).join('');

            const div = document.createElement('div');
            div.className = 'rule-item' +
                (active ? ' active-now' : '') +
                (!rule.enabled ? ' disabled' : '');

            div.innerHTML = `
                <div class="rule-item-top">
                    <div class="rule-urls">${rule.urls.join(', ')}</div>
                    <div class="rule-btns">
                        <button class="btn-edit" data-id="${rule.id}">編輯</button>
                        <button class="btn-toggle" data-id="${rule.id}" data-enabled="${rule.enabled}">
                            ${rule.enabled ? '停用' : '啟用'}
                        </button>
                        <button class="btn-delete" data-id="${rule.id}">刪除</button>
                    </div>
                </div>
                <div class="rule-meta">
                    ${rule.startTime} – ${rule.endTime}　週${days}
                    ${active ? '<span class="badge-active">封鎖中</span>' : ''}
                </div>`;

            list.appendChild(div);
        });

        list.querySelectorAll('.btn-edit').forEach(btn =>
            btn.addEventListener('click', () => {
                chrome.storage.sync.get({ rules: [] }, data => {
                    const rule = data.rules.find(r => r.id === btn.dataset.id);
                    if (rule) loadFormForEdit(rule);
                });
            })
        );

        list.querySelectorAll('.btn-toggle').forEach(btn =>
            btn.addEventListener('click', () => {
                const enabled = btn.dataset.enabled === 'true';
                chrome.storage.sync.get({ rules: [] }, data => {
                    const rules = data.rules.map(r =>
                        r.id === btn.dataset.id ? { ...r, enabled: !enabled } : r
                    );
                    chrome.storage.sync.set({ rules }, () => {
                        showStatus(`規則已${!enabled ? '啟用' : '停用'}`);
                        // If we were editing this rule, reset form
                        if (document.getElementById('editingId').value === btn.dataset.id) {
                            resetForm();
                        }
                        loadAndDisplayRules();
                    });
                });
            })
        );

        list.querySelectorAll('.btn-delete').forEach(btn =>
            btn.addEventListener('click', () => {
                if (!confirm('確定要刪除此規則嗎？')) return;
                chrome.storage.sync.get({ rules: [] }, data => {
                    const rules = data.rules.filter(r => r.id !== btn.dataset.id);
                    chrome.storage.sync.set({ rules }, () => {
                        showStatus('規則已刪除');
                        // If we were editing this rule, reset form
                        if (document.getElementById('editingId').value === btn.dataset.id) {
                            resetForm();
                        }
                        loadAndDisplayRules();
                    });
                });
            })
        );
    });
}

// ── Init ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    syncToggleBtn();
    loadAndDisplayRules();
});
