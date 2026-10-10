"""Authentication: password hashing + JWT tokens + a 'current user' dependency.

Passwords are hashed with bcrypt (never stored in plaintext). Login issues a
signed JWT; the client sends it on every request, so the API stays stateless —
no server-side session store needed.
"""

import datetime
import os

import bcrypt
import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

# In production this MUST come from the environment. The fallback keeps local
# dev frictionless; never ship the fallback.
JWT_SECRET = os.environ.get("ORBIT_JWT_SECRET", "dev-secret-change-me")
JWT_ALGO = "HS256"
TOKEN_TTL = datetime.timedelta(days=7)

# Reads the "Authorization: Bearer <token>" header off incoming requests.
bearer = HTTPBearer(auto_error=False)


def hash_password(plain: str) -> str:
    # bcrypt salts automatically; the salt is embedded in the returned hash.
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def create_token(user_id: str) -> str:
    # "sub" (subject) = who the token is about; "exp" = when it expires.
    now = datetime.datetime.now(datetime.timezone.utc)
    payload = {"sub": user_id, "exp": now + TOKEN_TTL, "iat": now}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)


async def current_user_id(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
) -> str:
    # A FastAPI dependency: any endpoint that declares it is automatically
    # protected — unauthenticated requests get 401 before the handler runs.
    if creds is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(creds.credentials, JWT_SECRET, algorithms=[JWT_ALGO])
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return payload["sub"]
