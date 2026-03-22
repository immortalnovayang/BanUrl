// Content script for the Timespan Blocker extension

// Wait for the DOM to be ready
document.addEventListener('DOMContentLoaded', async () => {
    // Check if we should block this page
    const shouldBlock = await checkIfShouldBlock(window.location.href);
    if (shouldBlock) {
        blockPage();
    }
});

// Function to check if the current URL should be blocked
async function checkIfShouldBlock(url) {
    try {
        // Send a message to the background script to check if the URL should be blocked
        // We'll use a custom message for this purpose
        return new Promise((resolve) => {
            chrome.runtime.sendMessage({ action: 'checkBlock', url: url }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error('Error checking block status:', chrome.runtime.lastError);
                    resolve(false);
                } else {
                    resolve(response && response.shouldBlock);
                }
            });
        });
    } catch (error) {
        console.error('Error in checkIfShouldBlock:', error);
        return false;
    }
}

// Function to block the page and show a custom message
function blockPage() {
    // Create a blocking overlay
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.backgroundColor = 'rgba(255, 255, 255, 0.95)';
    overlay.style.display = 'flex';
    overlay.style.flexDirection = 'column';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.zIndex = '9999';
    overlay.style.fontFamily = 'Arial, sans-serif';

    // Get custom message from storage
    chrome.storage.sync.get({ customBlockMessage: '此網站已被時段封鎖，請在指定時間後再瀏覽。' }, (data) => {
        const message = data.customBlockMessage;

        // Create message element
        const messageElement = document.createElement('div');
        messageElement.textContent = message;
        messageElement.style.fontSize = '24px';
        messageElement.style.color = '#333';
        messageElement.style.textAlign = 'center';
        messageElement.style.maxWidth = '80%';
        messageElement.style.marginBottom = '20px';
        messageElement.style.lineHeight = '1.5';

        // Check if override is enabled
        chrome.storage.sync.get({ overrideEnabled: false }, (data) => {
            if (data.overrideEnabled) {
                // Create override button
                const overrideButton = document.createElement('button');
                overrideButton.textContent = '暫時解除封鎖 (15分鐘)';
                overrideButton.style.padding = '10px 20px';
                overrideButton.style.fontSize = '16px';
                overrideButton.style.backgroundColor = '#4CAF50';
                overrideButton.style.color = 'white';
                overrideButton.style.border = 'none';
                overrideButton.style.borderRadius = '4px';
                overrideButton.style.cursor = 'pointer';
                overrideButton.style.transition = 'background-color 0.3s';

                overrideButton.addEventListener('mouseover', () => {
                    overrideButton.style.backgroundColor = '#45a049';
                });

                overrideButton.addEventListener('mouseout', () => {
                    overrideButton.style.backgroundColor = '#4CAF50';
                });

                overrideButton.addEventListener('click', () => {
                    // Request override from background script
                    chrome.runtime.sendMessage({ action: 'requestOverride' }, (response) => {
                        if (chrome.runtime.lastError) {
                            alert('無法請求覆寫：' + chrome.runtime.lastError.message);
                        } else if (response && response.success) {
                            // Reload the page to allow access
                            window.location.reload();
                        } else {
                            alert('覆寫請求失敗');
                        }
                    });
                });

                overlay.appendChild(messageElement);
                overlay.appendChild(overrideButton);
            } else {
                overlay.appendChild(messageElement);
            }
        });
    });

    // Add the overlay to the page
    document.body.appendChild(overlay);

    // Optionally, hide the original content (but leave it accessible for inspection)
    // We'll set the body's overflow to hidden to prevent scrolling of the background
    document.body.style.overflow = 'hidden';
}

// Listen for messages from the background script (if we decide to use two-way communication)
// For now, we are using the background script to check via sendMessage in checkIfShouldBlock
// But we can also set up a listener if needed for other purposes.

// We'll also handle the case where the page is already loaded and we get a message to block
// However, our initial check on DOMContentLoaded should be sufficient.

// Note: We are not using the webRequest API in the content script because we are using it in the background.
// This content script is a fallback for pages that might have already loaded before the webRequest could intercept.
// However, in Manifest V3, the webRequest API in the background service worker should be sufficient.
// We'll keep this content script as a safety net and for displaying the block page.

// Let's also set up a listener for messages from the background script in case we want to trigger a block/reload dynamically.
// For example, if the user changes settings and we want to re-evaluate the current tab.

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'blockPage') {
        blockPage();
        return true; // Indicates we will respond asynchronously (though we don't have a response)
    }
    if (message.action === 'reloadPage') {
        window.location.reload();
        return true;
    }
    return false;
});

// We'll also add a resize handler to adjust the overlay if needed, but it's not strictly necessary.

// Finally, we can log that the content script has loaded for debugging purposes.
// console.log('Timespan Blocker content script loaded');