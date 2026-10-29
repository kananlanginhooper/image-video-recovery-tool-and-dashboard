"""Write api/openapi.json for the UI's generated types (ui: npm run gen:api). Public app only: no plugins are loaded,
so a private plugin's routes never reach a committed file."""
import json
import os
import sys

os.environ["MEDIA_PLUGIN_DIR"] = "/nonexistent"
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.main import create_app  # noqa: E402

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "openapi.json")
with open(out, "w", encoding="utf-8") as fh:
    json.dump(create_app().openapi(), fh, indent=2)
    fh.write("\n")
print("wrote", out)
