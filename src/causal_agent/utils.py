import json
from pathlib import Path


def ensure_dir(p: Path) -> None:
    p.mkdir(parents=True, exist_ok=True)

def to_pretty_json(obj) -> str:
    return json.dumps(obj, indent=2, ensure_ascii=False, sort_keys=False)
