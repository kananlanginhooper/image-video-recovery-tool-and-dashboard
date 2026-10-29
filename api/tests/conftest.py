"""Tests run without a database or media files: the DB helpers are replaced with canned answers."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("MEDIA_PLUGIN_DIR", "/nonexistent")  # the public app only
os.environ.setdefault("FRAME_ANCESTORS", "http://wrapper.test:8097")
os.environ.setdefault("MEDIA_UI_DIR", "/nonexistent")
