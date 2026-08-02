"""Start the Causal Agent backend and frontend together."""

from __future__ import annotations

import os
import shutil
import signal
import subprocess
import sys
import time
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent
FRONTEND_ROOT = PROJECT_ROOT / "frontend"


def get_backend_python() -> str:
    """Prefer the project's virtual environment when it exists."""
    if os.name == "nt":
        venv_python = PROJECT_ROOT / ".venv" / "Scripts" / "python.exe"
    else:
        venv_python = PROJECT_ROOT / ".venv" / "bin" / "python"

    return str(venv_python) if venv_python.exists() else sys.executable


def get_frontend_command() -> tuple[list[str], str | None]:
    """Use npm when available, otherwise run Next.js with a usable Node binary."""
    npm = shutil.which("npm")
    if npm:
        return [npm, "run", "dev", "--", "--webpack"], None

    node = shutil.which("node")
    if not node:
        bundled_node = (
            Path.home()
            / ".cache"
            / "codex-runtimes"
            / "codex-primary-runtime"
            / "dependencies"
            / "node"
            / "bin"
            / "node"
        )
        if bundled_node.exists():
            node = str(bundled_node)

    next_entry = FRONTEND_ROOT / "node_modules" / "next" / "dist" / "bin" / "next"
    if node and next_entry.exists():
        # Turbopack starts additional Node processes by looking up `node` in
        # PATH, even when the main Next.js process was started by an absolute
        # Node path.
        return [node, str(next_entry), "dev", "--webpack"], str(Path(node).parent)

    raise RuntimeError(
        "找不到可用的 npm/Node.js，或 frontend/node_modules 尚未安装。"
        "请先安装 Node.js，并在 frontend 目录执行 npm ci。"
    )


def stop_process(process: subprocess.Popen[object] | None) -> None:
    if process is None or process.poll() is not None:
        return

    try:
        if os.name == "nt":
            process.terminate()
        else:
            # The process is started in its own group so uvicorn --reload's
            # child process is stopped together with its parent.
            os.killpg(os.getpgid(process.pid), signal.SIGTERM)
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait()
    except ProcessLookupError:
        pass


def main() -> int:
    if not FRONTEND_ROOT.exists():
        print(f"Frontend directory not found: {FRONTEND_ROOT}", file=sys.stderr)
        return 1

    env = os.environ.copy()
    env.setdefault("NEXT_PUBLIC_API_URL", "http://localhost:8000")

    backend_cmd = [
        get_backend_python(),
        "-m",
        "uvicorn",
        "backend.main:app",
        "--reload",
        "--port",
        "8000",
    ]
    try:
        frontend_cmd, node_bin_dir = get_frontend_command()
    except RuntimeError as exc:
        print(str(exc), file=sys.stderr)
        return 1

    if node_bin_dir:
        current_path = env.get("PATH", "")
        env["PATH"] = os.pathsep.join(
            path for path in (node_bin_dir, current_path) if path
        )

    process_group_options = {"start_new_session": True} if os.name != "nt" else {}
    backend = None
    frontend = None

    try:
        print("Starting backend at http://localhost:8000 ...")
        backend = subprocess.Popen(
            backend_cmd,
            cwd=PROJECT_ROOT,
            env=env,
            **process_group_options,
        )

        frontend_mode = "webpack" if "--webpack" in frontend_cmd else "default"
        print(
            f"Starting frontend with {Path(frontend_cmd[0]).name} ({frontend_mode}) "
            "at http://localhost:3000 ..."
        )
        frontend = subprocess.Popen(
            frontend_cmd,
            cwd=FRONTEND_ROOT,
            env=env,
            **process_group_options,
        )

        print("Both services are running. Press Ctrl+C to stop both.")

        while True:
            backend_status = backend.poll()
            frontend_status = frontend.poll()

            if backend_status is not None:
                print(f"Backend exited with code {backend_status}.")
                return backend_status or 0
            if frontend_status is not None:
                print(f"Frontend exited with code {frontend_status}.")
                return frontend_status or 0

            time.sleep(0.5)
    except KeyboardInterrupt:
        print("\nStopping both services...")
        return 0
    finally:
        stop_process(frontend)
        stop_process(backend)


if __name__ == "__main__":
    raise SystemExit(main())
