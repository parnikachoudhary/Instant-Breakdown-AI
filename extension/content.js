// extension/content.js

// ============================================
// 1. LISTEN FOR MESSAGES FROM BACKGROUND
// ============================================
// The background script sends us messages when:
// - It wants us to show a loading state
// - It has a breakdown ready to display
// - An error occurred

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case "showLoading":
      showLoadingIndicator();// WE WILL DEFINE THIS
      break;

    case "showBreakdown":
      hideLoadingIndicator(); // WE WILL DEFINE THIS
      showBreakdownPopup(message.data); // THEN SHOW THE MESSAGE
      break;

    case "showError":
      hideLoadingIndicator();
      showErrorMessage(message.error);
      break;
  }
});


// ============================================
// 2. LOADING INDICATOR
// ============================================
// Shows a small floating indicator so the user knows something is happening.
// Without this, they'd click and wonder if it worked.

function showLoadingIndicator() {
  // Remove any existing popup or loader
  removeExistingElements();

  const loader = document.createElement("div"); // USING DOM WE CREATED AN ELEMENT
  loader.id = "ibd-loader"; // WE GIVE ITS ID
  loader.innerHTML = `     
    <div class="ibd-loader-content">
      <div class="ibd-spinner"></div>
      <span>Analyzing...</span>
    </div>
  `;                          // WE DEFINE ITS HTML CONTENT

  document.body.appendChild(loader); // NOW WE WANT TO DISPLAY THIS WHOLE ON THE PAGE BODY

  // Position near the mouse / selection
  positionElement(loader); // WE WILL DEFINE THIS
}

function hideLoadingIndicator() {
  const loader = document.getElementById("ibd-loader"); // WE SELECTED THE LOADER ID
  if (loader) {  // IF LOADER EXIST, THEN...
    loader.remove(); // REMOVE IT !
  }
}


// ============================================
// 3. DISPLAY BREAKDOWN POPUP
// ============================================
// Creates a floating popup with the AI-generated breakdown.
// This replaces the simple alert() from the very basic version.

function showBreakdownPopup(data) {
  removeExistingElements(); // CLEAN EVERYTHING

  const popup = document.createElement("div"); // FOR THE POPUP, WE CREATED AN ELEMENT
  popup.id = "ibd-popup"; // AGAIN DEFINING THE ID OF THE POPUP DIV 

  // Build the HTML for the breakdown
  // data contains: { topic, keyPoints, simpleExplanation, importantTerms }
  popup.innerHTML = `
    <div class="ibd-popup-container">
      <div class="ibd-popup-header">
        <span class="ibd-popup-title">🧠 COMPLETE ONE SHOT UNDERSTANDING </span>
        <button class="ibd-popup-close" id="ibd-close-btn">&times;</button> 
      </div>
      
      <div class="ibd-popup-body">
        <div class="ibd-section">
          <h3 class="ibd-section-title">📌TOPIC ?? </h3>
          <p class="ibd-section-content">${escapeHtml(data.topic)}</p>
        </div>

        <div class="ibd-section">
          <h3 class="ibd-section-title">🔑 KEY POINTS</h3>
          <ul class="ibd-key-points">
            ${(data.keyPoints || []).map(point => 
              `<li>${escapeHtml(point)}</li>`
            ).join("")}
          </ul>
        </div>

        <div class="ibd-section">
          <h3 class="ibd-section-title">💡 SIMPLE EXPLANATION</h3>
          <p class="ibd-section-content">${escapeHtml(data.simpleExplanation)}</p>
        </div>

        ${data.newTermsWithMeaning && data.newTermsWithMeaning.length > 0 ? `
          <div class="ibd-section">
            <h3 class="ibd-section-title">📚 IMPORTANT TERMS</h3>
            <ul class="ibd-terms">
              ${(data.newTermsWithMeaning || []).map(item => 
                `<li>
                  <strong>${escapeHtml(item.term || '')}</strong>
                  <span>${escapeHtml(item.definition || '')}</span>
                </li>`
              ).join("")}
              </ul>
            </div>
          </div>
        ` : ""}
      </div>

      <div class="ibd-popup-footer">
        <span class="ibd-branding">Instant Breakdown AI</span>
      </div>
    </div>
  `;

  document.body.appendChild(popup); // DISPLAY/ PUT THE CONTENT ON THE PAGE/ BODY OF THE DOCUMENT
  positionElement(popup);

  // Close button handler
  document.getElementById("ibd-close-btn").addEventListener("click", () => {
    popup.remove();
  });

  // Close when clicking outside
  document.addEventListener("click", function closeOnOutside(e) {
    if (!popup.contains(e.target)) {
      popup.remove();
      document.removeEventListener("click", closeOnOutside);
    }
  });

  // Close on Escape key
  document.addEventListener("keydown", function closeOnEscape(e) {
    if (e.key === "Escape") {
      popup.remove();
      document.removeEventListener("keydown", closeOnEscape);
    }
  });
}


// ============================================
// 4. ERROR MESSAGE
// ============================================

function showErrorMessage(error) {
  removeExistingElements();

  const popup = document.createElement("div");
  popup.id = "ibd-popup";
  popup.innerHTML = `
    <div class="ibd-popup-container ibd-error">
      <div class="ibd-popup-header">
        <span class="ibd-popup-title">⚠️ Breakdown Failed</span>
        <button class="ibd-popup-close" id="ibd-close-btn">&times;</button>
      </div>
      <div class="ibd-popup-body">
        <p class="ibd-section-content">
          Could not analyze the text. Please try again.<br>
          <small style="color: #999;">${escapeHtml(error)}</small>
        </p>
      </div>
    </div>
  `;

  document.body.appendChild(popup);
  positionElement(popup);

  document.getElementById("ibd-close-btn").addEventListener("click", () => {
    popup.remove();
  });
}


// ============================================
// 5. UTILITY FUNCTIONS
// ============================================

// Remove any existing popups or loaders to avoid duplicates
function removeExistingElements() {
  const existing = document.querySelectorAll("#ibd-popup, #ibd-loader"); // WHAT CAN EXIST, WE CAPTURED THEIR IDs(POPUP AND LOADER)
  existing.forEach(el => el.remove()); // THEN WE SELECT EACH ID, AND REMOVE IT.
}

// Position the element near the user's selection
function positionElement(element) {
  const selection = window.getSelection();

  if (selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    // Position below the selection
    const top = rect.bottom + window.scrollY + 10;
    const left = Math.max(10, rect.left + window.scrollX);

    element.style.position = "absolute";
    element.style.top = `${top}px`;
    element.style.left = `${left}px`;
    element.style.zIndex = "2147483647"; // Maximum z-index to stay on top

    // Make sure it doesn't go off-screen to the right
    requestAnimationFrame(() => {
      const popupRect = element.getBoundingClientRect();
      if (popupRect.right > window.innerWidth) {
        element.style.left = `${window.innerWidth - popupRect.width - 20}px`;
      }
    });
  } else {
    // Fallback: center on screen
    element.style.position = "fixed";
    element.style.top = "50%";
    element.style.left = "50%";
    element.style.transform = "translate(-50%, -50%)";
    element.style.zIndex = "2147483647";
  }
}

// Prevent XSS by escaping HTML in AI responses
function escapeHtml(text) {
  if (!text) return "";
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}