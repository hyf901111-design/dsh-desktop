"""Render once, then collect the slides into a small set of numbered review sheets."""

import argparse
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
from PIL import Image, ImageDraw


def review(source):
    out = Path(tempfile.mkdtemp(prefix="ework-meeting-"))
    renderer = "LibreOffice"
    if (
        sys.platform == "darwin"
        and Path("/Applications/Microsoft PowerPoint.app").exists()
    ):
        # PowerPoint can reuse a stale open presentation after its path was rewritten.
        # Give every review a unique file name, even when the caller reuses a candidate.
        snapshot = out / (out.name + source.suffix)
        shutil.copyfile(source, snapshot)
        result = subprocess.run(
            [
                "osascript",
                str(Path(__file__).with_name("review_layout.applescript")),
                str(snapshot.resolve()),
                "--close-snapshot",
            ],
            capture_output=True,
            text=True,
            timeout=300,
        )
        if result.returncode == 0:
            pdf = Path(result.stdout.strip().split(", 1,")[0].removesuffix(", 1"))
            if pdf.is_file():
                renderer = "PowerPoint"
        else:
            print(result.stderr.strip(), file=sys.stderr)
    if renderer == "LibreOffice":
        executable = shutil.which("soffice") or shutil.which("libreoffice")
        if not executable and sys.platform == "darwin":
            executable = "/Applications/LibreOffice.app/Contents/MacOS/soffice"
        if not executable:
            raise ValueError("没有可用的演示文稿渲染器")
        subprocess.run(
            [
                executable,
                "-env:UserInstallation=" + (out / "lo").as_uri(),
                "--headless",
                "--convert-to",
                "pdf",
                "--outdir",
                str(out),
                str(source.resolve()),
            ],
            check=True,
            timeout=240,
            stdout=subprocess.DEVNULL,
        )
        pdf = out / (source.stem + ".pdf")
    if not pdf.is_file():
        raise ValueError("渲染器未产生 PDF")
    subprocess.run(
        ["pdftoppm", "-scale-to", "960", "-png", str(pdf), str(out / "page")],
        check=True,
        timeout=300,
    )
    slides = sorted(out.glob("page-*.png"), key=lambda f: int(f.stem.split("-")[-1]))
    if not slides:
        raise ValueError("未生成预览图")
    sheets = []
    for start in range(0, len(slides), 4):
        block = slides[start : start + 4]
        sheet = Image.new("RGB", (1600, 478 * ((len(block) + 1) // 2)), "#e6eaed")
        draw = ImageDraw.Draw(sheet)
        for j, path in enumerate(block):
            with Image.open(path) as img:
                img.thumbnail((790, 450))
                x = (j % 2) * 800 + 5
                y = (j // 2) * 478 + 4
                sheet.paste(img, (x, y))
                draw.text((x + 5, y + 451), f"{start + j + 1:02}", fill="#283d4d")
        filename = out / f"review-{start + 1}.jpg"
        sheet.save(filename, quality=90)
        sheets.append(str(filename))
    return {
        "renderer": renderer,
        "pages": len(slides),
        "pdf": str(pdf),
        "reviewSheets": sheets,
    }


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("source", type=Path)
    print(json.dumps(review(ap.parse_args().source), ensure_ascii=False))
