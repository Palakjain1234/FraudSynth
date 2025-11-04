# backend/schemas.py
from pydantic import BaseModel, Field
from typing import Optional, Dict, List

class UserDoc(BaseModel):
    id: str = Field(alias="_id")  # Google sub as primary key
    email: str
    name: Optional[str] = None
    picture: Optional[str] = None
    roles: List[str] = Field(default_factory=lambda: ["user"])
    created_at: float
    last_login_at: float

    # allow populating by field name or alias; keep alias on dump
    model_config = {
        "populate_by_name": True,
    }

class PredictionLog(BaseModel):
    user_id: str
    input_raw: Dict[str, float]
    input_filled: Dict[str, float]
    time_amount_only: bool
    scaled_vector: list[float]
    probability: float
    decision: int
    threshold: float
    created_at: float
