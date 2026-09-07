/* Peptide Bank - Service Worker
 *
 * Die App rechnet ausschliesslich mit lokalen Daten, laedt zum Start
 * aber Tailwind, Chart.js, three und zwei Schriftfamilien aus dem
 * Netz. Ohne Verbindung bliebe die Seite sonst leer. Dieser Worker
 * legt alles in den Cache.
 *
 * Einrichtung: neben die index.html legen. Laeuft nur ueber https
 * oder localhost - per Doppelklick aus dem Dateisystem registriert
 * ihn kein Browser.
 */

const CACHE = 'peptide-bank-v9';

// Ohne diese Dateien startet gar nichts.
const KERN = ['./', './index.html'];

// Fremde Ressourcen. Beim ersten Aufruf mitnehmen, danach aus dem
// Cache bedienen - sie aendern sich nicht.
const EXTERN = [
    'https://cdn.tailwindcss.com',
    'https://cdn.jsdelivr.net/npm/chart.js',
    'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
    'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE)
            .then(cache =>
                // Kern muss klappen. Externes darf einzeln scheitern,
                // sonst schlaegt die ganze Installation fehl, nur weil
                // ein CDN gerade langsam ist.
                cache.addAll(KERN).then(() =>
                    Promise.allSettled(EXTERN.map(url =>
                        cache.add(new Request(url, { mode: 'no-cors' }))
                    ))
                )
            )
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(namen => Promise.all(
                namen.filter(n => n !== CACHE).map(n => caches.delete(n))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    const req = event.request;
    if (req.method !== 'GET') return;

    const url = new URL(req.url);

    // Schriftdateien liegen auf fonts.gstatic.com und tauchen erst
    // auf, wenn das Stylesheet geparst ist - deshalb hier statt in
    // der Installationsliste.
    const istSchrift = url.hostname === 'fonts.gstatic.com' ||
                       url.hostname === 'fonts.googleapis.com';

    if (req.mode === 'navigate') {
        // Fuer das Dokument zuerst das Netz, damit eine neue Fassung
        // ankommt. Ohne Verbindung die gespeicherte ausliefern.
        event.respondWith(
            fetch(req)
                .then(res => {
                    const kopie = res.clone();
                    caches.open(CACHE).then(c => c.put('./index.html', kopie));
                    return res;
                })
                .catch(() => caches.match('./index.html'))
        );
        return;
    }

    // Alles Uebrige zuerst aus dem Cache: schneller und offline nutzbar.
    event.respondWith(
        caches.match(req).then(treffer => {
            if (treffer) return treffer;
            return fetch(istSchrift ? new Request(req.url, { mode: 'no-cors' }) : req)
                .then(res => {
                    if (res && (res.status === 200 || res.type === 'opaque')) {
                        const kopie = res.clone();
                        caches.open(CACHE).then(c => c.put(req, kopie));
                    }
                    return res;
                })
                .catch(() =>
                    // Weder im Cache noch erreichbar. Eine klare Antwort
                    // ist besser als ein leeres respondWith, das die
                    // Anfrage mit einem Netzwerkfehler abbrechen laesst.
                    new Response('', { status: 504, statusText: 'Offline und nicht im Cache' })
                );
        })
    );
});
