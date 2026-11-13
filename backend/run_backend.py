"""
Entry point to run HS SEARCH Backend
Company: HS AI Solutions
Founder: Harshan Seliyan
"""

import uvicorn
import os
import sys

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.config import settings

if __name__ == "__main__":
    print(f"==================================================")
    print(f" {settings.PROJECT_NAME} - {settings.TAGLINE}")
    print(f" Company: {settings.COMPANY} | Founder: {settings.FOUNDER}")
    print(f" Server starting on http://{settings.HOST}:{settings.PORT}")
    print(f"==================================================")
    uvicorn.run("app.main:app", host=settings.HOST, port=settings.PORT, reload=False)
