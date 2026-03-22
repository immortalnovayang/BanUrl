// Background service worker for the Timespan Blocker extension

const OVERRIDE_KEY = 'timespanBlockerOverride';

// Time utility functions
function timeToMinutes(timeString) {
    const [hours, minutes] = timeString.split(':').map(Number);
    return hours * 60 + minutes;
}

// Check if current time is within a time range (handles overnight ranges)
function isTimeInRange(currentTime, startTime, endTime) {
    const current = timeToMinutes(currentTime);
    const start = timeToMinutes(startTime);
    const end = timeToMinutes(endTime);

    if (start <= end) {
        return current >= start && current <= end;
    } else {
        // Overnight range (e.g., 22:00-02:00)
        return current >= start || current <= end;
    }
}

// Check if a URL matches any of the blocked domains
function isUrlBlocked(url, blockedUrls) {
    try {
        const urlObj = new URL(url);
        const hostname = urlObj.hostname.toLowerCase();

        return blockedUrls.some(blockedUrl => {
            const blockedLower = blockedUrl.toLowerCase();
            return hostname === blockedLower || hostname.endsWith('.' + blockedLower);
        });
    } catch (e) {
        return false;
    }
}

// Load settings from storage
async function loadSettings() {
    return new Promise((resolve) => {
        chrome.storage.sync.get({
            customBlockMessage: '此網站已被時段封鎖，請在指定時間後再瀏覽。',
            overrideEnabled: false,
            rules: []
        }, resolve);
    });
}

// Read override state from chrome.storage.session
async function getOverride() {
    return new Promise((resolve) => {
        chrome.storage.session.get(OVERRIDE_KEY, (data) => {
            resolve(data[OVERRIDE_KEY] || null);
        });
    });
}

async function setOverride(value) {
    return new Promise((resolve) => {
        chrome.storage.session.set({ [OVERRIDE_KEY]: value }, resolve);
    });
}

async function removeOverride() {
    return new Promise((resolve) => {
        chrome.storage.session.remove(OVERRIDE_KEY, resolve);
    });
}

// Check if a request should be blocked
async function shouldBlockRequest(url) {
    const { rules } = await loadSettings();
    const now = new Date();
    const currentDay = now.getDay(); // 0-6, Sunday is 0
    const currentTime = now.toTimeString().slice(0, 5); // HH:mm

    // Check for active override (temporary allow)
    const overrideData = await getOverride();
    if (overrideData) {
        if (Date.now() < overrideData.expires) {
            return false; // Override still active
        } else {
            await removeOverride(); // Expired, clean up
        }
    }

    // Check each rule
    for (const rule of rules) {
        if (!rule.enabled) continue;
        if (!rule.weekdays.includes(currentDay)) continue;
        if (!isTimeInRange(currentTime, rule.startTime, rule.endTime)) continue;
        if (isUrlBlocked(url, rule.urls)) return true;
    }

    return false;
}

// Handle messages from content scripts and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'checkBlock') {
        shouldBlockRequest(message.url).then((shouldBlock) => {
            sendResponse({ shouldBlock });
        });
        return true; // async response
    }

    if (message.action === 'requestOverride') {
        const expires = Date.now() + 15 * 60 * 1000; // 15 minutes
        setOverride({ expires }).then(() => {
            sendResponse({ success: true, message: '已授予15分鐘的覆寫權限' });
        });
        return true; // async response
    }

    return false;
});

// Periodically clean up expired overrides
chrome.alarms.create('cleanupOverrides', { periodInMinutes: 5 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === 'cleanupOverrides') {
        const overrideData = await getOverride();
        if (overrideData && Date.now() >= overrideData.expires) {
            await removeOverride();
        }
    }
});

// Listen for storage changes
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync' && (changes.rules || changes.overrideEnabled)) {
        console.log('Rules or settings updated');
    }
});

console.log('Timespan Blocker background service started');
