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

// --- Begin client-side analytics.js code ---
(function(){
    // Minimal client helper for version menu and SW updates
    if (!('serviceWorker' in navigator)) return;

    // Register analytics service worker (best-effort)
    navigator.serviceWorker.register('/analytics-sw.js').catch(() => {});

    // Ensure pages reload when a new controller takes over
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        try { location.reload(); } catch (e) {}
    });

    // Post a message to the active service worker or to the ready registration
    function postToSW(msg) {
        try {
            if (navigator.serviceWorker.controller) {
                navigator.serviceWorker.controller.postMessage(msg);
            } else {
                navigator.serviceWorker.ready.then(reg => {
                    if (reg && reg.active) reg.active.postMessage(msg);
                }).catch(() => {});
            }
        } catch (e) {}
    }

    // Listen for messages from the service worker
    navigator.serviceWorker.addEventListener('message', (ev) => {
        const data = ev && ev.data;
        if (!data || !data.type) return;
        if (data.type === 'VERSION_MENU') {
            showVersionMenu(data);
        }
        if (data.type === 'DO_REGISTER_SW' && data.url) {
            // SW asked the client to register a given URL
            registerAndActivateSW(data.url);
        }
        // Legacy compatibility: PERFORM_SHORTCUT_ACTION - ignored here
    });

    function createOverlay() {
        let o = document.getElementById('__version_menu_overlay');
        if (o) return o;
        o = document.createElement('div');
        o.id = '__version_menu_overlay';
        o.style.position = 'fixed';
        o.style.left = '10px';
        o.style.top = '10px';
        o.style.zIndex = '2147483647';
        o.style.minWidth = '320px';
        o.style.maxWidth = 'calc(100% - 20px)';
        o.style.padding = '12px';
        o.style.borderRadius = '8px';
        o.style.boxShadow = '0 6px 18px rgba(0,0,0,0.3)';
        o.style.background = 'rgba(30,30,30,0.95)';
        o.style.color = '#fff';
        o.style.fontFamily = 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif';
        o.style.fontSize = '14px';
        o.style.lineHeight = '1.3';

        document.body.appendChild(o);
        return o;
    }

    function showVersionMenu(info) {
        const o = createOverlay();
        o.innerHTML = '';

        const title = document.createElement('div');
        title.textContent = 'Version / Network';
        title.style.fontWeight = '600';
        title.style.marginBottom = '8px';
        o.appendChild(title);

        const versionRow = document.createElement('div');
        versionRow.textContent = 'Current version: ' + (info.currentVersion || 'unknown');
        o.appendChild(versionRow);

        const netRow = document.createElement('div');
        netRow.textContent = 'Version fetch network: ' + (info.verNetworkOk ? 'online' : 'offline');
        o.appendChild(netRow);

        const swRow = document.createElement('div');
        swRow.textContent = 'analytics-sw fetch: ' + (info.swNetworkOk ? 'online' : 'offline');
        o.appendChild(swRow);

        const spacer = document.createElement('div');
        spacer.style.height = '8px';
        o.appendChild(spacer);

        if (info.newAnalyticsSW && info.newAnalyticsSW.available) {
            const newRow = document.createElement('div');
            newRow.textContent = 'New analytics-sw available';
            newRow.style.color = '#ffd479';
            o.appendChild(newRow);

            const btn = document.createElement('button');
            btn.textContent = 'Install analytics-sw';
            btn.style.marginTop = '8px';
            btn.style.padding = '6px 10px';
            btn.style.border = 'none';
            btn.style.borderRadius = '5px';
            btn.style.cursor = 'pointer';
            btn.style.background = '#3aa76d';
            btn.style.color = '#fff';
            btn.onclick = () => {
                // Prefer client-side registration to ensure it becomes controlled here
                registerAndActivateSW(info.newAnalyticsSW.url || '/analytics-sw.js').catch(() => {});
            };
            o.appendChild(btn);
        } else {
            const infoRow = document.createElement('div');
            infoRow.textContent = 'No new analytics-sw detected.';
            o.appendChild(infoRow);
        }

        const close = document.createElement('button');
        close.textContent = 'Close';
        close.style.marginLeft = '8px';
        close.style.padding = '6px 10px';
        close.style.border = 'none';
        close.style.borderRadius = '5px';
        close.style.cursor = 'pointer';
        close.style.background = '#666';
        close.style.color = '#fff';
        close.onclick = () => { try { o.remove(); } catch (e) {} };
        o.appendChild(close);

        // Auto-close after 30s
        setTimeout(() => { try { o.remove(); } catch (e) {} }, 30000);
    }

    async function registerAndActivateSW(url) {
        try {
            // Attempt to register the provided URL
            const reg = await navigator.serviceWorker.register(url, { scope: '/' });
            // If there's a waiting worker, ask it to skipWaiting
            if (reg && reg.waiting) {
                try { reg.waiting.postMessage({ type: 'SKIP_WAITING' }); } catch (e) {}
                return;
            }
            // If installing, wait for it to become waiting
            if (reg && reg.installing) {
                reg.installing.addEventListener('statechange', () => {
                    if (reg.waiting) {
                        try { reg.waiting.postMessage({ type: 'SKIP_WAITING' }); } catch (e) {}
                    }
                });
            }
            // Fallback: request service worker global to ask all clients to register this url
            postToSW({ type: 'REQUEST_CLIENT_REGISTER_SW', url });
        } catch (e) {
            // If registration fails, fallback to asking SW to instruct clients
            postToSW({ type: 'REQUEST_CLIENT_REGISTER_SW', url });
        }
    }

})();

// --- Begin 404S site restriction logic (polling, dynamic) ---
(function(){
    // Do nothing while offline
    if (typeof navigator === 'undefined' || !navigator.onLine) return;

    const allowedPaths = ['/index.html', '/404.html', '/', ''];
    let isBlocked = false;
    window.__SITE_404S_BLOCK = false;

    // Keep references so we can restore original behavior
    const originals = {};
    let handlersInstalled = false;

    function parseTopCode(text) {
        if (!text) return '';
        const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        if (lines.length === 0) return '';
        let codeLine = null;
        if (/^CODE:/i.test(lines[0])) codeLine = lines[0];
        else codeLine = lines.find(l => /^CODE:/i.test(l));
        if (!codeLine) return '';
        return (codeLine.split(':')[1] || '').trim();
    }

    // Named helper to check access cookie/localStorage "access" value equals "1"
    function hasAccess() {
        try {
            // Check cookie first (matches access=1 exactly or access=1;...)
            const m = document.cookie.match(/(?:^|;\s*)access=([^;]+)/);
            if (m && m[1] === '1') return true;
        } catch (e) {}
        try {
            if (localStorage.getItem('access') === '1') return true;
        } catch (e) {}
        return false;
    }

    // New: parse full info file for fields like CODE, WHY, WHEN
    function parseInfo(text) {
        const out = { code: '', why: '', when: '' };
        if (!text) return out;
        try {
            const codeMatch = text.match(/CODE:\s*(.+)/i);
            if (codeMatch) out.code = (codeMatch[1] || '').trim();

            const whyMatch = text.match(/WHY:\s*([\s\S]*?)(?:\r?\n[A-Z]+:|$)/i);
            if (whyMatch) out.why = (whyMatch[1] || '').trim();

            const whenMatch = text.match(/WHEN:\s*(.+)/i);
            if (whenMatch) out.when = (whenMatch[1] || '').trim();
        } catch (e) {
            // parsing best-effort; ignore errors
        }
        return out;
    }

    // Named handlers so we can remove them later
    function clickHandler(ev) {
        try {
            const a = ev.target && ev.target.closest ? ev.target.closest('a') : null;
            if (!a || !a.href) return;
            const urlObj = new URL(a.href, location.href);
            if (urlObj.origin !== location.origin) return; // external allowed
            if (isBlocked && !allowedPaths.includes(urlObj.pathname)) {
                ev.preventDefault();
                ev.stopPropagation();
            }
        } catch (e) { /* ignore */ }
    }

    function submitHandler(ev) {
        try {
            const form = ev.target;
            const action = (form && form.getAttribute && form.getAttribute('action')) || location.pathname;
            const urlObj = new URL(action, location.href);
            if (urlObj.origin !== location.origin) return;
            if (isBlocked && !allowedPaths.includes(urlObj.pathname)) {
                ev.preventDefault();
                ev.stopPropagation();
            }
        } catch (e) { /* ignore */ }
    }

    function wrapNavigationOnce() {
        // Wrap only if not already saved
        try {
            if (!originals.assign) originals.assign = window.location.assign;
            window.location.assign = function(href) {
                try {
                    const urlObj = new URL(href + '', location.href);
                    if (isBlocked && urlObj.origin === location.origin && !allowedPaths.includes(urlObj.pathname)) return;
                } catch (e) {}
                return originals.assign.apply(this, arguments);
            };
        } catch (e) { /* ignore */ }

        try {
            if (!originals.replace) originals.replace = window.location.replace;
            window.location.replace = function(href) {
                try {
                    const urlObj = new URL(href + '', location.href);
                    if (isBlocked && urlObj.origin === location.origin && !allowedPaths.includes(urlObj.pathname)) return;
                } catch (e) {}
                return originals.replace.apply(this, arguments);
            };
        } catch (e) { /* ignore */ }

        try {
            if (!originals.pushState) originals.pushState = history.pushState;
            history.pushState = function(state, title, url) {
                try {
                    const u = new URL((url === undefined || url === null) ? location.href : url + '', location.href);
                    if (isBlocked && u.origin === location.origin && !allowedPaths.includes(u.pathname)) return;
                } catch (e) {}
                return originals.pushState.apply(this, arguments);
            };
        } catch (e) { /* ignore */ }

        try {
            if (!originals.replaceState) originals.replaceState = history.replaceState;
            history.replaceState = function(state, title, url) {
                try {
                    const u = new URL((url === undefined || url === null) ? location.href : url + '', location.href);
                    if (isBlocked && u.origin === location.origin && !allowedPaths.includes(u.pathname)) return;
                } catch (e) {}
                return originals.replaceState.apply(this, arguments);
            };
        } catch (e) { /* ignore */ }
    }

    function installHandlers() {
        if (handlersInstalled) return;
        document.addEventListener('click', clickHandler, true);
        document.addEventListener('submit', submitHandler, true);
        wrapNavigationOnce();
        handlersInstalled = true;
    }

    function removeHandlers() {
        try {
            document.removeEventListener('click', clickHandler, true);
            document.removeEventListener('submit', submitHandler, true);
        } catch (e) { /* ignore */ }

        // Restore originals if we have them
        try { if (originals.assign) window.location.assign = originals.assign; } catch (e) {}
        try { if (originals.replace) window.location.replace = originals.replace; } catch (e) {}
        try { if (originals.pushState) history.pushState = originals.pushState; } catch (e) {}
        try { if (originals.replaceState) history.replaceState = originals.replaceState; } catch (e) {}

        handlersInstalled = false;
    }

    function applyBlock() {
        isBlocked = true;
        window.__SITE_404S_BLOCK = true;
        installHandlers();
    }

    function clearBlock() {
        isBlocked = false;
        window.__SITE_404S_BLOCK = false;
        removeHandlers();
    }

    async function checkNow() {
        if (!navigator.onLine) return;
        try {
            const res = await fetch('/info.txt?ts=' + Date.now(), { cache: 'no-store', headers: { 'Accept': 'text/plain' } });
            if (!res || !res.ok) return;
            const text = await res.text();

            // Use new parseInfo to get CODE, WHY, WHEN
            const info = parseInfo(text);
            const code = info.code || parseTopCode(text);

            // Existing 404S behavior
            if (code === '404S') {
                if (!isBlocked) applyBlock();
                // immediate redirect if current path not allowed
                if (!allowedPaths.includes(window.location.pathname)) {
                    try { window.location.replace('/index.html'); } catch (e) {}
                }
            } else {
                if (isBlocked) clearBlock();
            }

            // New: if CODE: 401 is present, show admin popup only for users with access=1
            try {
                if (/^401$/i.test((info.code || '').trim()) || /CODE:\s*401/i.test(text)) {
                    // Only proceed if user has the access cookie/localStorage value set to "1"
                    if (!hasAccess()) {
                        // user lacks access flag; do not show popup
                    } else {
                        const when = (info.when || '').trim();
                        const why = (info.why || '').trim();

                        let skip = false;
                        try {
                            const stored = localStorage.getItem('popup401');
                            if (stored && when && stored === when) skip = true;
                        } catch (e) {
                            // localStorage may be unavailable; treat as not skipped
                            skip = false;
                        }

                        if (!skip) {
                            show401Popup(why || 'Message from admin', when);
                        }
                    }
                }
            } catch (e) {
                // ignore popup errors
            }

        } catch (e) {
            // network or parsing errors -> ignore, continue polling
        }
    }

    // Popup for CODE: 401 entries
    function show401Popup(reason, when) {
        try {
            if (document.getElementById('__popup_401')) return;
            const overlay = document.createElement('div');
            overlay.id = '__popup_401';
            overlay.style.position = 'fixed';
            overlay.style.left = '0';
            overlay.style.top = '0';
            overlay.style.width = '100%';
            overlay.style.height = '100%';
            overlay.style.background = 'rgba(0,0,0,0.45)';
            overlay.style.display = 'flex';
            overlay.style.alignItems = 'center';
            overlay.style.justifyContent = 'center';
            overlay.style.zIndex = '2147483647';

            const box = document.createElement('div');
            box.style.maxWidth = '540px';
            box.style.width = '90%';
            box.style.background = '#fff';
            box.style.color = '#111';
            box.style.padding = '18px';
            box.style.borderRadius = '8px';
            box.style.boxShadow = '0 8px 26px rgba(0,0,0,0.3)';
            box.style.fontFamily = 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif';
            box.style.lineHeight = '1.3';

            const title = document.createElement('div');
            title.textContent = "Message from admin";
            title.style.fontWeight = '700';
            title.style.marginBottom = '8px';
            box.appendChild(title);

            const reasonDiv = document.createElement('div');
            reasonDiv.style.marginBottom = '10px';
            // Quote the reason if present
            if (reason) {
                const q = document.createElement('div');
                q.textContent = '"' + reason + '"';
                q.style.background = '#f6f6f6';
                q.style.padding = '10px';
                q.style.borderRadius = '6px';
                q.style.whiteSpace = 'pre-wrap';
                box.appendChild(q);
            } else {
                const q = document.createElement('div');
                q.textContent = '(No reason provided)';
                q.style.color = '#666';
                box.appendChild(q);
            }

            if (when) {
                const whenDiv = document.createElement('div');
                whenDiv.textContent = 'Time: ' + when;
                whenDiv.style.marginTop = '10px';
                whenDiv.style.fontSize = '12px';
                whenDiv.style.color = '#444';
                box.appendChild(whenDiv);
            }

            const btnRow = document.createElement('div');
            btnRow.style.display = 'flex';
            btnRow.style.justifyContent = 'flex-end';
            btnRow.style.marginTop = '12px';

            const closeBtn = document.createElement('button');
            closeBtn.type = 'button';
            closeBtn.textContent = 'Close';
            closeBtn.style.padding = '8px 12px';
            closeBtn.style.border = 'none';
            closeBtn.style.borderRadius = '6px';
            closeBtn.style.cursor = 'pointer';
            closeBtn.style.background = '#0070f3';
            closeBtn.style.color = '#fff';
            closeBtn.addEventListener('click', function() {
                try {
                    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
                } catch (e) {}
                try {
                    if (when) {
                        localStorage.setItem('popup401', when);
                    } else {
                        // store a marker so we don't repeatedly spam if when missing
                        localStorage.setItem('popup401', 'shown');
                    }
                } catch (e) {}
            });

            btnRow.appendChild(closeBtn);
            box.appendChild(btnRow);
            overlay.appendChild(box);
            document.body.appendChild(overlay);
        } catch (e) {
            // don't break the rest of the script
        }
    }

    // Immediate check and then poll every 5-10s (randomized)
    (function pollLoop() {
        checkNow().finally(() => {
            const next = 5000 + Math.floor(Math.random() * 5001); // 5000-10000 ms
            setTimeout(pollLoop, next);
        });
    })();

    // Also check once before unload/navigation to ensure decisions are current
    window.addEventListener('beforeunload', function() {
        try { navigator.sendBeacon && checkNow(); } catch (e) {}
    });

})();
