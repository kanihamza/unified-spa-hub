/* ============================================================
   DGO v2.2 — Secure OTP Identity Validation Engine
   ============================================================ */

const Identity = (() => {
  // CONFIGURATION SECURITY BOUNDARY (FR-036 / EXC-01). OTP is intentionally DISABLED
  // during the current build/remediation phase, as a tracked governance exception.
  // The gateway + admin-bypass logic below remain in place for re-enablement at closure.
  const OTP_SECURITY_ACTIVE = false;

  // Roles permitted to bypass the OTP gateway when it is re-enabled (e.g. Director General).
  const ADMIN_ROLE_CODES = ['DG'];

  const TOKEN_KEY = "dgo_auth_token";
  const USER_KEY = "dgo_session_user";

  function isSecurityActive() {
    return OTP_SECURITY_ACTIVE;
  }

  function getSession() {
    const token = localStorage.getItem(TOKEN_KEY);
    const user = localStorage.getItem(USER_KEY);
    if (!token || !user) return null;
    try {
      const parsedUser = JSON.parse(user);
      if (new Date(parsedUser.expiresAt) < new Date()) {
        clearSession();
        return null;
      }
      return { token, user: parsedUser };
    } catch {
      return null;
    }
  }

  function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }

  async function requestOTP(email) {
    if (!email || !email.includes('@')) {
      throw new Error("Invalid email address format.");
    }
    try {
      if (window.Telemetry) window.Telemetry.log("otp_request_start", { email });
      const response = await window.API.callPA('E16', { email });
      if (response.success) {
        if (window.Telemetry) window.Telemetry.log("otp_request_success", { email });
        return true;
      }
      throw new Error(response.message || "Failed to issue validation request.");
    } catch (e) {
      if (window.Telemetry) window.Telemetry.log("otp_request_failed", { email, error: e.message });
      throw e;
    }
  }

  async function verifyOTP(email, otp) {
    if (!otp || otp.length !== 6) {
      throw new Error("OTP must be exactly 6 digits.");
    }
    try {
      if (window.Telemetry) window.Telemetry.log("otp_verify_start", { email });
      const response = await window.API.callPA('E17', { email, otp });
      
      if (response.success && response.token) {
        const userPayload = {
          id: response.user.id,
          name: response.user.name,
          role: response.user.role,
          roleCode: response.user.roleCode,
          dsu: response.user.dsu,
          email: email,
          expiresAt: response.expiresAt || new Date(Date.now() + 28800000).toISOString()
        };

        localStorage.setItem(TOKEN_KEY, response.token);
        localStorage.setItem(USER_KEY, JSON.stringify(userPayload));

        if (window.Telemetry) window.Telemetry.log("otp_verify_success", { email, role: userPayload.roleCode });
        return userPayload;
      }
      throw new Error(response.message || "Invalid or expired OTP token.");
    } catch (e) {
      if (window.Telemetry) window.Telemetry.log("otp_verify_failed", { email, error: e.message });
      throw e;
    }
  }

  // Resolve the active identity: an authenticated OTP session if present, else the
  // active platform identity (sidebar identity switcher / State default).
  function getActiveIdentity() {
    const session = getSession();
    if (session && session.user) return session.user;
    if (window.State && typeof window.State.getActiveUser === 'function') {
      return window.State.getActiveUser();
    }
    try {
      const raw = localStorage.getItem(USER_KEY);
      if (raw) return JSON.parse(raw);
    } catch { /* ignore */ }
    return null;
  }

  function isAdmin() {
    // Admin bypass requires a server-issued (token-backed) OTP session — never a merely
    // client-selected identity — so the bypass cannot be forged from localStorage alone
    // (SEC-02). Closure item: the OTP flow / future proxy must also validate the role
    // server-side; the client check is necessary but not sufficient.
    const session = getSession();
    const user = session && session.user;
    return !!(user && ADMIN_ROLE_CODES.includes(user.roleCode));
  }

  function enforceGateway() {
    if (!OTP_SECURITY_ACTIVE) return;
    if (isAdmin()) {
      if (window.Telemetry) window.Telemetry.log("otp_admin_bypass", {});
      return;
    }
    const session = getSession();
    const currentPage = window.location.pathname.split("/").pop() || "index.html";

    if (!session && currentPage !== "index.html" && currentPage !== "fast-track.html") {
      window.location.href = "index.html?auth_required=true";
    }
  }

  return {
    isSecurityActive,
    getSession,
    clearSession,
    requestOTP,
    verifyOTP,
    isAdmin,
    enforceGateway
  };
})();

window.Identity = Identity;

// Evaluate the gateway only after all sibling modules (esp. window.State, which loads
// after this one) have run. Module scripts execute at readyState 'interactive', so we must
// wait for DOMContentLoaded; running earlier left State undefined → isAdmin() false → every
// non-index page wrongly redirected to index.html.
if (document.readyState === 'complete') {
  Identity.enforceGateway();
} else {
  document.addEventListener('DOMContentLoaded', () => Identity.enforceGateway());
}
