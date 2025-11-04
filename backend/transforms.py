import json, os, joblib, numpy as np, pandas as pd
from typing import Dict, Tuple
from .config import ARTIFACT_DIR

# In Kaggle creditcard.csv, V1–V28 ARE ALREADY PCA COMPONENTS.
# So we DO NOT need a separate pca.pkl. We only need to apply the SAME SCALER (if used in training).

FEATURE_ORDER = [
    "Time","V1","V2","V3","V4","V5","V6","V7","V8","V9","V10","V11","V12","V13","V14",
    "V15","V16","V17","V18","V19","V20","V21","V22","V23","V24","V25","V26","V27","V28","Amount"
]

class ArtifactBundle:
    def __init__(self):
        self.scaler = joblib.load(os.path.join(ARTIFACT_DIR, "scaler.pkl"))
        meta_path = os.path.join(ARTIFACT_DIR, "fraud_metadata.json")
        self.metadata = json.load(open(meta_path, "r")) if os.path.exists(meta_path) else {}
        self.medians = self._load_feature_medians()

    def _load_feature_medians(self) -> Dict[str, float]:
        if "feature_medians" in self.metadata:
            return self.metadata["feature_medians"]
        csv = os.path.join(ARTIFACT_DIR, "test_scored.csv")
        if os.path.exists(csv):
            df = pd.read_csv(csv)
            meds = df[FEATURE_ORDER].median(numeric_only=True).to_dict()
            return {k: float(v) for k, v in meds.items()}
        return {k: 0.0 for k in FEATURE_ORDER}

BUNDLE = ArtifactBundle()


def fill_and_order_features(raw: Dict[str, float]) -> Tuple[dict, np.ndarray, bool]:
    """Fill missing keys with medians; return (filled_dict, X_ordered, time_amount_only_flag)."""
    filled = {}
    for k in FEATURE_ORDER:
        if k in raw and raw[k] not in (None, ""):
            try:
                filled[k] = float(raw[k])
            except Exception:
                filled[k] = BUNDLE.medians[k]
        else:
            filled[k] = BUNDLE.medians[k]
    time_amount_only = set(raw.keys()) <= {"Time","Amount"} and len(raw.keys()) > 0
    X = np.array([[filled[k] for k in FEATURE_ORDER]], dtype=float)
    return filled, X, time_amount_only


def to_model_space(X: np.ndarray) -> np.ndarray:
    """Apply the training scaler. No PCA here because V1–V28 are already PCA components."""
    X_df = pd.DataFrame(X, columns=FEATURE_ORDER)
    return BUNDLE.scaler.transform(X_df)