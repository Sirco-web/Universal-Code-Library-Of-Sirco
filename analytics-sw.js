self.addEventListener('install', event => {
    self.skipWaiting();
});
self.addEventListener('activate', event => {
    event.waitUntil(self.clients.claim());
});
self.addEventListener('fetch', event => {
    // Only inject for HTML pages
    if (event.request.destination === 'document') {
        event.respondWith(
            fetch(event.request).then(async response => {
                const ct = response.headers.get('content-type') || '';
                if (ct.includes('text/html')) {
                    let text = await response.text();
                    if (!text.includes('analytics.js')) {
                        // Inject analytics.js right after <body>
                        text = text.replace(
                            /<body[^>]*>/i,
                            `$&<script src="/analytics.js"></script>`
                        );
                    }
                    return new Response(text, {
                        headers: response.headers
                    });
                }
                return response;
            })
        );
    }
});
