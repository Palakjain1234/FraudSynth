# backend/auth.py
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from google.oauth2 import id_token
from google.auth.transport import requests as grequests
import time
from .storage import users
from .schemas import UserDoc
from .config import GOOGLE_CLIENT_ID

router = APIRouter(prefix="/auth", tags=["auth"])

class VerifyTokenBody(BaseModel):
    id_token: str
    mode: str | None = None  # 'signup' | 'login' | None

@router.post("/verify")
async def verify_google_token(payload: VerifyTokenBody):
    # 1) Verify the Google ID token
    try:
        info = id_token.verify_oauth2_token(
            payload.id_token,
            grequests.Request(),
            GOOGLE_CLIENT_ID,
        )
        # if not "email_verified" in info or not info["email_verified"]:
        #     raise ValueError("Email not verified")
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid Google token: {e}")

    sub = info.get("sub")
    if not sub:
        raise HTTPException(status_code=400, detail="Google sub missing in token")

    now = time.time()

    # 2) If the UI chose "login", require the user to already exist
    if (payload.mode or "").lower() == "login":
        existing = await users.find_one({"_id": sub})
        if not existing:
            # explicit message for your UI
            raise HTTPException(status_code=409, detail="Account not found. Please sign up before logging in.")
        # update last_login
        await users.update_one({"_id": sub}, {"$set": {"last_login_at": now}})
        # return minimal user info
        return {"ok": True, "user": {k: existing.get(k) for k in ["_id", "email", "name", "picture"]}}

    # 3) Otherwise treat as "signup" (idempotent upsert)
    user_doc = UserDoc(
        _id=sub,                            # using alias
        email=info.get("email", ""),
        name=info.get("name"),
        picture=info.get("picture"),
        created_at=now,
        last_login_at=now,
    ).model_dump(by_alias=True)            # <-- keep "_id"

    await users.update_one(
        {"_id": user_doc["_id"]},
        {"$setOnInsert": user_doc, "$set": {"last_login_at": now}},
        upsert=True,
    )

    # return freshly created or updated
    doc = await users.find_one({"_id": user_doc["_id"]})
    return {
        "ok": True,
        "user": {k: doc.get(k) for k in ["_id", "email", "name", "picture"]},
    }
