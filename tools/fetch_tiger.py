"""Download the TIGER/Line 2025 zips that the road graph is built from.

Run from the repo root, using the project venv:

    .venv/bin/python tools/fetch_tiger.py

Files land in data/raw/, which is gitignored. Any file already there is skipped,
so after a failure, re-running fetches only what is still missing. Exits non-zero
if any file could not be fetched.

The zips are untrusted data. This script never extracts them, and nothing else
should either: read them in place with pyshp, from the repo root, for example
shapefile.Reader('data/raw/tl_2025_28101_roads.zip').
"""

import http.client
import shutil
import sys
import urllib.request
import zipfile
from pathlib import Path

BASE_URL = "https://www2.census.gov/geo/tiger/TIGER2025/"
FILES = (
    "ROADS/tl_2025_28101_roads.zip",  # Newton County
    "ROADS/tl_2025_28075_roads.zip",  # Lauderdale County
    "RAILS/tl_2025_us_rails.zip",
    "LINEARWATER/tl_2025_28101_linearwater.zip",
    "LINEARWATER/tl_2025_28075_linearwater.zip",
)
RAW_DIR = Path(__file__).resolve().parent.parent / "data" / "raw"
USER_AGENT = "chunky-survival-fetch-tiger/1.0 (TIGER/Line download for a game road graph)"
TIMEOUT_SECONDS = 60  # Per socket operation, so a slow download that keeps moving is fine.
MAX_REQUESTS = 10  # Per file: the first request, then resumes after a short response.


def fetch(rel_path, dest):
    """Download one file to dest and return its size in bytes.

    The download goes to a .part file and is renamed only once it checks out, so
    a failed run can't leave a broken file that a later run skips as present.

    A response can stop short of its Content-Length without raising anything.
    That has been seen when the server closes the connection after responding,
    which urllib always asks it to. So count the bytes and request the rest with
    a Range header, which keeps a large file from having to arrive in one go.
    """
    part = dest.with_name(dest.name + ".part")
    total = last_modified = None
    try:
        with part.open("wb") as out:
            for _ in range(MAX_REQUESTS):
                offset = out.tell()
                headers = {"User-Agent": USER_AGENT}
                if offset:
                    print(f"      resuming at byte {offset} of {total}")
                    headers["Range"] = f"bytes={offset}-"
                    if last_modified:
                        # The server sends the whole file instead if it has changed.
                        headers["If-Range"] = last_modified
                request = urllib.request.Request(BASE_URL + rel_path, headers=headers)
                with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
                    if response.status == 200:
                        out.seek(0)
                        out.truncate()
                        length = response.headers.get("Content-Length")
                        total = int(length) if length else None
                        last_modified = response.headers.get("Last-Modified")
                    else:
                        content_range = response.headers.get("Content-Range")
                        if not offset or content_range != f"bytes {offset}-{total - 1}/{total}":
                            raise ValueError(
                                f"unexpected response at byte {offset}: "
                                f"status {response.status}, Content-Range {content_range}"
                            )
                    shutil.copyfileobj(response, out)
                if total is None or out.tell() == total:
                    break
            else:
                raise ValueError(
                    f"got {out.tell()} bytes, expected {total}, after {MAX_REQUESTS} requests"
                )
        # Catches an HTML error page served with a 200. Reads the zip's directory
        # only; nothing is extracted.
        if not zipfile.is_zipfile(part):
            raise ValueError("response is not a zip file")
        size = part.stat().st_size
        part.replace(dest)
        return size
    finally:
        part.unlink(missing_ok=True)


def main():
    sys.stdout.reconfigure(line_buffering=True)  # Keep order with stderr when piped.
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    failed = []
    for rel_path in FILES:
        dest = RAW_DIR / rel_path.rpartition("/")[2]
        if dest.exists():
            print(f"skip  {dest.name} (already present)")
            continue
        print(f"fetch {BASE_URL}{rel_path}")
        try:
            size = fetch(rel_path, dest)
        except (OSError, http.client.HTTPException, ValueError) as error:
            print(f"FAILED {rel_path}: {error}", file=sys.stderr)
            failed.append(rel_path)
        else:
            print(f"saved {dest.name} ({size} bytes)")
    if failed:
        print(f"{len(failed)} of {len(FILES)} downloads failed", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
