"""A tiny in-process fixed-window rate limiter.

Keyed by an identity string (IP or user id). In-memory is fine for a single
instance; a horizontally-scaled deployment would back this with Redis so every
instance shares one counter — same interface, different storage.
"""

import time

from fastapi import HTTPException

# key -> (window_start_epoch, count_in_window)
_buckets: dict[str, tuple[float, int]] = {}


def reset() -> None:
    """Clear all counters (used by tests)."""
    _buckets.clear()


def hit(key: str, limit: int, window: int) -> None:
    """Count one request against `key`; raise 429 if it exceeds `limit` per
    `window` seconds."""
    now = time.time()
    start, count = _buckets.get(key, (now, 0))
    if now - start >= window:
        # Window elapsed — start a fresh one.
        start, count = now, 0
    count += 1
    _buckets[key] = (start, count)
    if count > limit:
        retry_after = max(1, int(window - (now - start)))
        raise HTTPException(
            status_code=429,
            detail="Too many requests",
            headers={"Retry-After": str(retry_after)},
        )
