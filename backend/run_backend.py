"""
Entry point to run HS SEARCH Backend
Company: HS AI Solutions
Founder: Harshan Seliyan
"""

import uvicorn
import os
import sys
import argparse

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.config import settings

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=None,
                        help="Override port (also read from $PORT env var)")
    args = parser.parse_args()

    # Railway sets $PORT; fall back to settings or CLI arg
    port = args.port or int(os.environ.get("PORT", settings.PORT))
    host = settings.HOST

    print(f"==================================================")
    print(f" {settings.PROJECT_NAME} - {settings.TAGLINE}")
    print(f" Company: {settings.COMPANY} | Founder: {settings.FOUNDER}")
    print(f" Server starting on http://{host}:{port}")
    print(f"==================================================")
    uvicorn.run("app.main:app", host=host, port=port, reload=False)
