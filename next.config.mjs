import { fileURLToPath } from "node:url"
import { dirname } from "node:path"

/**
 * Next 16 + Turbopack will pick whatever ancestor directory it finds a lockfile
 * in. We have a stray `package-lock.json` in `$HOME`, so Next was inferring the
 * workspace root there and serving chunk URLs like
 * `/_next/static/chunks/Documents_rombo_app_layout_tsx_…_.js` — which 404 and
 * cause the infamous `Router action dispatched before initialization.` flood.
 */
const projectRoot = dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    root: projectRoot,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
