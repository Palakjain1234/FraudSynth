# backend/config.py
import os
from dotenv import load_dotenv

# Load variables from .env if it exists (optional)
load_dotenv()

# =============================
# DATABASE & AUTH SETTINGS
# =============================
MONGO_URI = os.getenv("MONGO_URI")  # optional — only used if provided
DB_NAME = os.getenv("DB_NAME", "fraudsynth")
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")

# =============================
# FRONTEND CONNECTION
# =============================
# Default to local frontend origins so the app works out-of-the-box
ALLOWED_ORIGINS = [
    o.strip().rstrip("/")
    for o in (os.getenv("ALLOWED_ORIGINS") or "http://localhost:5173,http://127.0.0.1:5173").split(",")
    if o.strip()
]

# =============================
# MODEL ARTIFACTS DIRECTORY
# =============================
# Default to backend/model_artifacts so teammates don’t need .env
ARTIFACT_DIR = os.getenv("ARTIFACT_DIR", "backend/model_artifacts")

# =============================
# OPTIONAL DEBUG LOGGING
# =============================
print("=== CONFIG LOADED ===")
print(f"DB_NAME          : {DB_NAME}")
print(f"MONGO_URI set    : {'yes' if MONGO_URI else 'no'}")
print(f"GOOGLE_CLIENT_ID : {'yes' if GOOGLE_CLIENT_ID else 'no'}")
print(f"ALLOWED_ORIGINS  : {ALLOWED_ORIGINS}")
print(f"ARTIFACT_DIR     : {ARTIFACT_DIR}")
print("=====================")
