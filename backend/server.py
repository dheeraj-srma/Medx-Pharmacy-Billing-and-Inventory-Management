import sys
import os
import argparse
import logging

# Ensure backend directory is in sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

def run_server():
    parser = argparse.ArgumentParser(description="MedX Pharmacy Desktop Backend Server")
    parser.add_argument("--port", type=int, default=8000, help="Port to bind server on (default: 8000)")
    parser.add_argument("--host", type=str, default="127.0.0.1", help="Host interface (strictly 127.0.0.1)")
    parser.add_argument("--config-file", type=str, default=None, help="Path to custom config.env file")
    parser.add_argument("--user-data-dir", type=str, default=None, help="Path to writable user data directory")
    parser.add_argument("--desktop-secret", type=str, default=None, help="Local IPC authentication token")
    
    args = parser.parse_args()

    # Enforce loopback binding for desktop security
    if args.host not in ("127.0.0.1", "localhost"):
        args.host = "127.0.0.1"

    if args.config_file:
        os.environ["MEDX_CONFIG_FILE"] = args.config_file

    if args.user_data_dir:
        upload_dir = os.path.join(args.user_data_dir, "uploads")
        os.makedirs(upload_dir, exist_ok=True)
        os.environ["MEDX_UPLOAD_DIR"] = upload_dir

    if args.desktop_secret:
        os.environ["MEDX_DESKTOP_SECRET"] = args.desktop_secret

    import uvicorn
    from main import app

    uvicorn.run(
        app,
        host=args.host,
        port=args.port,
        log_level="info",
        access_log=True
    )

if __name__ == "__main__":
    run_server()
