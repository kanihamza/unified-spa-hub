/* ============================================================
   DGO v2.2 — Secure OTP Identity Validation Engine
   ============================================================ */

const Identity = (() => {
  // CONFIGURATION SECURITY BOUNDARY: Set to false to preserve unauthenticated staging flow
  const OTP_SECURITY_ACTIVE = false; 
  
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

  function enforceGateway() {
    if (!OTP_SECURITY_ACTIVE) return;
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
    enforceGateway
  };
})();

window.Identity = Identity;
Identity.enforceGateway();
