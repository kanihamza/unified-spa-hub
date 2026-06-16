/* ============================================================
   DGO v2.1 — Page Accessibility (a11y) & Focus Traps Helper
   ============================================================ */

const A11y = (() => {
  // Global live regions for screen readers
  let liveAnnouncer = null;

  function announce(message, politeness = 'polite') {
    if (!liveAnnouncer) {
      liveAnnouncer = document.createElement('div');
      liveAnnouncer.id = 'dgo-a11y-live-region';
      liveAnnouncer.setAttribute('aria-live', politeness);
      liveAnnouncer.setAttribute('aria-atomic', 'true');
      liveAnnouncer.className = 'dgo-visually-hidden';
      document.body.appendChild(liveAnnouncer);
    }
    
    // Changing text triggers reader narration speaker voice
    liveAnnouncer.textContent = '';
    setTimeout(() => {
      liveAnnouncer.textContent = message;
    }, 100);
  }

  // Trap keyboard focus inside a modal element
  function trapFocus(modalEl) {
    const focusableElementsSelector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    const firstFocusableEl = modalEl.querySelector(focusableElementsSelector);
    const focusableContent = modalEl.querySelectorAll(focusableElementsSelector);
    const lastFocusableEl = focusableContent[focusableContent.length - 1];

    if (!firstFocusableEl) return;

    // Immediately focus first element
    setTimeout(() => firstFocusableEl.focus(), 150);

    const keyListener = function(e) {
      const isTabPressed = e.key === 'Tab';

      if (!isTabPressed) {
        return;
      }

      if (e.shiftKey) { // Shift+Tab
        if (document.activeElement === firstFocusableEl) {
          lastFocusableEl.focus();
          e.preventDefault();
        }
      } else { // Tab
        if (document.activeElement === lastFocusableEl) {
          firstFocusableEl.focus();
          e.preventDefault();
        }
      }
    };

    modalEl.addEventListener('keydown', keyListener);

    // Return detach function to cleanup event double binders
    return () => {
      modalEl.removeEventListener('keydown', keyListener);
    };
  }

  return {
    announce,
    trapFocus
  };
})();

window.A11y = A11y;
