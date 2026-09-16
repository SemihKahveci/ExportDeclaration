import json
import os
import sys
import time

# Runtime must never spend time probing remote model hosts. Production images preload
# the OCR models during Docker build; inference uses the baked local cache.
os.environ.setdefault("PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK", "True")
os.environ.setdefault("GLOG_minloglevel", "2")


def emit(event, **fields):
    payload = {"event": event, **fields}
    sys.stderr.write(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n")
    sys.stderr.flush()


def create_ocr():
    from paddleocr import PaddleOCR

    started = time.monotonic()
    emit("ocr.model.initializing")
    cpu_threads = max(1, int(os.environ.get("OCR_CPU_THREADS", "2")))
    emit("ocr.runtime.config", device="cpu", cpuThreads=cpu_threads, mkldnn=True)
    engine = PaddleOCR(
        lang="en",
        device="cpu",
        cpu_threads=cpu_threads,
        enable_mkldnn=True,
        use_doc_orientation_classify=False,
        use_doc_unwarping=False,
        use_textline_orientation=False,
    )
    emit("ocr.model.ready", durationMs=round((time.monotonic() - started) * 1000))
    return engine


def result_payload(result_item):
    payload = getattr(result_item, "json", None)
    if callable(payload):
        payload = payload()
    if not isinstance(payload, dict):
        raise RuntimeError("PaddleOCR 3.x sonucu JSON nesnesi sunmuyor")
    data = payload.get("res", payload)
    if not isinstance(data, dict):
        raise RuntimeError("PaddleOCR 3.x sonucu beklenen 'res' nesnesini içermiyor")
    return data


def extract_detections(result_items):
    words = []
    for item in result_items:
        data = result_payload(item)
        texts = list(data.get("rec_texts") or [])
        scores = list(data.get("rec_scores") or [])
        polys = list(data.get("rec_polys") or [])
        if not (len(texts) == len(scores) == len(polys)):
            raise RuntimeError(
                f"PaddleOCR sonuç boyutları tutarsız: texts={len(texts)}, "
                f"scores={len(scores)}, polys={len(polys)}"
            )
        for text, score, poly in zip(texts, scores, polys):
            text = str(text).strip()
            if text:
                words.append((text, float(score), poly))
    return words
