import { createContext, useContext, useMemo, useState } from "react";
import PropTypes from "prop-types";

import {
  clearStoredAuthentication,
  createAuthenticatedSession,
  readStoredAuthentication,
} from "services/apiClient";

const AuthenticationContext = createContext(null);

function AuthenticationProvider({ children }) {
  const [authenticationState, setAuthenticationState] = useState(readStoredAuthentication());

  async function signIn(username, password) {
    const nextAuthenticationState = await createAuthenticatedSession(username, password);
    setAuthenticationState(nextAuthenticationState);
    return nextAuthenticationState;
  }

  function signOut() {
    clearStoredAuthentication();
    setAuthenticationState(readStoredAuthentication());
  }

  const contextValue = useMemo(
    () => ({
      accessToken: authenticationState.accessToken,
      refreshToken: authenticationState.refreshToken,
      isAuthenticated: Boolean(authenticationState.accessToken),
      signIn,
      signOut,
      refreshAuthenticationState: () => setAuthenticationState(readStoredAuthentication()),
    }),
    [authenticationState]
  );

  return (
    <AuthenticationContext.Provider value={contextValue}>{children}</AuthenticationContext.Provider>
  );
}

AuthenticationProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

function useAuthentication() {
  const contextValue = useContext(AuthenticationContext);
  if (!contextValue) {
    throw new Error("useAuthentication must be used inside AuthenticationProvider.");
  }
  return contextValue;
}

export { AuthenticationProvider, useAuthentication };
