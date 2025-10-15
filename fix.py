import os
import re

# ✅ New iframe + access check script
injection_script = """
<script>
  function checkCookie() {
    const cookies = document.cookie.split("; ").map(c => c.trim());
    const accessCookie = cookies.find(c => c.startsWith("access="));
    const accessValue = accessCookie ? accessCookie.split("=")[1] : null;

    if (accessValue !== "1") {
      // Fully replace document with white background and 404 iframe
      document.documentElement.innerHTML = `
        <head>
          <title>404</title>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            html, body {
              margin: 0;
              padding: 0;
              background: white !important;
              overflow: hidden;
              height: 100%;
              width: 100%;
            }
            iframe {
              position: fixed;
              top: 0;
              left: 0;
              width: 100vw;
              height: 100vh;
              border: none;
              background: white !important;
              z-index: 999999;
              display: block;
            }
          </style>
        </head>
        <body>
          <iframe src="/404.html"></iframe>
        </body>
      `;
      setTimeout(() => {
        window.location.href = "/404.html";
      }, 2500);
      return;
    }
  }

  // Run immediately
  checkCookie();

  // Random recheck between 10–25 seconds
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

# 🧹 Match ANY <script> ... </script> and remove
script_block_regex = re.compile(r"<script.*?>.*?</script>", re.DOTALL | re.IGNORECASE)

def should_ignore(path):
    """Skip certain files or folders."""
    path_lower = path.replace("\\", "/").lower()
    ignored = [
        "/404.html",
        "/index.html",
        "/activate/",
        "/provider/"
    ]
    return any(ig in path_lower for ig in ignored)

def process_html(filepath):
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    # 🧨 Remove all existing <script> blocks
    cleaned = re.sub(script_block_regex, "", content)

    # 🩵 Add new script before </head> or end of file
    if re.search(r"</head>", cleaned, re.IGNORECASE):
        cleaned = re.sub(r"</head>", injection_script + "\n</head>", cleaned, flags=re.IGNORECASE)
    else:
        cleaned += injection_script

    with open(filepath, "w", encoding="utf-8") as f:
        f.write(cleaned)

    print(f"✅ Cleaned & injected: {filepath}")

def main():
    for root, _, files in os.walk(os.getcwd()):
        for file in files:
            if file.endswith(".html"):
                full_path = os.path.join(root, file)
                if not should_ignore(full_path):
                    process_html(full_path)
                else:
                    print(f"⏭️ Skipped: {full_path}")

if __name__ == "__main__":
    main()
