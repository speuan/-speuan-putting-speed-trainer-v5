/**
 * Service Worker for Golf Putting Speed Trainer PWA
 */

const CACHE_NAME = 'golf-putting-speed-trainer-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/src/css/styles.css',
  '/src/js/app.js',
  '/src/js/camera/camera-controller.js',
  '/src/js/detection/ball-detector.js',
  '/src/js/calculation/speed-calculator.js',
  '/src/js/ui/ui-controller.js',
  // Add model files when available
  // '/src/models/model-golf-ball-detection.json',
  // Add icons when available
  // '/assets/icons/icon-192x192.png',
  // '/assets/icons/icon-512x512.png',
];

// Install event - cache assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache');
        return cache.addAll(ASSETS);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Fetch event - respond with cached assets when available
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Return cached response if found
        if (response) {
          return response;
        }
        
        // Clone the request to make a network request
        const fetchRequest = event.request.clone();
        
        return fetch(fetchRequest).then((response) => {
          // Check if valid response
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }
          
          // Clone the response to cache it and return it
          const responseToCache = response.clone();
          
          caches.open(CACHE_NAME)
            .then((cache) => {
              cache.put(event.request, responseToCache);
            });
            
          return response;
        });
      })
  );
}); 