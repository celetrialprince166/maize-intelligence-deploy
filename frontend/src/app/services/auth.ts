/**
 * Authentication service for Maize Intelligence.
 *
 * Uses AWS Cognito for signup/login/token management.
 * Stores tokens in localStorage and provides helpers for
 * authenticated API calls.
 *
 * SETUP: Once Cognito User Pool is created, set these env vars:
 *   VITE_COGNITO_USER_POOL_ID=us-east-1_XXXXXXX
 *   VITE_COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx
 *   VITE_COGNITO_REGION=us-east-1
 */

const COGNITO_REGION = import.meta.env.VITE_COGNITO_REGION || 'us-east-1';
const USER_POOL_ID = import.meta.env.VITE_COGNITO_USER_POOL_ID || '';
const CLIENT_ID = import.meta.env.VITE_COGNITO_CLIENT_ID || '';
const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

const TOKEN_KEY = 'maize_auth_tokens';
const USER_KEY = 'maize_auth_user';

export interface AuthUser {
  userId: string;
  email: string;
  name: string;
  organization?: string;
  role?: string;
  idToken: string;
  accessToken: string;
  refreshToken: string;
}

interface CognitoTokens {
  IdToken: string;
  AccessToken: string;
  RefreshToken: string;
}

/** Check if Cognito is configured */
export function isCognitoConfigured(): boolean {
  return !!(USER_POOL_ID && CLIENT_ID);
}

/** Get stored auth user (null if not logged in) */
export function getStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Store auth user in localStorage */
function storeUser(user: AuthUser) {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

/** Clear stored auth */
export function clearAuth() {
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(TOKEN_KEY);
}

/** Get the ID token for API calls */
export function getIdToken(): string | null {
  const user = getStoredUser();
  return user?.idToken || null;
}

/**
 * Sign up a new user via Cognito.
 * After signup, user needs to verify email with a code.
 */
export async function signUp(
  email: string,
  password: string,
  name: string,
): Promise<{ success: boolean; message: string; needsConfirmation?: boolean }> {
  // Real Cognito signup
  try {
    const resp = await fetch(
      `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-amz-json-1.1',
          'X-Amz-Target': 'AWSCognitoIdentityProviderService.SignUp',
        },
        body: JSON.stringify({
          ClientId: CLIENT_ID,
          Username: email,
          Password: password,
          UserAttributes: [
            { Name: 'email', Value: email },
            { Name: 'name', Value: name },
          ],
        }),
      }
    );
    const data = await resp.json();
    if (!resp.ok) {
      return { success: false, message: data.message || data.__type || 'Signup failed' };
    }
    return {
      success: true,
      message: 'Account created. Check your email for a verification code.',
      needsConfirmation: !data.UserConfirmed,
    };
  } catch (err: any) {
    return { success: false, message: err.message || 'Network error' };
  }
}

/**
 * Confirm signup with the verification code sent to email.
 */
export async function confirmSignUp(
  email: string,
  code: string,
): Promise<{ success: boolean; message: string }> {
  try {
    const resp = await fetch(
      `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-amz-json-1.1',
          'X-Amz-Target': 'AWSCognitoIdentityProviderService.ConfirmSignUp',
        },
        body: JSON.stringify({
          ClientId: CLIENT_ID,
          Username: email,
          ConfirmationCode: code,
        }),
      }
    );
    const data = await resp.json();
    if (!resp.ok) {
      return { success: false, message: data.message || 'Confirmation failed' };
    }
    return { success: true, message: 'Email verified successfully' };
  } catch (err: any) {
    return { success: false, message: err.message || 'Network error' };
  }
}

/**
 * Sign in with email and password.
 */
export async function signIn(
  email: string,
  password: string,
): Promise<{ success: boolean; message: string; user?: AuthUser }> {
  try {
    const resp = await fetch(
      `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-amz-json-1.1',
          'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth',
        },
        body: JSON.stringify({
          AuthFlow: 'USER_PASSWORD_AUTH',
          ClientId: CLIENT_ID,
          AuthParameters: {
            USERNAME: email,
            PASSWORD: password,
          },
        }),
      }
    );
    const data = await resp.json();
    if (!resp.ok) {
      return { success: false, message: data.message || data.__type || 'Login failed' };
    }

    const tokens: CognitoTokens = data.AuthenticationResult;
    // Decode the ID token to get user info
    const payload = JSON.parse(atob(tokens.IdToken.split('.')[1]));

    const user: AuthUser = {
      userId: payload.sub,
      email: payload.email,
      name: payload.name || payload.email.split('@')[0],
      idToken: tokens.IdToken,
      accessToken: tokens.AccessToken,
      refreshToken: tokens.RefreshToken,
    };
    storeUser(user);

    // Create/update backend profile + record login
    await fetch(`${API_BASE}/users/profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cognito_user_id: user.userId,
        email: user.email,
        name: user.name,
      }),
    }).catch(() => {});
    await fetch(`${API_BASE}/users/login/${user.userId}`, { method: 'POST' }).catch(() => {});

    return { success: true, message: 'Logged in', user };
  } catch (err: any) {
    return { success: false, message: err.message || 'Network error' };
  }
}

/** Sign out — clear auth tokens */
export function signOut() {
  clearAuth();
}

/**
 * Initiate forgot password — sends a verification code to the user's email.
 */
export async function forgotPassword(
  email: string,
): Promise<{ success: boolean; message: string }> {
  try {
    const resp = await fetch(
      `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-amz-json-1.1',
          'X-Amz-Target': 'AWSCognitoIdentityProviderService.ForgotPassword',
        },
        body: JSON.stringify({
          ClientId: CLIENT_ID,
          Username: email,
        }),
      }
    );
    const data = await resp.json();
    if (!resp.ok) {
      return { success: false, message: data.message || 'Failed to send reset code' };
    }
    return { success: true, message: 'Verification code sent to your email' };
  } catch (err: any) {
    return { success: false, message: err.message || 'Network error' };
  }
}

/**
 * Confirm forgot password — sets a new password using the verification code.
 */
export async function confirmForgotPassword(
  email: string,
  code: string,
  newPassword: string,
): Promise<{ success: boolean; message: string }> {
  try {
    const resp = await fetch(
      `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-amz-json-1.1',
          'X-Amz-Target': 'AWSCognitoIdentityProviderService.ConfirmForgotPassword',
        },
        body: JSON.stringify({
          ClientId: CLIENT_ID,
          Username: email,
          ConfirmationCode: code,
          Password: newPassword,
        }),
      }
    );
    const data = await resp.json();
    if (!resp.ok) {
      return { success: false, message: data.message || 'Password reset failed' };
    }
    return { success: true, message: 'Password reset successfully' };
  } catch (err: any) {
    return { success: false, message: err.message || 'Network error' };
  }
}
