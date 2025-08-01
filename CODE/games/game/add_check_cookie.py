import os

CHECK_COOKIE_JS = """
<script>
function checkCookie() {
    const cookies = document.cookie.split("; ");
    const accessCookie = cookies.find(row => row.startsWith("access="));
    if (!accessCookie || accessCookie.split("=")[1] !== "1") {
        window.location.href = "/index.html"; // Redirect if no valid cookie
    }
}
checkCookie();
</script>
""".strip()

def should_patch(filepath):
    with open(filepath, encoding="utf-8") as f:
        content = f.read()
    if "function checkCookie()" in content:
        return False
    return True

def patch_html(filepath):
    with open(filepath, encoding="utf-8") as f:
        lines = f.readlines()
    # Find <head>
    for i, line in enumerate(lines):
        if "<head" in line:
            head_idx = i
            break
    else:
        print(f"Could not find <head> in {filepath}, skipping.")
        return
    # Insert after <head>
    for j in range(head_idx+1, len(lines)):
        if "<script" in lines[j]:
            insert_idx = j
            break
    else:
        insert_idx = head_idx+1
    lines.insert(insert_idx, CHECK_COOKIE_JS + "\n")
    with open(filepath, "w", encoding="utf-8") as f:
        f.writelines(lines)
    print(f"Patched: {filepath}")

def main():
    html_files = []
    for root, dirs, files in os.walk("."):
        for file in files:
            if file.endswith(".html"):
                html_files.append(os.path.join(root, file))
    for filepath in html_files:
        if not should_patch(filepath):
            continue
        print(f"Found: {filepath}")
        ans = input("Add checkCookie to this file? (y/n): ").strip().lower()
        if ans == "y":
            patch_html(filepath)
        else:
            print("Skipped.")

if __name__ == "__main__":
    main()
