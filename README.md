# Portfolio v2

Developer portfolio. The landing intro is a live WebGL black hole (gravitational lensing shader plus a Blender-designed disk of orbs) drawn as a 1-bit halftone dot picture. Drag to orbit it, tap to fall in. The headline above it types on and cycles the word in the braces.

Built with Next.js 16 (App Router), React 19, TypeScript and Tailwind CSS 4. No runtime dependencies besides Next and React.

## Run it

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build
npm run start    # serve the production build
```

Needs Node 20.9 or newer.

## Deploy to Vercel

1. Push this repository to GitHub.
2. In Vercel choose **Add New → Project**, import the repository and keep the defaults (Framework: Next.js, build command `next build`).
3. Deploy. There are no environment variables to set.

The fonts (LINE Seed JP, Bitcount Grid Double, Geist Mono) are fetched from Google Fonts at build time and served from your own domain.

## Where things are

- `app/` routing only; `modules/landing/` is the landing feature (components, hooks, constants, services, mappers, types).
- `modules/landing/constants/headlineWords.ts` the words that cycle in the headline.
- `modules/landing/constants/blackHoleShader.ts` the lensing shader and the sky.
- `components/ascii/` the dot and text renderers; `hooks/` and `lib/` are shared helpers.
- `public/models/black-hole-orbs.glb` and `public/textures/bh-particles.png` are generated from `design/` (Blender scripts and the `.blend` source).
