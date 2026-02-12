"""
SEFS Main — Entry point. Starts the FastAPI server with Uvicorn.
"""

import uvicorn


def main():
    print("=" * 60)
    print("  SEFS — Semantic Entropy File System")
    print("  Starting server on http://localhost:8000")
    print("=" * 60)
    uvicorn.run(
        "server:app",
        host="0.0.0.0",
        port=8000,
        reload=False,
        log_level="info",
    )


if __name__ == "__main__":
    main()
