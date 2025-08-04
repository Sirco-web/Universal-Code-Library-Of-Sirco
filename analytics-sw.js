const CACHE_NAME = 'site-offline-cache-v1';
let downloaderEnabled = false;

// Listen for messages from the page to control downloader
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SET_DOWNLOADER') {
        downloaderEnabled = !!event.data.enabled;
    }
    if (event.data && event.data.type === 'REMOVE_FILE' && event.data.url) {
        caches.open(CACHE_NAME).then(cache => cache.delete(event.data.url));
    }
    if (event.data && event.data.type === 'REMOVE_ALL') {
        caches.delete(CACHE_NAME);
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

    // For HTML pages, inject analytics.js if not present
    if (event.request.destination === 'document') {
        event.respondWith(
            fetch(event.request)
                .then(async response => {
                    const ct = response.headers.get('content-type') || '';
                    let respToReturn = response;
                    if (ct.includes('text/html')) {
                        let text = await response.text();
                        if (!text.includes('analytics.js')) {
                            text = text.replace(
                                /<body[^>]*>/i,
                                `$&<script src="/analytics.js"></script>`
                            );
                        }
                        respToReturn = new Response(text, { headers: response.headers });
                    }
                    // Cache for offline if enabled
                    if (downloaderEnabled) {
                        const cache = await caches.open(CACHE_NAME);
                        cache.put(event.request, respToReturn.clone());
                    }
                    return respToReturn;
                })
                .catch(async () => {
                    // If offline, try cache
                    const cache = await caches.open(CACHE_NAME);
                    const cached = await cache.match(event.request);
                    if (cached) return cached;
                    return Response.error();
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
