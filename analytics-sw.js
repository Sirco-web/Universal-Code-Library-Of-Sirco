const CACHE_NAME = 'site-offline-cache-v1';
let downloaderEnabled = false;
// Store last-known shortcut config (sent from clients)
let shortcutConfig = null;

// Listen for messages from the page to control downloader
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SET_DOWNLOADER') {
        downloaderEnabled = !!event.data.enabled;
    }
    if (event.data && event.data.type === 'SET_SHORTCUT_CONFIG' && event.data.config) {
        try { shortcutConfig = event.data.config; } catch (e) { shortcutConfig = null; }
    }
    if (event.data && event.data.type === 'REMOVE_FILE' && event.data.url) {
        caches.open(CACHE_NAME).then(cache => cache.delete(event.data.url));
    }
    if (event.data && event.data.type === 'REMOVE_ALL') {
        caches.delete(CACHE_NAME);
    }

    // Broadcast shortcut action to all clients when triggered by one page.
    // Only act if the trigger includes a recent timestamp (to avoid stale triggers on navigation),
    // or if the sender explicitly sets force=true.
    if (event.data && event.data.type === 'SHORTCUT_TRIGGERED') {
        try {
            const now = Date.now();
            const ts = typeof event.data.timestamp === 'number' ? event.data.timestamp : 0;
            const force = !!event.data.force;
            // Accept triggers only if forced or not older than 3000ms
            if (!force && (ts === 0 || Math.abs(now - ts) > 3000)) {
                // ignore stale/untimestamped triggers
                return;
            }
            const action = (event.data.action !== undefined && event.data.action !== null)
                ? event.data.action
                : (shortcutConfig && shortcutConfig.action) || 'none';
            const customURL = event.data.customURL || (shortcutConfig && shortcutConfig.customURL) || '';
            self.clients.matchAll().then(clients => {
                for (const c of clients) {
                    c.postMessage({ type: 'PERFORM_SHORTCUT_ACTION', action, customURL });
                }
            });
        } catch (e) {
            // fail silently
        }
    }
});

self.addEventListener('install', event => {
    self.skipWaiting();
});
self.addEventListener('activate', event => {
    event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', event => {
    // Only handle GET requests
    if (event.request.method !== 'GET') return;

    // Special handling for games list JSON
    if (event.request.url.endsWith('/CODE/games/games-list.json')) {
        event.respondWith(
            (async () => {
                // Try network first
                try {
                    const resp = await fetch(event.request);
                    // Cache if downloader enabled
                    if (downloaderEnabled && resp && resp.status === 200) {
                        const cache = await caches.open(CACHE_NAME);
                        cache.put(event.request, resp.clone());
                    }
                    return resp;
                } catch (e) {
                    // Fallback to cache
                    const cache = await caches.open(CACHE_NAME);
                    const cached = await cache.match(event.request);
                    if (cached) return cached;
                    return new Response('[]', { headers: { 'Content-Type': 'application/json' } });
                }
            })()
        );
        return;
    }

    // For HTML pages, always inject analytics.js
    if (event.request.destination === 'document') {
        event.respondWith(
            fetch(event.request)
                .then(async response => {
                    const ct = response.headers.get('content-type') || '';
                    let respToReturn = response;
                    if (ct.includes('text/html')) {
                        let text = await response.text();
                        text = text.replace(
                            /<body[^>]*>/i,
                            `$&<script src="/analytics.js?v=${Date.now()}"></script>`
                        );
                        respToReturn = new Response(text, {
                            headers: new Headers(response.headers)
                        });
                    }
                    // Cache for offline
                    const cache = await caches.open(CACHE_NAME);
                    cache.put(event.request, respToReturn.clone());
                    return respToReturn;
                })
                .catch(async () => {
                    const cache = await caches.open(CACHE_NAME);
                    const cached = await cache.match(event.request);
                    if (cached) return cached;
                    return new Response('Offline', {status: 503});
                })
        );
    } else if (downloaderEnabled) {
        // For other resources, try network then cache, and cache if successful
        event.respondWith(
            fetch(event.request)
                .then(async response => {
                    if (response && response.status === 200) {
                        const cache = await caches.open(CACHE_NAME);
                        cache.put(event.request, response.clone());
                    }
                    return response;
                })
                .catch(async () => {
                    const cache = await caches.open(CACHE_NAME);
                    const cached = await cache.match(event.request);
                    if (cached) return cached;
                    return Response.error();
                })
        );
    } else {
        // If downloader is not enabled, just try network, fallback to cache if offline
        event.respondWith(
            fetch(event.request).catch(async () => {
                const cache = await caches.open(CACHE_NAME);
                const cached = await cache.match(event.request);
                if (cached) return cached;
                return Response.error();
            })
        );
    }
});
