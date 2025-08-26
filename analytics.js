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
        if (/chrome|crios/i.test(ua) && !/edg\//i.test(ua) && !/opr\//i.test(ua) && !/vivaldi/i.test(ua) && !/brave/i.test(ua))
            return "Chrome";
        if (/safari/i.test(ua) && !/chrome|crios|edg|opr|vivaldi|brave/i.test(ua))
            return "Safari";
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
    function sendAnalytics(data, BACKEND_URL) {
        fetch(BACKEND_URL + "/collect", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "ngrok-skip-browser-warning": "true"
            },
            body: JSON.stringify(data)
        })
        .then(res => {
            if (!res.ok) {
                console.error('Analytics endpoint returned', res.status);
            }
        })
        .catch((err) => {
            console.error('Failed to send analytics', err);
            // Only show offline notification if browser is offline (or force if caller wanted)
            showAnalyticsErrorNotification({ force: false, text: 'Could not send analytics data.' });
        });
    }

    // Improve error notification — only show when browser is actually offline (or forced)
    function showAnalyticsErrorNotification(options) {
        // options: { force: boolean, text: string }
        const force = options && options.force;
        const text = (options && options.text) || 'error 3xx you maybe offline';
        // Only show if the browser is actually offline or caller forces it
        if (!force && navigator.onLine) return;
        if (document.getElementById('analytics-error-notification')) return;

        const notif = document.createElement('div');
        notif.id = 'analytics-error-notification';
        notif.style.cssText = [
            'position:fixed',
            'top:18px',
            'right:18px',
            'background:#ff4444',
            'color:#fff',
            'padding:10px 12px',
            'border-radius:8px',
            'box-shadow:0 2px 8px rgba(0,0,0,0.18)',
            'font-size:0.95em',
            'z-index:99999',
            'display:flex',
            'align-items:center',
            'gap:10px',
            'max-width:340px',
            'line-height:1.2'
        ].join(';');

        const textSpan = document.createElement('span');
        textSpan.textContent = text;
        textSpan.style.flex = '1';

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.innerHTML = '&times;';
        closeBtn.setAttribute('aria-label', 'Close');
        closeBtn.style.cssText = 'background:none;border:none;color:#fff;font-size:1.1em;cursor:pointer;padding:0 6px;line-height:1';

        let timeoutId = null;
        const removeNotif = () => {
            if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
            if (notif && notif.parentNode) notif.parentNode.removeChild(notif);
        };

        closeBtn.addEventListener('click', removeNotif);

        notif.appendChild(textSpan);
        notif.appendChild(closeBtn);
        document.body.appendChild(notif);

        // Auto-hide after 2.5 seconds
        timeoutId = setTimeout(removeNotif, 2500);
    }

    // Main analytics flow
    fetchGeoInfo().then(geo => {
        const payload = {
            ip: geo.ip || "Unavailable",
            os: getOS(),
            browser: getBrowser(),
            userAgent: navigator.userAgent,
            timestamp: new Date().toISOString(),
            page: window.location.href,
            country: geo.country || geo.country_code || "Unavailable",
            city: geo.city || "Unavailable",
            hostname: geo.as_domain || "Unavailable",
            isp: geo.as_name || geo.asn || "Unavailable",
            asn: geo.asn || "Unavailable",
            continent: geo.continent || geo.continent_code || "Unavailable"
        };
        // Fetch backend URL and then send analytics
        fetch('/backend.json')
            .then(res => res.json())
            .then(cfg => {
                const BACKEND_URL = (cfg && cfg.url) ? cfg.url.replace(/\/$/, '') : '';
                if (BACKEND_URL) sendAnalytics(payload, BACKEND_URL);
            })
            .catch((err) => {
                console.error('Failed to load backend.json', err);
                // Only show offline notification if browser is offline
                showAnalyticsErrorNotification({ force: false, text: 'Failed to load backend configuration.' });
            });

        // --- Device Code Logic & Service Worker ---
        function random4() {
            return Math.floor(1000 + Math.random() * 9000).toString();
        }
        function getDeviceCode(ip) {
            const ipPart = (ip || "00").split('.')[0] || "00";
            return `${random4()}-${random4()}-${ipPart}`;
        }
        function getStoredDeviceCode() {
            return localStorage.getItem('device_code');
        }
        function setStoredDeviceCode(code) {
            localStorage.setItem('device_code', code);
        }

        // --- Online/Away Tracking ---
        let pageStart = Date.now();
        let onlineStatus = 'online';
        let pingInterval = null;

        function resetTimer() { pageStart = Date.now(); }
        function getTimeOnPage() { return Math.floor((Date.now() - pageStart) / 1000); }

        function sendDevicePing(deviceCode, geo, status, BACKEND_URL) {
            const payload2 = {
                device_code: deviceCode,
                status: status,
                ip: geo.ip || "Unavailable",
                os: getOS(),
                browser: getBrowser(),
                userAgent: navigator.userAgent,
                timestamp: new Date().toISOString(),
                page: window.location.href,
                country: geo.country || geo.country_code || "Unavailable",
                city: geo.city || "Unavailable",
                time_on_page: getTimeOnPage()
            };
            if (!BACKEND_URL) return;
            fetch(BACKEND_URL + "/device-ping", {
                method: "POST",
                headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "true" },
                body: JSON.stringify(payload2)
            }).catch(()=>{});
        }

        function setupVisibility(deviceCode, geo, BACKEND_URL) {
            document.addEventListener('visibilitychange', function() {
                onlineStatus = document.hidden ? 'online-away' : 'online';
                resetTimer();
                sendDevicePing(deviceCode, geo, onlineStatus, BACKEND_URL);
            });
            window.addEventListener('focus', function() {
                onlineStatus = 'online';
                resetTimer();
                sendDevicePing(deviceCode, geo, onlineStatus, BACKEND_URL);
            });
            window.addEventListener('blur', function() {
                onlineStatus = 'online-away';
                sendDevicePing(deviceCode, geo, onlineStatus, BACKEND_URL);
            });
        }

        // --- Main for device code ---
        let deviceCode = getStoredDeviceCode();
        function registerAndPing(BACKEND_URL) {
            function pingAvailable() {
                fetch(BACKEND_URL + '/device-available', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ device_code: deviceCode })
                }).catch(() => {});
            }

            if (!BACKEND_URL) return;
            fetch(BACKEND_URL + "/device-check", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ device_code: deviceCode })
            })
            .then(res => {
                if (!res.ok) {
                    return Promise.reject("Device check failed");
                }
                return res.json();
            })
            .then(data => {
                if (!data.exists) {
                    fetch(BACKEND_URL + "/device-register", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            device_code: deviceCode,
                            ip: geo.ip || "Unavailable",
                            os: getOS(),
                            browser: getBrowser(),
                            userAgent: navigator.userAgent,
                            timestamp: new Date().toISOString(),
                            country: geo.country || geo.country_code || "Unavailable"
                        })
                    }).catch(()=>{});
                }
                sendDevicePing(deviceCode, geo, onlineStatus, BACKEND_URL);
                if (!pingInterval) {
                    pingInterval = setInterval(() => {
                        sendDevicePing(deviceCode, geo, onlineStatus, BACKEND_URL);
                        pingAvailable();
                    }, 15000);
                }
                setupVisibility(deviceCode, geo, BACKEND_URL);
                pingAvailable();
            })
            .catch(() => {});
        }

        fetch('/backend.json')
            .then(res => res.json())
            .then(cfg => {
                const BACKEND_URL = (cfg && cfg.url) ? cfg.url.replace(/\/$/, '') : '';
                if (!deviceCode) {
                    deviceCode = getDeviceCode(geo.ip);
                    setStoredDeviceCode(deviceCode);
                }
                registerAndPing(BACKEND_URL);
            })
            .catch(() => {
                console.error('Failed to load backend.json');
                showAnalyticsErrorNotification();
            });

        // --- Service Worker Registration ---
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/analytics-sw.js').catch(()=>{});
        }
    });
})();

// Shortcut detection and action performer module
(function () {
    // Default config: shortcut to remove access and navigate to "/"
    const DEFAULT_CONFIG = {
        modifiers: { ctrl: true, alt: true, shift: false, meta: false },
        key: 'z',
        action: 'goto',
        customURL: '/'
    };

    // Save default config if none exists
    try {
        if (!localStorage.getItem('shortcut_config')) {
            localStorage.setItem('shortcut_config', JSON.stringify(DEFAULT_CONFIG));
        }
    } catch (e) { /* ignore */ }

    // Handle the shortcut key
    window.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.altKey && !e.shiftKey && !e.metaKey && e.key.toLowerCase() === 'z') {
            // Remove access immediately
            try {
                document.cookie = 'access=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/';
                document.cookie = 'access_key=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/';
                localStorage.removeItem('access_key');
                localStorage.removeItem('access');
            } catch (err) { /* ignore */ }
            // Navigate to "/" (default)
            window.location.href = '/';
        }
    });
})();

// --- Begin shortcut config and service worker communication module ---
(function () {
    // Helper to get config from localStorage
    const DEFAULT = {
        modifiers: { ctrl: true, alt: true, shift: false, meta: false },
        key: 'z',
        action: 'goto',
        customURL: '/'
    };

    function getConfig() {
        try {
            return JSON.parse(localStorage.getItem('shortcut_config'));
        } catch (e) { return DEFAULT; }
    }
    function setConfig(cfg) {
        try {
            localStorage.setItem('shortcut_config', JSON.stringify(cfg));
        } catch (e) {}
    }

    // Post message to service worker
    async function postToServiceWorker(msg) {
        try {
            if (navigator.serviceWorker && navigator.serviceWorker.getRegistration) {
                const reg = await navigator.serviceWorker.getRegistration();
                if (reg && reg.active) {
                    reg.active.postMessage(msg);
                }
            }
        } catch (e) { /* ignore */ }
    }

    // Notify service worker of current config
    postToServiceWorker({ type: 'SET_SHORTCUT_CONFIG', config: getConfig() });

    // Provide a safe removeAccessKey if not defined elsewhere.
    if (typeof window.removeAccessKey !== 'function') {
        window.removeAccessKey = function () {
            try {
                // remove cookies by common names
                document.cookie = 'access=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/';
                document.cookie = 'access_key=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/';
                // remove localStorage variants
                localStorage.removeItem('access_key');
                localStorage.removeItem('access');
            } catch (e) {}
        };
    }

    function normalizeURL(u) {
        if (!u) return '';
        if (u.startsWith('/') || u.startsWith('http://') || u.startsWith('https://')) return u;
        return '/' + u;
    }

    function performShortcutAction(action, customURL) {
        try { window.removeAccessKey(); } catch (e) {}
        try {
            let href = '';
            if (action === 'google') href = 'https://www.google.com';
            else if (action === 'custom') href = customURL || '';
            else if (action === 'goto') href = customURL || '/';
            // If action requires navigation, use same-tab navigation so user's current tab goes to target
            if (href) {
                // normalize simple inputs like 'example.com' to include protocol
                if (!href.startsWith('http://') && !href.startsWith('https://') && !href.startsWith('/')) {
                    href = 'https://' + href;
                }
                window.location.assign(href);
            }
        } catch (e) {}
    }

    // Listen for SW broadcasts to perform the action
    if (navigator.serviceWorker && navigator.serviceWorker.addEventListener) {
        navigator.serviceWorker.addEventListener('message', ev => {
            const data = ev.data || {};
            if (data.type === 'PERFORM_SHORTCUT_ACTION') {
                performShortcutAction(data.action || 'none', data.customURL || '');
            }
        });
    }

    // Shortcut detection
    let lastTriggered = 0;
    window.addEventListener('keydown', async (e) => {
        try {
            const cfgLocal = getConfig() || DEFAULT;
            const now = Date.now();
            if (now - lastTriggered < 800) return; // debounce

            // ensure required modifiers are pressed
            if (cfgLocal.modifiers.ctrl && !e.ctrlKey) return;
            if (cfgLocal.modifiers.alt && !e.altKey) return;
            if (cfgLocal.modifiers.shift && !e.shiftKey) return;
            if (cfgLocal.modifiers.meta && !e.metaKey) return;

            if (e.key && e.key.toLowerCase() === (cfgLocal.key || '').toLowerCase()) {
                lastTriggered = now;
                // perform locally immediately (remove key + navigate)
                performShortcutAction(cfgLocal.action, cfgLocal.customURL);
                // Notify service worker with timestamp so other tabs do the same
                await postToServiceWorker({
                    type: 'SHORTCUT_TRIGGERED',
                    action: cfgLocal.action || 'none',
                    customURL: cfgLocal.customURL || '',
                    timestamp: Date.now()
                });
            }
        } catch (err) { /* ignore */ }
    });

    // Expose config helpers for settings page
    window.__shortcutConfig = {
        get: () => getConfig() || DEFAULT,
        save: async (c) => {
            const merged = Object.assign({}, DEFAULT, c || {});
            setConfig(merged);
            await postToServiceWorker({ type: 'SET_SHORTCUT_CONFIG', config: merged });
        }
    };
})();
