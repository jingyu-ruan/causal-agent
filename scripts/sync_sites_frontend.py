"""Copy the canonical Next.js interface into the Sites Vinext deployment source."""
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "frontend"
TARGET = ROOT / "sites"

def main() -> None:
    if not (TARGET / ".openai" / "hosting.json").exists():
        raise SystemExit("Initialize the Sites project before synchronizing its frontend.")
    for name in ("app", "components", "public"):
        destination = TARGET / name
        if destination.exists():
            shutil.rmtree(destination)
        shutil.copytree(SOURCE / name, destination)
    for source in (SOURCE / "lib").glob("*.ts"):
        shutil.copy2(source, TARGET / "lib" / source.name)
    shutil.copy2(SOURCE / "postcss.config.mjs", TARGET / "postcss.config.mjs")
    (TARGET / "lib" / "config.ts").write_text('export const API_BASE_URL = "/backend";\n')
    layout = TARGET / "app" / "layout.tsx"
    content = layout.read_text()
    content = content.replace('import { SpeedInsights } from "@vercel/speed-insights/next";\n', "")
    content = content.replace("        <SpeedInsights />\n", "")
    content = content.replace("https://causal-agent-sage.vercel.app", "https://causal-agent-capstone.rjy020128.chatgpt.site")
    layout.write_text(content)
    print("Synchronized the frontend, preserving the Sites Worker and hosting configuration.")

if __name__ == "__main__":
    main()
