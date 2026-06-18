/* Externalized page logic for response-tracking.html (ARC-02 / SEC-03).
   Moved verbatim from the page's inline <script type="module"> block(s); no behavior
   change — handler functions remain window-attached. Page logic now lives in a real
   module file instead of an inline per-page monolith. */

        document.addEventListener('DOMContentLoaded', () => {
            if (window.Chrome) window.Chrome.bootstrap('response-track');
        });
