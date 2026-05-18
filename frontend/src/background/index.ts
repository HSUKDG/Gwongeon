chrome.action.onClicked.addListener((tab) => {
  if (!tab.id) {
    return;
  }

  chrome.tabs.sendMessage(tab.id, { type: "HANSUNG_LINK_TOGGLE_OVERLAY" }, () => {
    void chrome.runtime.lastError;
  });
});
