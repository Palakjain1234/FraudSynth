
from __future__ import annotations

import os
import time
import re
from io import BytesIO
from typing import Dict, Optional, Tuple, List

import joblib
import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException, UploadFile, File, Form,Query
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel
from sklearn.metrics import roc_curve, precision_recall_curve, auc, average_precision_score

from .config import ARTIFACT_DIR
from .transforms import fill_and_order_features, to_model_space, FEATURE_ORDER


# --- add this tiny helper once near the top of inference.py ---
def _artifact_dir_for(model: Optional[str]) -> str:
    base = ARTIFACT_DIR
    if model:
        cand = os.path.join(os.path.dirname(base), f"model_artifacts_{model}")
        if os.path.isdir(cand):
            return cand
        alt = os.path.join(os.path.dirname(base), "artifacts", model)
        if os.path.isdir(alt):
            return alt
    return base



# -----------------------------------------------------------------------------
# Constants & Model
# -----------------------------------------------------------------------------

router = APIRouter(prefix="/api", tags=["inference"])

MODEL_PATH = os.path.join(ARTIFACT_DIR, "fraud_detector_lgb.pkl")  # (typo preserved in asset)
MODEL = joblib.load(MODEL_PATH)
DEFAULT_THRESHOLD: float = 0.45  # consider using operating_threshold from metadata

# -----------------------------------------------------------------------------
# Generic table IO helpers
# -----------------------------------------------------------------------------

def _read_any_table(path_no_ext: str) -> pd.DataFrame:
    """
    Read a table from {path_no_ext}.(csv|xlsx|xls) returning a DataFrame.
    Tries CSV, XLSX, then XLS. Raises FileNotFoundError if none exist.
    """
    for ext, loader in [(".csv", pd.read_csv), (".xlsx", pd.read_excel), (".xls", pd.read_excel)]:
        p = path_no_ext + ext
        if os.path.exists(p):
            return loader(p)
    raise FileNotFoundError(f"Missing table: {path_no_ext}.(csv|xlsx|xls)")

def _read_any_csv_or_xlsx(path_no_ext: str) -> Optional[pd.DataFrame]:
    """
    Return DataFrame if any of .csv/.xlsx/.xls exists, else None.
    """
    for ext, loader in [(".csv", pd.read_csv), (".xlsx", pd.read_excel), (".xls", pd.read_excel)]:
        p = path_no_ext + ext
        if os.path.exists(p):
            return loader(p)
    return None

def _save_table_all_formats(base_no_ext: str, df: pd.DataFrame) -> None:
    """
    Save df to base_no_ext.csv and try to save an Excel variant.
    """
    # Always CSV
    df.to_csv(base_no_ext + ".csv", index=False)

    # Try legacy .xls (needs xlwt). Fall back to .xlsx if available.
    try:
        df.to_excel(base_no_ext + ".xls", index=False, engine="xlwt")
    except Exception:
        try:
            df.to_excel(base_no_ext + ".xlsx", index=False)  # openpyxl
        except Exception:
            pass  # CSV exists at minimum

# -----------------------------------------------------------------------------
# Curve & importance utilities
# -----------------------------------------------------------------------------

def _find_label_proba_cols(df: pd.DataFrame) -> Tuple[str, str]:
    """
    Robustly locate (true_label, probability) columns in a scored set.
    """
    cols = list(df.columns)
    low = [c.lower() for c in cols]

    # label candidates
    label_candidates = {"true_label", "label", "y_true", "y", "target"}
    label_idx = next((i for i, c in enumerate(low) if c in label_candidates), None)

    # proba/score candidates
    proba_idx = None
    pattern = re.compile(r"(fraud.*prob|proba|prob|score)", re.I)
    for i, c in enumerate(low):
        if pattern.search(c):
            proba_idx = i
            break

    if label_idx is None or proba_idx is None:
        raise ValueError("Could not locate label/probability columns in test_scored.*")

    return cols[label_idx], cols[proba_idx]

def _compute_and_save_curves_and_importances() -> Dict[str, object]:
    """
    Computes ROC/PR curves from test_scored and top feature importances from MODEL,
    then saves to ARTIFACT_DIR as both CSV and (best-effort) XLS with these base names:
        - roc_curve
        - pr_curve
        - feature_importance
    Returns small dict with arrays for immediate use.
    """
    # 1) Load scored test set
    scored = _read_any_table(os.path.join(ARTIFACT_DIR, "test_scored"))
    label_col, proba_col = _find_label_proba_cols(scored)

    y_true = pd.to_numeric(scored[label_col], errors="coerce").fillna(0).astype(int).to_numpy()
    y_score = pd.to_numeric(scored[proba_col], errors="coerce").fillna(0.0).to_numpy()

    # 2) ROC
    fpr, tpr, _ = roc_curve(y_true, y_score)
    roc_auc = float(auc(fpr, tpr))
    roc_df = pd.DataFrame({"fpr": fpr, "tpr": tpr})
    _save_table_all_formats(os.path.join(ARTIFACT_DIR, "roc_curve"), roc_df)

    # 3) PR
    precision, recall, _ = precision_recall_curve(y_true, y_score)
    ap_val = float(average_precision_score(y_true, y_score))
    pr_df = pd.DataFrame({"recall": recall, "precision": precision, "ap": [ap_val] + [np.nan]*(len(recall)-1)})
    _save_table_all_formats(os.path.join(ARTIFACT_DIR, "pr_curve"), pr_df)

    # 4) Feature importances
    fi_records: List[Dict[str, float]] = []
    try:
        if hasattr(MODEL, "feature_importances_"):
            imps = MODEL.feature_importances_
            feats = FEATURE_ORDER if len(FEATURE_ORDER) == len(imps) else [f"f{i}" for i in range(len(imps))]
            fi_records = [{"feature": f, "importance": float(v)} for f, v in zip(feats, imps)]
    except Exception:
        fi_records = []

    if fi_records:
        fi_df = pd.DataFrame(fi_records).sort_values("importance", ascending=False)
        _save_table_all_formats(os.path.join(ARTIFACT_DIR, "feature_importance"), fi_df)

    return {
        "roc": {"fpr": fpr.tolist(), "tpr": tpr.tolist(), "auc": roc_auc},
        "pr":  {"recall": recall.tolist(), "precision": precision.tolist(), "ap": ap_val},
        "feature_importance": fi_records[:15],
    }

def _ensure_curve_artifacts_on_startup() -> None:
    """
    Create curve/importance files if any are missing. Swallows errors.
    """
    needed = ["roc_curve", "pr_curve", "feature_importance"]
    missing = [base for base in needed if _read_any_csv_or_xlsx(os.path.join(ARTIFACT_DIR, base)) is None]
    if missing:
        try:
            _compute_and_save_curves_and_importances()
        except Exception as e:
            print("[WARN] Could not build curve artifacts at startup:", e)

try:
    _ensure_curve_artifacts_on_startup()
except Exception as _e:
    print("[WARN] Startup curves check failed:", _e)

# -----------------------------------------------------------------------------
# Request/response models
# -----------------------------------------------------------------------------

class PredictBody(BaseModel):
    input: Dict[str, float]
    threshold: Optional[float] = None
    user_id: Optional[str] = None

# -----------------------------------------------------------------------------
# Endpoints
# -----------------------------------------------------------------------------

@router.post("/predict")
async def predict(body: PredictBody):
    """
    Score a single transaction.
    """
    try:
        filled, X, time_amount_only = fill_and_order_features(body.input)
        Xm = to_model_space(X)

        # Robust probability extraction
        if hasattr(MODEL, "predict_proba"):
            proba = MODEL.predict_proba(Xm)
            prob = float(proba[0] if proba.ndim == 1 else proba[0, -1])
        elif hasattr(MODEL, "decision_function"):
            from scipy.special import expit
            prob = float(expit(MODEL.decision_function(Xm))[0])
        else:
            pred = MODEL.predict(Xm)
            prob = float(pred[0]) if np.ndim(pred) else float(pred)

        thresh = body.threshold if body.threshold is not None else DEFAULT_THRESHOLD
        decision = int(prob >= thresh)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Inference error: {e}")
    return {"probability": prob, "decision": decision, "filled": filled}

@router.post("/predict-csv")
async def predict_csv(
    user_id: Optional[str] = Form("guest"),
    threshold: Optional[float] = Form(None),
    file: UploadFile = File(...),
):
    """
    Batch scoring: accepts .csv/.xlsx/.xls with columns from FEATURE_ORDER (order flexible).
    Returns original columns + fraud_probability + model_decision.
    """
    # Read uploaded bytes once
    content = await file.read()
    b = BytesIO(content)

    # Heuristics for file type
    magic4 = bytes(b.getbuffer()[:4])          # XLSX zip header b'PK\x03\x04'
    magic8 = bytes(b.getbuffer()[:8])          # CFBF header for legacy .xls

    try:
        if magic4 == b"PK\x03\x04":
            b.seek(0)
            df = pd.read_excel(b, engine="openpyxl")
        elif magic8.startswith(b"\xD0\xCF\x11\xE0"):
            b.seek(0)
            df = pd.read_excel(b, engine="xlrd")
        else:
            b.seek(0)
            try:
                df = pd.read_csv(b)
            except Exception:
                b.seek(0)
                df = pd.read_csv(b, sep=";")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Inference error (CSV): {e}")

    if df.empty:
        raise HTTPException(status_code=400, detail="Uploaded table has no rows.")

    # Normalize case-insensitive lookup
    df_cols_lower = {str(c).lower(): c for c in df.columns}

    out_rows: List[Dict[str, object]] = []
    thresh = float(DEFAULT_THRESHOLD if threshold is None else threshold)

    for _, row in df.iterrows():
        row_dict: Dict[str, float] = {}
        for feat in FEATURE_ORDER:
            src_col = df_cols_lower.get(feat.lower())
            val = row[src_col] if src_col in df.columns else None
            row_dict[feat] = val

        try:
            filled, X, _ = fill_and_order_features(row_dict)
            Xm = to_model_space(X)

            if hasattr(MODEL, "predict_proba"):
                proba = MODEL.predict_proba(Xm)
                prob = float(proba[0] if proba.ndim == 1 else proba[0, -1])
            elif hasattr(MODEL, "decision_function"):
                from scipy.special import expit
                prob = float(expit(MODEL.decision_function(Xm))[0])
            else:
                pred = MODEL.predict(Xm)
                prob = float(pred[0]) if np.ndim(pred) else float(pred)

            decision = int(prob >= thresh)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Inference error: {e}")

        # Compose output row = original columns + predictions
        result_row = {c: row.get(c, None) for c in df.columns}
        result_row["fraud_probability"] = prob
        result_row["model_decision"] = decision
        out_rows.append(result_row)

    out_cols = list(df.columns)
    if "fraud_probability" not in out_cols:
        out_cols.append("fraud_probability")
    if "model_decision" not in out_cols:
        out_cols.append("model_decision")

    return {"columns": out_cols, "rows": out_rows, "threshold": thresh}

@router.get("/template", response_class=PlainTextResponse)
def template_csv(example: int = 1):
    """
    Returns CSV text: header = FEATURE_ORDER.
    If example>0, includes 1 example row using medians.csv if present, else zeros.
    """
    header = ",".join(FEATURE_ORDER)
    lines = [header]

    medians_path = os.path.join(ARTIFACT_DIR, "medians.csv")
    example_row: Dict[str, float] = {}

    if example and example > 0:
        if os.path.exists(medians_path):
            try:
                meds_df = pd.read_csv(medians_path)
                if {"feature", "median"}.issubset(set(meds_df.columns)):
                    med_map = dict(zip(meds_df["feature"], meds_df["median"]))
                    example_row = {k: med_map.get(k, 0.0) for k in FEATURE_ORDER}
                else:
                    row0 = meds_df.iloc[0].to_dict()
                    example_row = {k: row0.get(k, 0.0) for k in FEATURE_ORDER}
            except Exception:
                example_row = {k: 0.0 for k in FEATURE_ORDER}
        else:
            example_row = {k: 0.0 for k in FEATURE_ORDER}

        lines.append(",".join(str(example_row.get(k, 0.0)) for k in FEATURE_ORDER))

    return "\n".join(lines)

# ===============================
# /api/metrics  (model-aware, graceful fallbacks)
# ===============================
@router.get("/metrics")
async def metrics(model: Optional[str] = Query(None)):
    """
    Returns dashboard metrics for the given model:
      - synthetic_quality_check.*  (first 1000 rows)  [optional]
      - threshold_sweep.*                             [optional but used for P/R vs τ]
      - test_scored.* (subset for histogram)          [optional]
    If any file is missing, returns an empty list for that section.
    """
    ART_DIR = _artifact_dir_for(model)

    # quality (optional)
    try:
        quality_df = _read_any_table(os.path.join(ART_DIR, "synthetic_quality_check"))
        quality = quality_df.to_dict(orient="records")[:1000]
    except FileNotFoundError:
        quality = []

    # threshold sweep (optional; also accept your older filename)
    try:
        thresh_df = (_read_any_table(os.path.join(ART_DIR, "threshold_sweep")))
    except FileNotFoundError:
        # compatibility with precision_recall_vs_threshold.csv base name
        try:
            thresh_df = _read_any_table(os.path.join(ART_DIR, "precision_recall_vs_threshold"))
        except FileNotFoundError:
            thresh_df = None
    thresh = thresh_df.to_dict(orient="records") if thresh_df is not None else []

    # samples for histogram (optional)
    try:
        scored_df = _read_any_table(os.path.join(ART_DIR, "test_scored"))
        keep = ["Amount", "true_label", "fraud_probability", "model_decision"]
        keep = [c for c in keep if c in scored_df.columns]
        samples = scored_df[keep].head(200).to_dict(orient="records") if keep else []
    except FileNotFoundError:
        samples = []

    return {"quality": quality, "threshold": thresh, "samples": samples}


@router.get("/top-risks")
async def top_risks(limit: int = 50):
    """
    Top risky transactions sorted by fraud_probability.
    """
    try:
        df = _read_any_table(os.path.join(ARTIFACT_DIR, "top_risks"))
    except FileNotFoundError as e:
        raise HTTPException(404, str(e))

    # Prefer robust selection of columns and probability col
    cols = ["Time", "Amount", "fraud_probability", "true_label", "model_decision"]
    cols = [c for c in cols if c in df.columns]
    prob_col = df.columns[df.columns.str.contains("fraud_probability")][0]
    df = df.sort_values(prob_col, ascending=False).head(limit)
    return {"rows": df[cols].to_dict(orient="records")}

# ===============================
# /api/curves  (model-aware)
# ===============================
from fastapi import Query

@router.get("/curves")
async def curves(model: Optional[str] = Query(None)):
    ART_DIR = _artifact_dir_for(model)

    # --- read ROC file
    roc_df = _read_any_csv_or_xlsx(os.path.join(ART_DIR, "roc_curve"))

    # --- read PR file (try pr_curve, then precision_vs_recall)
    pr_df = _read_any_csv_or_xlsx(os.path.join(ART_DIR, "pr_curve"))
    if pr_df is None:
        pr_df = _read_any_csv_or_xlsx(os.path.join(ART_DIR, "precision_vs_recall"))

    # --- optional: feature importance
    fi_df = _read_any_csv_or_xlsx(os.path.join(ART_DIR, "feature_importance"))

    roc = None
    pr  = None
    feat = None

    # ---- ROC ----
    if roc_df is not None:
        cols = {c.lower(): c for c in roc_df.columns}
        if {"fpr", "tpr"}.issubset(cols):
            fpr = pd.to_numeric(roc_df[cols["fpr"]], errors="coerce").fillna(0.0).tolist()
            tpr = pd.to_numeric(roc_df[cols["tpr"]], errors="coerce").fillna(0.0).tolist()
            try:
                roc_auc = float(auc(np.array(fpr), np.array(tpr)))
            except Exception:
                roc_auc = None
            roc = {"fpr": fpr, "tpr": tpr, "auc": roc_auc}

    # ---- PR ----
    if pr_df is not None:
        cols = {c.lower(): c for c in pr_df.columns}
        if {"recall", "precision"}.issubset(cols):
            recall = pd.to_numeric(pr_df[cols["recall"]], errors="coerce").fillna(0.0).tolist()
            precision = pd.to_numeric(pr_df[cols["precision"]], errors="coerce").fillna(0.0).tolist()
            ap_val = None
            if "ap" in cols:
                try:
                    ap_val = float(pd.to_numeric(pr_df[cols["ap"]], errors="coerce").dropna().iloc[0])
                except Exception:
                    ap_val = None
            pr = {"recall": recall, "precision": precision, "ap": ap_val}

    # ---- Fallback from test_scored if needed ----
    if roc is None or pr is None:
        try:
            scored = _read_any_table(os.path.join(ART_DIR, "test_scored"))
            label_col, proba_col = _find_label_proba_cols(scored)
            y_true  = pd.to_numeric(scored[label_col], errors="coerce").fillna(0).astype(int).to_numpy()
            y_score = pd.to_numeric(scored[proba_col], errors="coerce").fillna(0.0).to_numpy()

            if roc is None:
                fpr, tpr, _ = roc_curve(y_true, y_score)
                roc = {"fpr": fpr.tolist(), "tpr": tpr.tolist(), "auc": float(auc(fpr, tpr))}
            if pr is None:
                p_arr, r_arr, _ = precision_recall_curve(y_true, y_score)
                ap_val = float(average_precision_score(y_true, y_score))
                pr = {"recall": r_arr.tolist(), "precision": p_arr.tolist(), "ap": ap_val}
        except Exception:
            pass

    # ---- Feature importance (file first, then model attr) ----
    if fi_df is not None:
        try:
            cols = {c.lower(): c for c in fi_df.columns}
            if {"feature", "importance"}.issubset(cols):
                fi = fi_df.rename(columns=cols)[["feature", "importance"]]
                fi["importance"] = pd.to_numeric(fi["importance"], errors="coerce").fillna(0.0)
                feat = fi.sort_values("importance", ascending=False).head(15).to_dict(orient="records")
        except Exception:
            feat = None

    if not feat:
        try:
            if hasattr(MODEL, "feature_importances_"):
                imps = MODEL.feature_importances_
                feats = FEATURE_ORDER if len(FEATURE_ORDER) == len(imps) else [f"f{i}" for i in range(len(imps))]
                feat = [{"feature": f, "importance": float(v)} for f, v in zip(feats, imps)]
                feat = sorted(feat, key=lambda x: x["importance"], reverse=True)[:15]
        except Exception:
            feat = []

    return {"roc": roc, "pr": pr, "feature_importance": feat or []}
