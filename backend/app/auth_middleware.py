"""Cognito JWT authentication middleware for FastAPI.

Validates Bearer tokens from the Authorization header against the
Cognito User Pool JWKS and extracts the userId (sub claim).
"""
import logging
from typing import Optional

import requests
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from . import config

logger = logging.getLogger(__name__)

COGNITO_REGION = config.COGNITO_REGION
USER_POOL_ID = config.COGNITO_USER_POOL_ID
CLIENT_ID = config.COGNITO_CLIENT_ID

JWKS_URL = (
    f"https://cognito-idp.{COGNITO_REGION}.amazonaws.com/{USER_POOL_ID}"
    "/.well-known/jwks.json"
)
ISSUER = f"https://cognito-idp.{COGNITO_REGION}.amazonaws.com/{USER_POOL_ID}"

# Module-level JWKS cache
_jwks: Optional[dict] = None

security = HTTPBearer(auto_error=False)


def _fetch_jwks(force: bool = False) -> dict:
    """Fetch and cache JWKS from Cognito. Refreshes on force=True."""
    global _jwks
    if _jwks is not None and not force:
        return _jwks
    try:
        resp = requests.get(JWKS_URL, timeout=5)
        resp.raise_for_status()
        _jwks = resp.json()
        return _jwks
    except Exception as exc:
        logger.error("Failed to fetch JWKS: %s", exc)
        if _jwks is not None:
            return _jwks  # Return stale cache rather than failing
        raise HTTPException(status_code=500, detail="Authentication service unavailable")


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> str:
    """Validate Cognito JWT and return userId (sub claim).

    Raises HTTPException(401) if token is missing, expired, or invalid.
    Caches JWKS keys in module-level variable to avoid repeated fetches.
    """
    if credentials is None:
        raise HTTPException(status_code=401, detail="Missing authentication token")

    token = credentials.credentials
    jwks = _fetch_jwks()

    try:
        # Get the key ID from the token header
        unverified_header = jwt.get_unverified_header(token)
        kid = unverified_header.get("kid")
        if not kid:
            raise HTTPException(status_code=401, detail="Invalid token header")

        # Find the matching key
        rsa_key = None
        for key in jwks.get("keys", []):
            if key["kid"] == kid:
                rsa_key = key
                break

        if rsa_key is None:
            # Key not found — try refreshing JWKS (handles key rotation)
            jwks = _fetch_jwks(force=True)
            for key in jwks.get("keys", []):
                if key["kid"] == kid:
                    rsa_key = key
                    break

        if rsa_key is None:
            raise HTTPException(status_code=401, detail="Invalid token signing key")

        # Decode and verify the token
        payload = jwt.decode(
            token,
            rsa_key,
            algorithms=["RS256"],
            audience=CLIENT_ID,
            issuer=ISSUER,
        )

        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Token missing sub claim")

        return user_id

    except JWTError as exc:
        logger.warning("JWT validation failed: %s", exc)
        raise HTTPException(
            status_code=401, detail="Invalid or expired authentication token"
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Unexpected auth error: %s", exc)
        raise HTTPException(
            status_code=401, detail="Invalid or expired authentication token"
        )


async def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> Optional[str]:
    """Like get_current_user but returns None instead of 401 when no token."""
    if credentials is None:
        return None
    try:
        return await get_current_user(credentials)
    except HTTPException:
        return None
