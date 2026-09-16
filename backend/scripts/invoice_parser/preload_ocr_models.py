#!/usr/bin/env python3
"""Build-time OCR model preload/readiness check.

This deliberately runs one tiny inference so detection + recognition artifacts are
materialized in the Docker image. Runtime containers can therefore operate offline.
"""
import numpy as np
from ocr_runtime import create_ocr, emit


def main():
    emit("ocr.preload.started")
    engine = create_ocr()
    # White image with realistic dimensions. Inference forces lazy model initialization.
    image = np.full((96, 320, 3), 255, dtype=np.uint8)
    list(engine.predict(image))
    emit("ocr.preload.completed")


if __name__ == "__main__":
    main()
