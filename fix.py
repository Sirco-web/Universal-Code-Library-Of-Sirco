#!/usr/bin/env python3
# gate_rewriter.py
# Non-destructive HTML rewriter:
# - Inserts an immediate cookie gate script at the very START of <head>.
# - Appends the randomized 10–25s recheck scheduler script at the END of <head>.
# - Never deletes existing <script> tags unless they are EXACT duplicates of the blocks we insert (optional toggle).
# - Creates a .bak backup before writing.

import sys
import shutil
from pathlib import Path
from bs4 import BeautifulSoup

# The exact blocks we will insert. Keep these byte-for-byte stable.
TOP_COOKIE_GATE = """(function () {
  const cookies = document.cookie.split("; ").map(c => c.trim());
  const accessCookie = cookies.find(c => c.startsWith("access="));
  const accessValue = accessCookie ? accessCookie.split("=")[1] : null;
  if (accessValue !== "1") {
    window.location.replace("/404.html");
  }
})();"""

END_SCHEDULER_BLOCK = """function checkCookie() {
  const cookies = document.cookie.split("; ").map(c => c.trim());
  const accessCookie = cookies.find(c => c.startsWith("access="));
  const accessValue = accessCookie ? accessCookie.split("=")[1] : null;
  if (accessValue !== "1") {
    window.location.replace("/404.html");
  }
}

function scheduleNextCheck() {
  const next = Math.floor(Math.random() * (25000 - 10000 + 1)) + 10000;
  setTimeout(() => {
    checkCookie();
    scheduleNextCheck();
  }, next);
}

// Run immediately and schedule
checkCookie();
scheduleNextCheck();"""

def script_text_equal(a: str, b: str) -> bool:
    # Strict byte-for-byte comparison after normalizing newlines and stripping trailing spaces
    if a is None or b is None:
        return False
    na = "\n".join(line.rstrip() for line in a.strip().splitlines())
    nb = "\n".join(line.rstrip() for line in b.strip().splitlines())
    return na == nb

def find_exact_script(soup: BeautifulSoup, code: str):
    """Return list of <script> tags whose exact text equals 'code'."""
    matches = []
    for s in soup.find_all("script"):
        # Only look at non-src inline scripts
        if s.has_attr("src"):
            continue
        txt = s.string if s.string is not None else s.get_text()
        if script_text_equal(txt, code):
            matches.append(s)
    return matches

def ensure_head_exists(soup: BeautifulSoup):
    if soup.head is None:
        head = soup.new_tag("head")
        # Create head before the first element or at start of html
        if soup.html:
            soup.html.insert(0, head)
        else:
            # Create html if absent
            html = soup.new_tag("html")
            soup.insert(0, html)
            html.append(head)
    return soup.head

def insert_top_cookie_gate(head):
    """Insert the cookie gate as the first child of <head> if not already present."""
    existing = find_exact_script(head, TOP_COOKIE_GATE)
    if existing:
        return False  # Already present somewhere
    # Create <script> and insert at head start
    s = head.new_tag("script")
    s.string = TOP_COOKIE_GATE
    # Place it as absolutely first node inside head
    if head.contents:
        head.insert(0, s)
    else:
        head.append(s)
    return True

def insert_end_scheduler(head):
    """Append the scheduler block as the last script in <head> if not already present."""
    existing = find_exact_script(head, END_SCHEDULER_BLOCK)
    if existing:
        return False
    s = head.new_tag("script")
    s.string = END_SCHEDULER_BLOCK
    head.append(s)
    return True

def optionally_dedupe_identical_blocks(head, code):
    """
    Optional: remove duplicated identical inline scripts (exact duplicates of 'code'),
    keeping the FIRST occurrence. This strictly removes only the blocks we inserted,
    and only if they are byte-for-byte identical.
    """
    matches = find_exact_script(head, code)
    if len(matches) <= 1:
        return 0
    # Keep the first, remove the rest
    removed = 0
    for s in matches[1:]:
        s.decompose()
        removed += 1
    return removed

def process_html(input_path: Path, output_path: Path, dedupe=False):
    # Backup
    backup_path = output_path.with_suffix(output_path.suffix + ".bak")
    shutil.copyfile(input_path, backup_path)

    html = input_path.read_text(encoding="utf-8", errors="ignore")
    soup = BeautifulSoup(html, "html.parser")

    head = ensure_head_exists(soup)

    # Insert top-of-head cookie gate
    top_added = insert_top_cookie_gate(head)

    # Insert end-of-head scheduler block
    end_added = insert_end_scheduler(head)

    # Optional dedupe: ONLY remove exact duplicates of the blocks we manage
    removed_top = 0
    removed_sched = 0
    if dedupe:
        removed_top = optionally_dedupe_identical_blocks(head, TOP_COOKIE_GATE)
        removed_sched = optionally_dedupe_identical_blocks(head, END_SCHEDULER_BLOCK)

    # Write result
    output_path.write_text(str(soup), encoding="utf-8")

    return {
        "backup": str(backup_path),
        "top_added": top_added,
        "end_added": end_added,
        "removed_top": removed_top,
        "removed_sched": removed_sched,
    }

def main():
    if len(sys.argv) < 3:
        print("Usage: python gate_rewriter.py <input.html> <output.html> [--dedupe]")
        sys.exit(1)
    input_path = Path(sys.argv[1])
    output_path = Path(sys.argv[2])
    dedupe = ("--dedupe" in sys.argv)
    result = process_html(input_path, output_path, dedupe=dedupe)
    print("Rewriter finished:")
    for k, v in result.items():
        print(f"  {k}: {v}")

if __name__ == "__main__":
    main()
