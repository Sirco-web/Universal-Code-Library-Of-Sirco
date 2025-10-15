import os
import re

# === New script to insert ===
new_script = """<script>
  function checkCookie() {
    const cookies = document.cookie.split("; ").map(c => c.trim());
    const accessCookie = cookies.find(c => c.startsWith("access="));
    const accessValue = accessCookie ? accessCookie.split("=")[1] : null;

    if (accessValue !== "1") {
      // Replace everything with only the iframe
      document.documentElement.innerHTML = `
        <head>
          <title>Access Denied</title>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin:0;overflow:hidden;">
          <iframe src="/404.html"
                  style="position:fixed;top:0;left:0;width:100vw;height:100vh;
                         border:none;z-index:9999;"></iframe>
        </body>
      `;
      return; // stop further code if cookie invalid
    }
  }

  // Run immediately
  checkCookie();

  // Random interval between 10–25 seconds
  function scheduleNextCheck() {
    const next = Math.floor(Math.random() * (25000 - 10000 + 1)) + 10000;
    setTimeout(() => {
      checkCookie();
      scheduleNextCheck();
    }, next);
  }

  scheduleNextCheck();
</script>
"""

# === Regex pattern to remove any old checkCookie() scripts ===
old_cookie_pattern = re.compile(
    r"<script[^>]*>[\s\S]*?function\s+checkCookie\s*\([\s\S]*?\}\s*checkCookie\(\)\s*;?[\s\S]*?</script>",
    re.IGNORECASE
)

def update_html_file(file_path):
    with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
        content = f.read()

    # Remove old cookie scripts
    new_content = re.sub(old_cookie_pattern, "", content)

    # Insert new script before </head>
    if "</head>" in new_content.lower():
        # Find exact case of </head>
        head_tag_match = re.search(r"</head>", new_content, re.IGNORECASE)
        if head_tag_match:
            idx = head_tag_match.start()
            new_content = new_content[:idx] + new_script + "\n" + new_content[idx:]
    else:
        # If no </head> tag, just append to the end
        new_content += f"\n{new_script}\n"

    # Save only if changes occurred
    if new_content != content:
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(new_content)
        print(f"✅ Updated: {file_path}")
    else:
        print(f"⚪ No change: {file_path}")

def main():
    current_dir = os.path.dirname(os.path.abspath(__file__))
    print(f"🔍 Scanning directory: {current_dir}")

    for dirpath, _, filenames in os.walk(current_dir):
        for file in filenames:
            if file.lower().endswith(".html"):
                file_path = os.path.join(dirpath, file)
                update_html_file(file_path)

    print("\n✨ Done scanning all HTML files.")

if __name__ == "__main__":
    main()
