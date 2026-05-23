"""Entry point — launch Uvicorn programmatically."""
import uvicorn
from app.config import HOST, PORT, DEBUG

if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host=HOST,
        port=PORT,
        reload=DEBUG,
        log_level="info",
    )
