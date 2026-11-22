import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  plugins: [{
    name: 'offline-shell',
    generateBundle(_, bundle) {
      const publicFiles = ['manifest.webmanifest', 'icon-192.png', 'icon-512.png']
      const files = ['./index.html', ...publicFiles.map(file => './' + file),
        ...Object.keys(bundle).map(file => './' + file)]
      const hash = createHash('sha256').update(JSON.stringify(files))
      for (const file of publicFiles) hash.update(readFileSync(new URL('./public/' + file, import.meta.url)))
      const version = hash.digest('hex').slice(0, 16)
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: `
const prefix = 'mytodo-' + self.registration.scope + '-'
const cacheName = prefix + '${version}'
self.addEventListener('install', event => {
  event.waitUntil(caches.open(cacheName).then(cache =>
    cache.addAll(${JSON.stringify(files)}.map(file => new Request(file, { cache: 'reload' })))))
})
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys
    .filter(key => key.startsWith(prefix) && key !== cacheName).map(key => caches.delete(key))))
    .then(() => self.clients.claim()))
})
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url)
  if (event.request.method !== 'GET' || !url.href.startsWith(self.registration.scope)) return
  event.respondWith(caches.open(cacheName).then(async cache => {
    if (event.request.mode === 'navigate') return (await cache.match('./index.html')) || fetch(event.request)
    return (await cache.match(event.request, { ignoreVary: true })) || fetch(event.request)
  }))
})
` })
    }
  }]
})
