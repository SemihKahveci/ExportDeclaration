from item_extractor import (
    _prefer_structured_gtip_occurrences,
    extract_description_from_words,
)


def word(text, x0, y0, x1=None, y1=None):
    return {"text": text, "x0": x0, "y0": y0, "x1": x1 or x0 + 20, "y1": y1 or y0 + 10}


def run():
    col = {"xMin": 160, "xMax": 323}

    # Nearby header/noise above the anchor must not become description text.
    baseline_noise_case = [
        word("COLUMN", 100, 996), word("HEADER", 170, 996),
        word("1", 38, 1011), word("INDUSTRIAL", 60, 1011), word("X500", 160, 1011),
        word("1.575", 328, 1011), word("KG", 370, 1011),
    ]
    got = extract_description_from_words(baseline_noise_case, None, col, anchor_y=1011, anchor_height=10)
    assert got == "INDUSTRIAL X500", got

    # Product/article tokens remain part of the visible human description.
    product_code_case = [word("1", 38, 1060), word("RESIN", 60, 1060), word("X500", 150, 1060)]
    got_product_code = extract_description_from_words(product_code_case, "X500", col, anchor_y=1060, anchor_height=10)
    assert got_product_code == "RESIN X500", got_product_code

    # Numeric model tokens are semantic when they are not the leading row ordinal.
    model_code = [
        word("2", 38, 1118), word("BYK", 60, 1118), word("POLIMER", 95, 1118),
        word("306", 150, 1118), word("100", 328, 1118), word("KG", 370, 1118),
    ]
    got_model = extract_description_from_words(model_code, None, col, anchor_y=1118, anchor_height=10)
    assert got_model == "BYK POLIMER 306", got_model

    # Description can wrap vertically below the commercial row baseline.
    wrapped = [
        word("3", 38, 1160), word("FLEX", 60, 1160),
        word("MEN", 60, 1168),
        word("POLO", 60, 1176), word("SHIRT", 105, 1176),
        word("569", 328, 1160), word("ADET", 370, 1160),
    ]
    got_wrapped = extract_description_from_words(wrapped, None, col, anchor_y=1160, anchor_height=10)
    assert got_wrapped == "FLEX MEN POLO SHIRT", got_wrapped

    # A second common layout wraps a two-token description to the next baseline.
    wrapped_two_line = [
        word("1", 38, 1300), word("MACRO", 100, 1300), word("SYNTHETIC", 145, 1300),
        word("FIBER", 85, 1309), word("REINFORCEMENT", 120, 1309),
        word("2250", 328, 1300), word("KG", 370, 1300),
    ]
    got_two_line = extract_description_from_words(wrapped_two_line, None, col, anchor_y=1300, anchor_height=10)
    assert got_two_line == "MACRO SYNTHETIC FIBER REINFORCEMENT", got_two_line

    # A new leading row ordinal terminates continuation and prevents row bleed.
    no_bleed = [
        word("1", 38, 1400), word("ALPHA", 60, 1400),
        word("DETAIL", 60, 1408),
        word("2", 38, 1417), word("BETA", 60, 1417),
    ]
    got_no_bleed = extract_description_from_words(no_bleed, None, col, anchor_y=1400, anchor_height=10)
    assert got_no_bleed == "ALPHA DETAIL", got_no_bleed

    # Duplicate GTIP footer: keep structured goods occurrence, suppress evidence-less
    # footer occurrence.  Two strong genuine rows with the same GTIP remain valid.
    goods_words = [
        word("1", 38, 100), word("PRODUCT", 60, 100), word("2.250", 200, 100),
        word("KG", 240, 100), word("4,1000", 280, 100), word("9.225,00", 360, 100),
        word("550340000011", 450, 100),
        word("GTIP", 60, 400), word("Kodu:", 100, 400), word("550340000011", 150, 400),
    ]
    page_map = {1: goods_words}
    gtips = [
        {"page": 1, "gtip": "550340000011", "y0": 100},
        {"page": 1, "gtip": "550340000011", "y0": 400},
    ]
    selected = _prefer_structured_gtip_occurrences(page_map, gtips)
    assert [g["y0"] for g in selected] == [100], selected

    second_goods = [
        word("2", 38, 200), word("OTHER", 60, 200), word("100", 200, 200),
        word("KG", 240, 200), word("2,0000", 280, 200), word("200,00", 360, 200),
        word("550340000011", 450, 200),
    ]
    page_map_two = {1: goods_words + second_goods}
    two_strong = _prefer_structured_gtip_occurrences(page_map_two, [
        {"page": 1, "gtip": "550340000011", "y0": 100},
        {"page": 1, "gtip": "550340000011", "y0": 200},
        {"page": 1, "gtip": "550340000011", "y0": 400},
    ])
    assert [g["y0"] for g in two_strong] == [100, 200], two_strong

    # Canonical DIGITAL layout: the sole GTIP may be disclosed later in a
    # footer/notes block instead of on the commercial row.  Re-anchor only when
    # exactly one arithmetic-corroborated goods row exists.
    detached = [
        word("1", 0.036, 0.356, 0.045, 0.366),
        word("MACRO", 0.101, 0.356, 0.13, 0.366),
        word("SYNTHETIC", 0.139, 0.356, 0.19, 0.366),
        word("2.250", 0.242, 0.356, 0.27, 0.366),
        word("KG", 0.279, 0.356, 0.30, 0.366),
        word("4,1000", 0.422, 0.356, 0.46, 0.366),
        word("9.225,00", 0.857, 0.356, 0.90, 0.366),
        word("GTIP", 0.091, 0.653, 0.12, 0.663),
        word("Kodu:", 0.123, 0.653, 0.15, 0.663),
        word("550340000011", 0.161, 0.653, 0.25, 0.663),
        word("Navlun:", 0.091, 0.663, 0.13, 0.673),
        word("1.200", 0.140, 0.663, 0.17, 0.673),
        word("EUR", 0.177, 0.663, 0.20, 0.673),
    ]
    rebound = _prefer_structured_gtip_occurrences({1: detached}, [
        {"page": 1, "gtip": "550340000011", "y0": 0.653},
    ])
    assert len(rebound) == 1 and abs(rebound[0]["y0"] - 0.356) < 1e-6, rebound
    assert rebound[0]["gtipReanchorReason"] == "single-arithmetic-corroborated-goods-row", rebound

    # Two plausible commercial rows make a detached footer GTIP ambiguous.
    # Keep it detached/fail-closed rather than guessing which item owns it.
    ambiguous = detached + [
        word("2", 0.036, 0.456, 0.045, 0.466),
        word("OTHER", 0.101, 0.456, 0.13, 0.466),
        word("100", 0.242, 0.456, 0.27, 0.466),
        word("KG", 0.279, 0.456, 0.30, 0.466),
        word("2,0000", 0.422, 0.456, 0.46, 0.466),
        word("200,00", 0.857, 0.456, 0.90, 0.466),
    ]
    ambiguous_selected = _prefer_structured_gtip_occurrences({1: ambiguous}, [
        {"page": 1, "gtip": "550340000011", "y0": 0.653},
    ])
    assert len(ambiguous_selected) == 1 and abs(ambiguous_selected[0]["y0"] - 0.653) < 1e-6, ambiguous_selected
    assert "gtipReanchorReason" not in ambiguous_selected[0], ambiguous_selected

    print({
        "event": "product-e2e-1.5.26.5.detached-gtip-goods-row-reanchoring.passed",
        "anchorBaselinePreferred": True,
        "verticalDescriptionContinuationPreserved": True,
        "newGoodsRowStopsContinuation": True,
        "footerGtipDuplicateSuppressedByRowEvidence": True,
        "multipleStrongSameGtipRowsPreserved": True,
        "detachedGtipReanchoredOnlyToSingleArithmeticGoodsRow": True,
        "ambiguousDetachedGtipFailsClosed": True,
        "normalizedDigitalGeometryUsesTightRowBands": True,
        "supplierSpecificRules": False,
        "modelInferenceRequired": False,
        "directNormalizedWrite": False,
    })


if __name__ == "__main__":
    run()
