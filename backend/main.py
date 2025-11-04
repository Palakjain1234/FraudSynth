# backend/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .config import ALLOWED_ORIGINS
from .auth import router as auth_router
from .inference import router as inference_router
app = FastAPI(title="FraudSynth API", version="1.0")
print("CORS allowed origins:", ALLOWED_ORIGINS)

# Allow frontend (React) to call backend
print("ALLOWED_ORIGINS:", ALLOWED_ORIGINS)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,     
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routes

app.include_router(auth_router)
app.include_router(inference_router)


@app.get("/debug/origins")
def debug_origins():
    return {"allow_origins": ALLOWED_ORIGINS}
@app.get("/")
def root():
    """Simple health-check endpoint."""
    return {"message": "FraudSynth FastAPI backend is running successfully!"}
