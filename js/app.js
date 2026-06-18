/* ============================================================
   Single platform bootstrap entry (ARC-01).
   ------------------------------------------------------------
   Imports the shared service modules in their canonical dependency
   order so core initialization order is enforced by the ES module
   GRAPH — not by the (previously fragile, and per-page inconsistent)
   ordering of <script> tags. Every page now loads ONE core entry
   (this file) followed by its page module.

   The window.* surface these modules expose (API, Sanitizer, State,
   Identity, Lookups, Telemetry, Chrome) is the intentional, documented
   platform contract consumed by the page modules and the data-act
   dispatcher. This is a deliberate dependency-free design (no bundler,
   no build step — BRD FR-008/010/NFR-001), now with a single, explicit
   boot sequence instead of implicit script-tag order.
   ============================================================ */
import './api.js';
import './sanitizer.js';
import './identity.js';
import './state.js';
import './lookups.js';
import './a11y.js';
import './telemetry.js';
import './chrome.js';
