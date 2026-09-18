"""Write the --lite manifest: the same add-on without its Experiment API."""
import json
import sys

with open("manifest.json") as source:
    manifest = json.load(source)

manifest.pop("experiment_apis", None)
manifest["name"] += " Lite"
manifest["description"] = "Zen Glass without the Zen Experiment API: tabs, bookmarks and windows, no spaces."
manifest["browser_specific_settings"]["gecko"]["id"] = "zen-glass-lite@local"

with open(sys.argv[1], "w") as target:
    json.dump(manifest, target, indent=2)
    target.write("\n")
