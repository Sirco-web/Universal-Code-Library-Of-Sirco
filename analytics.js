// Collect user info and send to backend for logging

(function() {
    // Helper to parse OS and browser from user agent
    function getOS() {
        const ua = navigator.userAgent;
        if (/windows phone/i.test(ua)) return "Windows Phone";
        if (/windows/i.test(ua)) return "Windows";
        if (/android/i.test(ua)) return "Android";
        if (/linux/i.test(ua) && !/cros/i.test(ua)) return "Linux";
        if (/cros/i.test(ua)) return "Chrome OS";
        if (/iPhone|iPad|iPod/i.test(ua)) return "iOS";
        if (/mac/i.test(ua)) return "MacOS";
        if (/freebsd/i.test(ua)) return "FreeBSD";
        if (/openbsd/i.test(ua)) return "OpenBSD";
        if (/netbsd/i.test(ua)) return "NetBSD";
        if (/sunos|solaris/i.test(ua)) return "Solaris";
        if (/unix/i.test(ua)) return "Unix";
        return "Unknown";
    }

    function getBrowser() {
        const ua = navigator.userAgent;
        if (/edg\//i.test(ua)) return "Edge";
        if (/opr\//i.test(ua) || /opera/i.test(ua)) return "Opera";
        if (/vivaldi/i.test(ua)) return "Vivaldi";
        if (/brave/i.test(ua)) return "Brave";
        if (/duckduckgo/i.test(ua)) return "DuckDuckGo";
        if (/yabrowser/i.test(ua)) return "Yandex";
        if (/samsungbrowser/i.test(ua)) return "Samsung Internet";
        if (/ucbrowser/i.test(ua)) return "UC Browser";
        if (/firefox|fxios/i.test(ua)) return "Firefox";
        if (/chrome|crios/i.test(ua) && !/edg\//i.test(ua) && !/opr\//i.test(ua) && !/vivaldi/i.test(ua) && !/brave/i.test(ua)) return "Chrome";
        if (/safari/i.test(ua) && !/chrome|crios|edg|opr|vivaldi|brave/i.test(ua)) return "Safari";
        return "Unknown";
    }

    // Fetch IP and geolocation info from IPinfo Lite API (free)
    function fetchGeoInfo() {
        return fetch("https://api.ipinfo.io/lite/me?token=c311e5ab3893df", {
            headers: {
                "Accept": "application/json"
            }
        })
        .then(res => res.json())
        .catch(() => ({}));
    }

    // Send collected data to backend
    function sendAnalytics(data) {
        fetch("https://moving-badly-cheetah.ngrok-free.app/collect", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "ngrok-skip-browser-warning": "true"
            },
            body: JSON.stringify(data)
        })
        .then(res => {
            // Optional: log for debugging
            // console.log("Analytics sent", res.status);
        })
        .catch((err) => {
            showAnalyticsErrorNotification();
        });
    }

    // Show error notification at top right
    function showAnalyticsErrorNotification() {
        if (document.getElementById('analytics-error-notification')) return;
        const notif = document.createElement('div');
        notif.id = 'analytics-error-notification';
        notif.textContent = 'error 362 if you see this agen report to owner';
        notif.style.position = 'fixed';
        notif.style.top = '18px';
        notif.style.right = '18px';
        notif.style.background = '#ff4444';
        notif.style.color = 'white';
        notif.style.padding = '12px 22px';
        notif.style.borderRadius = '8px';
        notif.style.boxShadow = '0 2px 8px rgba(0,0,0,0.18)';
        notif.style.fontSize = '1em';
        notif.style.zIndex = 99999;
        notif.style.fontFamily = 'Arial,sans-serif';
        document.body.appendChild(notif);
        setTimeout(() => {
            notif.remove();
        }, 5000);
    }

    // Main
    fetchGeoInfo().then(geo => {
        const payload = {
            ip: geo.ip || "Unavailable",
            os: getOS(),
            browser: getBrowser(),
            userAgent: navigator.userAgent,
            timestamp: new Date().toISOString(),
            page: window.location.href,
            country: geo.country || geo.country_code || "Unavailable",
            city: geo.city || "Unavailable", // Not available in Lite, will be "Unavailable"
            hostname: geo.as_domain || "Unavailable",
            isp: geo.as_name || geo.asn || "Unavailable",
            asn: geo.asn || "Unavailable",
            continent: geo.continent || geo.continent_code || "Unavailable"
        };
        sendAnalytics(payload);
    });
})();
