// extension/background.js

// ============================================
// 1. CREATE CONTEXT MENU ON EXTENSION INSTALL
// ============================================
// This runs ONCE when the extension is installed or updated.
// We create a right-click menu item that only appears when text is selected.

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "breakdownSelected",              // Unique ID to identify this menu item
    title: "⚡QUICK EXPLAIN💡🏃",          // What the user sees in the menu
    contexts: ["selection"]               // Only show when text is selected
  });

  console.log("Instant Breakdown AI: Context menu created.");
});


// ============================================
// 2. HANDLE CONTEXT MENU CLICK
// ============================================
// When the user clicks "Break this down", this fires.
// `info.selectionText` contains whatever text was highlighted.

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "breakdownSelected") {
    const selectedText = info.selectionText; // WE WILL STORE OUR SELECTED TEXT HERE

    if (!selectedText || selectedText.trim().length === 0) { 
      console.log("No text selected.");
      return;
    }

    console.log("Selected text:", selectedText.substring(0, 100) + "...");

    // First, tell the content script to show a loading state
    chrome.tabs.sendMessage(tab.id, {
      action: "showLoading"
    });

    // Send the text to our backend for AI processing
    fetchBreakdown(selectedText, tab.id);
  }
});


// ============================================
// 3. CALL THE BACKEND API
// ============================================
// Sends the selected text to our Flask server.
// The server calls the AI model and returns a structured breakdown.

async function fetchBreakdown(text, tabId) {
  try {
    const response = await fetch("http://localhost:5000/api/breakdown", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        text: text,
        mode: "deep"    // We'll add more modes in Phase 2
      })
    });

    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }

    const data = await response.json();

    // Send the AI response back to the content script to display
    chrome.tabs.sendMessage(tabId, {
      action: "showBreakdown",
      data: data
    });

  } catch (error) {
    console.error("Breakdown fetch failed:", error);

    // Tell content script to show the error
    chrome.tabs.sendMessage(tabId, {
      action: "showError",
      error: error.message
    });
  }
}