const authenticationStorageKey = "progenui-authentication";
const apiBaseUrl = process.env.REACT_APP_API_BASE_URL || "/api";

function readStoredAuthentication() {
  const storedValue = window.localStorage.getItem(authenticationStorageKey);
  if (!storedValue) {
    return { accessToken: "", refreshToken: "" };
  }

  try {
    const parsedValue = JSON.parse(storedValue);
    return {
      accessToken: parsedValue.accessToken || "",
      refreshToken: parsedValue.refreshToken || "",
    };
  } catch {
    return { accessToken: "", refreshToken: "" };
  }
}

function writeStoredAuthentication(authenticationState) {
  window.localStorage.setItem(authenticationStorageKey, JSON.stringify(authenticationState));
}

function clearStoredAuthentication() {
  window.localStorage.removeItem(authenticationStorageKey);
}

async function sendRequest(path, requestOptions = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, requestOptions);
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

async function readErrorMessage(response) {
  const responseText = await response.text();

  if (!responseText) {
    return "Request failed";
  }

  try {
    const parsedResponse = JSON.parse(responseText);
    if (typeof parsedResponse.detail === "string") {
      return parsedResponse.detail;
    }
    return responseText;
  } catch {
    return responseText;
  }
}

async function refreshAuthenticatedSession(refreshToken) {
  const refreshedTokens = await sendRequest("/auth/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });

  const nextAuthenticationState = {
    accessToken: refreshedTokens.access_token,
    refreshToken: refreshedTokens.refresh_token,
  };
  writeStoredAuthentication(nextAuthenticationState);
  return nextAuthenticationState;
}

async function sendAuthenticatedRequest(path, requestOptions = {}, allowRetry = true) {
  const authenticationState = readStoredAuthentication();
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...requestOptions,
    headers: {
      "Content-Type": "application/json",
      ...(authenticationState.accessToken
        ? { Authorization: `Bearer ${authenticationState.accessToken}` }
        : {}),
      ...(requestOptions.headers || {}),
    },
  });

  if (response.status === 401 && allowRetry && authenticationState.refreshToken) {
    const refreshedAuthenticationState = await refreshAuthenticatedSession(
      authenticationState.refreshToken
    );

    return sendAuthenticatedRequest(
      path,
      {
        ...requestOptions,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${refreshedAuthenticationState.accessToken}`,
          ...(requestOptions.headers || {}),
        },
      },
      false
    );
  }

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

async function createAuthenticatedSession(username, password) {
  const loginResponse = await sendRequest("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  const authenticationState = {
    accessToken: loginResponse.access_token,
    refreshToken: loginResponse.refresh_token,
  };
  writeStoredAuthentication(authenticationState);
  return authenticationState;
}

function getDashboardSummary() {
  return sendAuthenticatedRequest("/dashboard/summary");
}

function getTrafficHistory() {
  return sendAuthenticatedRequest("/traffic/history");
}

function getSystemHealth() {
  return sendAuthenticatedRequest("/system/health");
}

function getSystemConfig() {
  return sendAuthenticatedRequest("/system/config");
}

function listInbounds() {
  return sendAuthenticatedRequest("/inbounds");
}

function createInbound(inboundPayload) {
  return sendAuthenticatedRequest("/inbounds", {
    method: "POST",
    body: JSON.stringify(inboundPayload),
  });
}

function updateInbound(inboundId, inboundPayload) {
  return sendAuthenticatedRequest(`/inbounds/${inboundId}`, {
    method: "PUT",
    body: JSON.stringify(inboundPayload),
  });
}

function deleteInbound(inboundId) {
  return sendAuthenticatedRequest(`/inbounds/${inboundId}`, {
    method: "DELETE",
  });
}

function listClients() {
  return sendAuthenticatedRequest("/clients");
}

function createClient(clientPayload) {
  return sendAuthenticatedRequest("/clients", {
    method: "POST",
    body: JSON.stringify(clientPayload),
  });
}

function updateClient(clientId, clientPayload) {
  return sendAuthenticatedRequest(`/clients/${clientId}`, {
    method: "PUT",
    body: JSON.stringify(clientPayload),
  });
}

function deleteClient(clientId) {
  return sendAuthenticatedRequest(`/clients/${clientId}`, {
    method: "DELETE",
  });
}

export {
  clearStoredAuthentication,
  createAuthenticatedSession,
  createClient,
  createInbound,
  deleteClient,
  deleteInbound,
  getDashboardSummary,
  getSystemConfig,
  getSystemHealth,
  getTrafficHistory,
  listClients,
  listInbounds,
  readStoredAuthentication,
  refreshAuthenticatedSession,
  sendAuthenticatedRequest,
  updateClient,
  updateInbound,
};
