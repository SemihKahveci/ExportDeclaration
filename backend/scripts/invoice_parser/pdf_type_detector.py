import fitz
import sys

def detect_pdf_type(pdf_path):
    doc = fitz.open(pdf_path)

    total_words = 0
    total_images = 0
    total_pages = len(doc)

    for page_index, page in enumerate(doc, start=1):
        text = page.get_text("text").strip()
        words = page.get_text("words")
        images = page.get_images(full=True)

        total_words += len(words)
        total_images += len(images)

        print(f"\nPAGE {page_index}")
        print(f"Text length: {len(text)}")
        print(f"Word count : {len(words)}")
        print(f"Image count: {len(images)}")

    print("\n--- RESULT ---")


    print(f"Pages: {total_pages}")
    print(f"Total words: {total_words}")
    print(f"Total images: {total_images}")

    if total_words == 0 and total_images > 0:
        print("TYPE: IMAGE_BASED_PDF / OCR_REQUIRED")
        return "IMAGE_BASED_PDF"
    elif total_words < 30 and total_images > 0:
        print("TYPE: MOSTLY_IMAGE_PDF / OCR_RECOMMENDED")
        return "MOSTLY_IMAGE_PDF"
    else:
        print("TYPE: DIGITAL_TEXT_PDF / OCR_NOT_REQUIRED")
        return "DIGITAL_TEXT_PDF"

    return None