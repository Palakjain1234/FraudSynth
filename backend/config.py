import os
from dotenv import load_dotenv

load_dotenv()

ALLOWED_ORIGINS = [
    o.strip().rstrip("/")
    for o in (os.getenv("ALLOWED_ORIGINS") or "").split(",")
    if o.strip()
] or ["http://localhost:5173", "http://127.0.0.1:5173"]

ARTIFACT_DIR = os.getenv("ARTIFACT_DIR", "backend/model_artifacts")

print("ARTIFACT_DIR:", ARTIFACT_DIR)
print("CORS allowed origins:", ALLOWED_ORIGINS)
