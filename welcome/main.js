function checkCookie() {
    const cookies = document.cookie.split("; ");
    const accessCookie = cookies.find(row => row.startsWith("access="));
    if (!accessCookie || accessCookie.split("=")[1] !== "1") {
        window.location.href = "/index.html"; // Redirect if no valid cookie
    }
}

function fetchVersion() {
    fetch(`/version.txt?nocache=${new Date().getTime()}`)
        .then(response => response.text())
        .then(data => {
            document.getElementById("siteVersion").textContent = data.trim();
        })
        .catch(error => {
            console.error("Error fetching site version:", error);
            document.getElementById("siteVersion").textContent = "Unavailable";
        });
}

function removeAccessKey() {
    document.cookie = "access=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;";
    alert("Access key removed. Reloading page...");
    window.location.reload();
}

// Hardcoded toggle for banner display
const showBanner = true; // Set to false to hide the banner

// Adjust iframe height to match banner.html content
function resizeBannerFrame(height) {
    const bannerFrame = document.getElementById('banner-frame');
    if (bannerFrame) {
        bannerFrame.style.height = height + 'px';
    }
    // Also adjust body padding-top to prevent content overlap
    document.body.style.paddingTop = height + 'px';
}

// Add offline status checking
function checkOfflineStatus() {
    const isOffline = !navigator.onLine;
    localStorage.setItem('wasOffline', isOffline ? '1' : '0');
}

window.onload = function () {
    checkCookie(); // Verify cookie before loading the page
    fetchVersion(); // Fetch site version
    checkOfflineStatus();
    // Set the banner iframe src with cache-busting using JS (like fetchVersion)
    document.getElementById('banner-frame').src = `/banner.html?nocache=${new Date().getTime()}`;
};

window.addEventListener('DOMContentLoaded', function() {
    if (!showBanner) {
        const bannerFrame = document.getElementById('banner-frame');
        if (bannerFrame) bannerFrame.style.display = 'none';
    }
});

// Listen for postMessage from banner.html to set height dynamically
window.addEventListener('message', function(event) {
    // Optionally, check event.origin for security
    if (event.data && event.data.type === 'bannerHeight') {
        resizeBannerFrame(event.data.height);
    }
});

window.addEventListener('online', checkOfflineStatus);
window.addEventListener('offline', checkOfflineStatus);
window.addEventListener('DOMContentLoaded', checkOfflineStatus);
