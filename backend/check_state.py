"""Quick state check for SEFS."""
import urllib.request
import json

r = urllib.request.urlopen("http://localhost:8000/api/state")
d = json.loads(r.read())

print("=" * 60)
print("  SEFS — Live Application State")
print("=" * 60)

clusters = d.get("clusters", {})
files = d.get("files", [])
print(f"\n  Total Files:    {len(files)}")
print(f"  Total Clusters: {len(clusters)}")
print()

for i, (name, items) in enumerate(clusters.items(), 1):
    display = name.replace("_", " ").title()
    print(f"  Cluster {i}: {display}")
    for f in items:
        size = f["size"]
        ext = f["ext"].replace(".", "").upper()
        print(f"    - {f['name']}  ({size} bytes, {ext})")
    print()

unc = d.get("unclustered", [])
if unc:
    print("  Unclustered:")
    for f in unc:
        print(f"    - {f['name']}")

print(f"  Root: {d.get('root', '')}")
print("=" * 60)
