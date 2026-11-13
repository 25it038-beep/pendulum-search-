"""
HS SEARCH - Universal Document Processors Package
"""

from app.crawler.processors.html_processor import html_processor
from app.crawler.processors.pdf_processor import pdf_processor
from app.crawler.processors.multimedia_processor import multimedia_processor
from app.crawler.processors.api_dataset_processor import api_dataset_processor

__all__ = [
    "html_processor",
    "pdf_processor",
    "multimedia_processor",
    "api_dataset_processor"
]
