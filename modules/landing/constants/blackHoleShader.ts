// Real-time Schwarzschild black hole (G = c = M = 1), rendered at ASCII-grid resolution.
// Each pixel integrates a null geodesic u(phi) = 1/r in its orbital plane (u'' = -u + 3u^2), shades the
// thin accretion disk wherever the ray crosses the equatorial plane, and samples a procedural starfield
// from the escape direction. The explosion ("plunge") is the same scene zoomed in, plus an astroid caustic.

export const BLACK_HOLE_VERTEX = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

export const BLACK_HOLE_FRAGMENT = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform vec2 uRes;
uniform float uElev;      // camera elevation above the disk plane (radians)
uniform float uYaw;       // camera azimuth: rotates the disk texture under the camera
uniform float uRoll;      // screen roll (radians)
uniform float uZoom;      // reference pixels per M (REST_ZOOM in useBlackHole = resting view)
uniform float uTime;      // seconds, drives the disk rotation
uniform sampler2D uDisk;  // baked particle cells (see diskEmission)
uniform float uGain;      // disk brightness multiplier (flares during the plunge)
uniform float uStars;     // starfield visibility
uniform float uRingW;     // photon ring width multiplier
uniform float uBase;      // 1 = draw the black hole, 0 = only the caustic
uniform float uBoom;      // explosion progress 0..1, or -1 when idle
uniform float uOrbDisk;   // 1 = the flat part of the disk is drawn by the orb model: keep only the far side bent over the shadow, cross-faded
uniform float uLite;      // 0 = everything, 1 = no second plasma layer or faint stars, 2 = also no galaxy specks or arcs (slow devices)
uniform float uArchM;     // inside this screen radius (in M) the far side of the disk is bent over the shadow and is drawn here

const float PI = 3.14159265;
const float RIN = 3.8;
const float ROUT = 26.0;
const float REF = 270.0;  // half-height of the 960x540 reference frame, in pixels
const float BG_LENSING = 0.22;      // how strongly the black hole bends the background just outside its ring (it fades with distance)
const float NEBULA_STRENGTH = 0.5;  // brightness of the plasma clouds (0 = off)
const float NEBULA_BODY = 0.14;     // how much of the cloud is soft gas besides the bright veins
const float NEBULA_CUT = 0.54;      // higher = smaller, sparser clouds
const float PLASMA_FLOW = 0.03;     // how fast the plasma drifts
const vec2 HERO_POS = vec2(-0.15, 0.075); // where the big warm star sits (sky units; the screen spans about +-0.25 by +-0.14)
const float HERO_GAIN = 0.8;
const float LENS_STREAK = 0.2;     // horizontal anamorphic streak through the black hole (0 = off)
const float VIGNETTE = 0.6;        // darkening toward the corners (0 = off)
const float SPIKE_LEN = 0.011;      // length of the diffraction spikes on the bright stars, in sky units
const float METEOR_PERIOD = 3.4;   // seconds between shooting stars, per stream (three streams, so one about every second)
const float METEOR_LIFE = 0.9;     // how long one streak lasts
const float DISK_GAIN = 2.0;   // orb brightness
const float RING_BLOOM = 0.45;    // halo just outside the photon ring
const float GLOW = 0.7;        // brightness of the soft glow under the orbs (0 = orbs only)
const float ORB_CORE = 0.85;   // solid core as a fraction of the orb radius; the rest is a soft edge
const float ORB_TWINKLE = 0.2; // how much each orb's brightness pulses
const float ORB_SPARKLE = 6.0; // boosts orbs that are smaller than a pixel so the fine dust still reads
const float PCOLS = 300.0;      // particle grid: must match COLS / ROWS in design/build_particle_disk.py
const float PROWS = 100.0;
const float TEXW = 600.0;      // texture width = 2 * PCOLS
const float PARAM_X = 250.0;   // texel column of the parameter block (PARAM_X in the Blender script)

float ss(float a, float b, float x) { float t = clamp((x - a) / (b - a), 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

vec2 deriv(float u, float v) { return vec2(v, -u + 3.0 * u * u); }

// The disk is a swarm of little orbs that spiral into the black hole, designed in design/blackhole.blend
// (BH_Particles) and baked into uDisk by design/build_particle_disk.py. See that script for the texture layout.
// Every orb rides a spiral stream: a pixel at radius v finds its stream from  angle + twist*v + spin*t,
// and finds the orb that is passing it by looking v + inflow*t rows further out, so orbs drift inward, brighten
// toward the inner edge and are consumed there. Lensing, Doppler beaming and the photon ring are applied around it.
float gPixM = 0.05;   // size of one canvas pixel in M, set in blackHole()
float gCluster = 1.0; // large-scale clustering of galaxies at this spot of the sky (voids < 1 < clusters), set in blackHole()

vec3 cellTex(float x, float y) { return texture2D(uDisk, vec2((x + 0.5) / TEXW, (y + 0.5) / (PROWS + 1.0))).rgb; }

float diskEmission(float r, float psi, float tn, out float alpha) {
  float v = log(r / RIN) / log(ROUT / RIN);                       // 0 inner edge .. 1 outer edge
  vec3 p0 = cellTex(PARAM_X, PROWS), p1 = cellTex(PARAM_X + 1.0, PROWS), p2 = cellTex(PARAM_X + 2.0, PROWS);
  float twist = p0.r * 8.0, arms = floor(p0.g * 8.0 + 0.5), contrast = p0.b;
  float inflow = p1.r * 8.0, spin = p1.g * 2.0 - 1.0, stretch = 1.0 + p1.b * 4.0, sharp = p2.r * 4.0;

  float y = v * PROWS + uTime * inflow;                           // row coordinate, flowing inward over time
  float k = mod(floor(y), PROWS);
  float fv = fract(y);
  float ang = psi - uYaw + twist * v + spin * uTime;              // identity of the stream this pixel sits on
  float fi = fract(ang / (2.0 * PI)) * PCOLS;
  float ic = min(floor(fi), PCOLS - 1.0);
  float fu = fi - ic;

  vec3 A = cellTex(2.0 * ic, k);
  vec3 B = cellTex(2.0 * ic + 1.0, k);
  vec3 prof = cellTex(floor(v * 127.0), PROWS);                   // density and brightness along the radius

  float arm = 1.0 - contrast + contrast * pow(0.5 + 0.5 * cos(arms * ang), sharp);
  float exists = step(B.b, prof.r * arm);
  float edge = ss(0.0, 0.1, v) * (1.0 - ss(0.9, 1.0, v));         // consumed at the inner edge, born at the rim

  float rad = max(A.b * 0.5, 1e-3);
  float d = length(vec2(fu - A.r, (fv - A.g) / stretch));        // orbs are smeared along their stream
  // orbs smaller than a canvas pixel would shimmer or vanish: widen them to the pixel footprint and
  // scale their strength by the area ratio, so they fade smoothly instead (energy is conserved)
  float cellM = 2.0 * PI * r / PCOLS;
  float radE = max(rad, 0.7 * gPixM / cellM);
  float cover = (1.0 - ss(ORB_CORE * radE, radE, d)) * exists * edge * min(1.0, (rad * rad) / (radE * radE) * ORB_SPARKLE);

  float tw = 1.0 - ORB_TWINKLE + ORB_TWINKLE * sin(uTime * (2.0 + 5.0 * B.g) + 6.2831 * B.g);
  float vel = min(0.55, 1.0 / sqrt(max(r - 2.0, 0.5)));
  float g = sqrt(1.0 - 2.0 / r) / ((1.0 / sqrt(1.0 - vel * vel)) * (1.0 - vel * tn));
  float boost = pow(clamp(g, 0.25, 2.0), 1.5);
  // a soft continuous glow under the orbs (denser inside the spiral arms), so the disk reads as one shape
  float glow = GLOW * prof.r * prof.g * (0.35 + 0.65 * pow(0.5 + 0.5 * cos(arms * ang), 1.5)) * edge;
  float orb = cover * 0.98;
  alpha = max(orb, min(glow * 1.4, 0.7));
  return (orb * DISK_GAIN * B.r * prof.g * tw + (1.0 - orb) * glow) * boost * uGain;
}

float angNoise(float th) {
  return 0.55 * sin(9.0 * th + 1.3) + 0.42 * sin(14.0 * th + 4.1) + 0.36 * sin(21.0 * th + 2.2)
       + 0.3 * sin(29.0 * th + 5.7) + 0.26 * sin(38.0 * th + 0.4) + 0.22 * sin(51.0 * th + 3.3)
       + 0.18 * sin(67.0 * th + 1.9) + 0.15 * sin(83.0 * th + 4.8);
}

// white astroid caustic with rippled dark lobes; returns (luminance, coverage)
vec2 caustic(vec2 q, float t) {
  float a = 470.0 * pow(ss(0.38, 0.62, t), 1.2) * (1.0 + 0.06 * sin(6.0 * PI * t)) * pow(1.0 - ss(0.80, 0.96, t), 1.6) + 1e-3;
  float rot = radians(45.0 + 28.0 * t);
  float c = cos(rot), s = sin(rot);
  float x = (c * q.x + s * q.y) / a, y = (-s * q.x + c * q.y) / a;
  float th = atan(q.y, q.x);
  float n = angNoise(th) * 0.9;
  float F = pow(pow(abs(x) + 1e-6, 2.0 / 3.0) + pow(abs(y) + 1e-6, 2.0 / 3.0), 1.5) * (1.0 + 0.07 * n);
  float core = 1.0 - ss(0.80, 1.05, F);
  float glow = exp(-max(F - 0.9, 0.0) * 3.6) * 0.55;
  vec2 xy = vec2(x, y);
  float d = min(min(length(xy - vec2(0.75, 0.75)), length(xy - vec2(0.75, -0.75))),
                min(length(xy - vec2(-0.75, 0.75)), length(xy - vec2(-0.75, -0.75))));
  float rip = 0.5 + 0.5 * sin(2.0 * PI * (d * a / 34.0 - 5.0 * t) + 0.6 * n);
  float lobe = (0.03 + 0.26 * rip * ss(0.25, 0.85, 1.0 - d)) * ss(0.45, 0.6, t);
  float rk = length(q) / (0.05 * a + 1e-3);
  float knot = ss(0.6, 1.0, rk * (1.0 + 0.3 * sin(4.0 * th + 0.8 + 6.0 * t) + 0.06 * n));
  float lum = (max(core, glow) + lobe * (1.0 - core)) * (0.35 + 0.65 * knot);
  float amp = ss(0.38, 0.46, t) * (1.0 - ss(0.86, 0.97, t));
  return vec2(clamp(lum, 0.0, 1.4) * amp, core * amp);
}

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + vec2(17.1, 9.3); a *= 0.5; }
  return s;
}

vec2 rot2(vec2 p, float a) { float c = cos(a), s = sin(a); return vec2(c * p.x - s * p.y, s * p.x + c * p.y); }

// a shooting star every few seconds: a bright head with a fading tail, in lensed sky coordinates so it bends too
float meteor(vec2 sky, float pixM, float salt) {
  float t = (uTime + salt * 2.37) / METEOR_PERIOD;
  float k = floor(t), f = fract(t);
  float dur = METEOR_LIFE / METEOR_PERIOD;
  if (f > dur) return 0.0;
  float p = f / dur;
  vec2 start = (vec2(hash(vec2(k, 1.7 + salt * 11.0)), hash(vec2(k, 8.3 + salt * 7.0))) - 0.5) * vec2(0.5, 0.3);
  float ang = hash(vec2(k, 4.1 + salt * 5.0)) * 6.2831;
  vec2 dir = vec2(cos(ang), sin(ang));
  float len = 0.09 + 0.06 * hash(vec2(k, 6.6 + salt * 3.0));
  vec2 head = start + dir * len * p;
  vec2 tail = head - dir * len * 0.4;
  vec2 pa = sky - tail, ba = head - tail;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  float d = length(pa - ba * h);
  float sigma = max(0.0010, 0.7 * pixM / 150.0);
  return exp(-d * d / (2.0 * sigma * sigma)) * (0.25 + 0.75 * h * h) * sin(3.14159 * p);
}

// ---- the sky: a deep field of tiny galaxies, spiked stars and lensed arcs, with coloured gas. Every layer adds
// brightness b with a colour index h (0..1, turned into a colour by the dot layer); the brightness-weighted mean of h is
// what reaches the screen.
void addSky(float b, float h, inout float W, inout float Hs) { W += b; Hs += b * h; }

// colour index by kind of object: mostly orange galaxies, some warm white, blue and pink/purple ones
float hueOf(float t) {
  if (t < 0.55) return 0.86 + 0.08 * fract(t * 13.0);
  if (t < 0.70) return 0.02 + 0.04 * fract(t * 17.0);
  if (t < 0.9) return 0.14 + 0.08 * fract(t * 11.0);
  return 0.52 + 0.1 * fract(t * 19.0);
}

// small elliptical galaxies, one per grid cell at most, each with its own tilt, stretch, size, brightness and colour
void galaxyLayer(vec2 sky, float cell, float prob, float sMin, float sMax, float seed, float pixM, inout float W, inout float Hs) {
  vec2 g = floor(sky / cell);
  vec2 s0 = g + seed;
  if (hash(s0) > prob * gCluster) return;
  vec2 c = (g + 0.3 + 0.4 * vec2(hash(s0 + 3.1), hash(s0 + 7.7))) * cell;
  float th = hash(s0 + 11.0) * 3.14159;
  float axis = 0.2 + 0.8 * hash(s0 + 5.3);
  float sig = max(mix(sMin, sMax, pow(hash(s0 + 9.1), 2.0)), 0.55 * pixM / 150.0);
  vec2 d = rot2(sky - c, -th);
  float e = (d.x * d.x) / (sig * sig) + (d.y * d.y) / (sig * sig * axis * axis);
  // many faint ones, few bright ones, like a real deep field
  addSky(exp(-0.5 * e) * (0.12 + 0.88 * pow(hash(s0 + 2.2), 2.2)), hueOf(hash(s0 + 14.4)), W, Hs);
}

// the few large galaxies: a tight bright bulge inside a wider disc, with a hint of spiral arms
void bigGalaxyLayer(vec2 sky, float seed, inout float W, inout float Hs) {
  float cell = 0.06;
  vec2 g = floor(sky / cell);
  vec2 s0 = g + seed;
  if (hash(s0) > 0.3 * gCluster) return;
  vec2 c = (g + 0.35 + 0.3 * vec2(hash(s0 + 3.1), hash(s0 + 7.7))) * cell;
  float th = hash(s0 + 11.0) * 3.14159;
  float axis = 0.35 + 0.65 * hash(s0 + 5.3);
  float sig = 0.0018 + 0.0012 * hash(s0 + 9.1);
  vec2 d = rot2(sky - c, -th);
  float e = (d.x * d.x) / (sig * sig) + (d.y * d.y) / (sig * sig * axis * axis);
  float core = exp(-1.1 * e);
  float halo = exp(-0.5 * e / 3.0);
  float arms = 1.0 + 0.55 * hash(s0 + 6.0) * cos(2.0 * atan(d.y / axis, d.x) + 1.8 * sqrt(e));
  float amp = 0.55 + 0.45 * hash(s0 + 2.2);
  addSky(0.9 * core * amp, 0.04, W, Hs);                                              // warm-white bulge
  addSky(0.4 * halo * arms * amp, hash(s0 + 14.4) < 0.5 ? 0.16 : 0.88, W, Hs);        // blue or orange disc
}

// point stars; the big ones get long diffraction spikes (a cross plus a shorter diagonal cross), like the JWST images
void starLayer2(vec2 sky, float cell, float prob, float sig, float amp, float seed, float pixM, float spikes, inout float W, inout float Hs) {
  vec2 g = floor(sky / cell);
  vec2 s0 = g + seed;
  if (hash(s0) > prob) return;
  vec2 c = (g + 0.35 + 0.3 * vec2(hash(s0 + 7.1), hash(s0 + 3.7))) * cell;
  vec2 d = sky - c;
  float sigma = max(sig, 0.6 * pixM / 150.0);
  float sp = hash(s0 + 11.3), ph = hash(s0 + 5.9) * 6.2831;
  float tw = 0.5 + 0.5 * sin(uTime * (1.2 + 3.5 * sp) + ph) * sin(uTime * (0.7 + 2.1 * sp) + 2.0 * ph);
  tw = 0.35 + 0.65 * tw * tw;
  float b = exp(-dot(d, d) / (2.0 * sigma * sigma));
  if (spikes > 0.5) {
    float L = SPIKE_LEN * (0.7 + 0.3 * hash(s0 + 4.4));
    float w = max(0.0006, 0.5 * pixM / 150.0);
    vec2 dd = rot2(d, 0.7853982);
    float s1 = exp(-d.y * d.y / (2.0 * w * w)) * exp(-abs(d.x) / L) + exp(-d.x * d.x / (2.0 * w * w)) * exp(-abs(d.y) / L);
    float s2 = exp(-dd.y * dd.y / (2.0 * w * w)) * exp(-abs(dd.x) / (0.5 * L)) + exp(-dd.x * dd.x / (2.0 * w * w)) * exp(-abs(dd.y) / (0.5 * L));
    b += 0.5 * s1 + 0.3 * s2;
  }
  float t = hash(s0 + 8.8);
  addSky(b * amp * (0.1 + 0.9 * pow(hash(s0 + 1.9), 1.8)) * tw, t < 0.65 ? 0.09 + 0.06 * t : (t < 0.85 ? 0.04 : 0.86), W, Hs);
}

// one big warm star with a soft halo and long cinematic spikes, as a focal point in the corner of the frame
void heroStar(vec2 sky, float pixM, inout float W, inout float Hs) {
  vec2 d = sky - HERO_POS;
  float rr = length(d);
  float w = max(0.0007, 0.6 * pixM / 150.0);
  float pulse = 0.92 + 0.08 * sin(uTime * 0.7);
  float halo = 0.5 * exp(-rr / 0.012) + 0.1 * exp(-rr * rr / (2.0 * 0.03 * 0.03));
  float spikeH = exp(-d.y * d.y / (2.0 * w * w)) * exp(-abs(d.x) / 0.085);
  float spikeV = exp(-d.x * d.x / (2.0 * w * w)) * exp(-abs(d.y) / 0.05);
  addSky(HERO_GAIN * pulse * (halo + 0.8 * spikeH + 0.5 * spikeV + 1.1 * exp(-rr * rr / (2.0 * w * w * 4.0))), 0.04, W, Hs);
}

// a thin arc of a lensed background galaxy around an invisible cluster
float arcAt(vec2 p, vec2 c, float R, float a0, float halfW, float sig) {
  vec2 d = p - c;
  float da = abs(mod(atan(d.y, d.x) - a0 + 3.14159, 6.28318) - 3.14159);
  return exp(-pow(length(d) - R, 2.0) / (2.0 * sig * sig)) * (1.0 - ss(0.5 * halfW, halfW, da));
}

// plasma: warped sheets of gas with thin bright filaments running through them, slowly flowing, in blue / purple / green / pink
float fbm3(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 3; i++) { s += a * vnoise(p); p = p * 2.03 + vec2(17.1, 9.3); a *= 0.5; }
  return s;
}
void plasmaLayer(vec2 sky, float scale, vec2 seed, float strength, float hueLo, float hueHi, inout float W, inout float Hs) {
  float t = uTime * PLASMA_FLOW;
  vec2 p = sky * scale + seed;
  vec2 warp = vec2(fbm3(p * 0.9 + vec2(t, 2.1)), fbm3(p * 0.9 + vec2(6.9, -t)));   // domain warp: the flow
  vec2 pw = p + 2.6 * (warp - 0.5);
  float n = fbm(pw);                                                                // soft body of the cloud
  float ridge = 1.0 - abs(2.0 * fbm3(pw * 1.8 + vec2(3.3, t * 0.6)) - 1.0);          // thin bright veins
  float body = ss(NEBULA_CUT + 0.08, 1.0, n);
  float veins = pow(ridge, 6.0) * ss(NEBULA_CUT - 0.1, 0.7, n);
  // the colours of the universe: turquoise, green and purple (hue index 0.2 .. 0.5 on the palette in IntroCanvas)
  float hue = mix(hueLo, hueHi, ss(0.3, 0.7, fbm3(sky * 3.4 + seed * 0.37 + 9.0 + vec2(t * 0.4))));
  addSky(strength * (NEBULA_BODY * body + 1.2 * veins), hue, W, Hs);
}
void colorNebula(vec2 sky, inout float W, inout float Hs) {
  plasmaLayer(sky, 9.0, vec2(0.0), NEBULA_STRENGTH, 0.2, 0.34, W, Hs);                  // turquoise and green clouds
  if (uLite < 0.5) plasmaLayer(sky, 6.5, vec2(31.7, -14.2), 0.85 * NEBULA_STRENGTH, 0.36, 0.5, W, Hs);   // a second layer in other places: blue-purple and purple
}

vec3 blackHole(vec2 q, float pixM) {
  gPixM = pixM;
  vec2 XY = q / uZoom;
  float cr = cos(uRoll), sr = sin(uRoll);
  vec2 P = vec2(cr * XY.x + sr * XY.y, -sr * XY.x + cr * XY.y);
  float b = length(P) + 1e-6;
  float ex = P.x / b, ey = P.y / b;
  float sE = sin(uElev), cE = cos(uElev);
  float phiK = mod(atan(-sE, ey * cE), PI);

  float u = 0.0, v = 1.0 / b, phi = 0.0;
  const float DPHI = 0.07;
  float I = 0.0, T = 1.0;
  float phiE = -1.0;
  int k = 0;
  for (int i = 0; i < 200; i++) {
    vec2 k1 = deriv(u, v);
    vec2 k2 = deriv(u + 0.5 * DPHI * k1.x, v + 0.5 * DPHI * k1.y);
    vec2 k3 = deriv(u + 0.5 * DPHI * k2.x, v + 0.5 * DPHI * k2.y);
    vec2 k4 = deriv(u + DPHI * k3.x, v + DPHI * k3.y);
    float un = u + DPHI / 6.0 * (k1.x + 2.0 * k2.x + 2.0 * k3.x + k4.x);
    float vn = v + DPHI / 6.0 * (k1.y + 2.0 * k2.y + 2.0 * k3.y + k4.y);

    if (k < 4 && phi + DPHI >= phiK) {
      float t = (phiK - phi) / DPHI;
      float uk = mix(u, un, t), vk = mix(v, vn, t);
      if (uk > 1e-4 && uk < 0.5) {
        float r = 1.0 / uk;
        if (r >= RIN && r <= ROUT) {
          float rp = -vk * r * r;
          float cp = cos(phiK), sp = sin(phiK);
          float Px = r * sp * ex;
          float Py = r * (-cp * cE + sp * ey * sE);
          float psi = atan(Py, Px);
          float dPx = rp * sp * ex + r * cp * ex;
          float dPy = rp * (-cp * cE + sp * ey * sE) + r * (sp * cE + cp * ey * sE);
          float dPz = rp * (cp * sE + sp * ey * cE) + r * (-sp * sE + cp * ey * cE);
          vec3 nrm = -normalize(vec3(dPx, dPy, dPz));
          float tn = -nrm.x * sin(psi) + nrm.y * cos(psi);
          // With the orb disk, the first image is drawn here only where it is bent over the shadow (far side, near the hole).
          // The hand-over to the orbs is a smooth cross-fade, in radius and across the near/far line, so there is no visible cut;
          // the orb pass uses the mirror weights (1 - w).
          float wLens = 1.0;
          if (uOrbDisk > 0.5 && k == 0) {
            float far = smoothstep(-0.3, 0.3, Py / r);
            float inner = 1.0 - smoothstep(0.7 * uArchM, uArchM, b);
            wLens = far * inner;
          }
          if (wLens > 0.001) {
            float alpha;
            float e = diskEmission(r, psi, tn, alpha);
            alpha *= wLens;
            I += T * alpha * e;
            T *= 1.0 - alpha;
          }
        }
      }
      k++;
      phiK += PI;
    }
    if (un > 0.5) break;                                     // captured by the horizon
    if (un <= 0.0) { phiE = phi + DPHI * u / (u - un); break; } // escaped to the sky
    u = min(un, 0.6); v = vn; phi += DPHI;
    if (T < 0.01) break;
  }

  float ringW = max(0.045 * uRingW, 0.8 * pixM);
  I += T * 2.4 * exp(-0.5 * pow((b - 5.22) / ringW, 2.0));
  I += T * RING_BLOOM * exp(-max(b - 5.3, 0.0) / 0.9) * step(5.0, b);   // light spilling off the ring
  // anamorphic lens streak, like the long horizontal flare in the film
  I += LENS_STREAK * exp(-pow(P.y / (0.55 + 0.002 * abs(P.x)), 2.0)) * exp(-abs(P.x) / 16.0) * step(5.35, b);
  I = max(I - 0.05, 0.0) * 1.05;   // crush the faint outer disk so the ASCII background stays black
  // two separate brightness channels: the black hole (disk + photon ring) and the sky behind it. The ASCII grid draws the
  // hole with dense glyphs and the sky with light dots, so the black hole always stands out from the stars.
  vec3 warm = vec3(clamp(1.9 * I, 0.0, 1.0), clamp(1.9 * I - 0.45, 0.0, 1.0) * 0.95, clamp(1.7 * I - 1.15, 0.0, 1.0));
  float hole = dot(warm, vec3(0.299, 0.587, 0.114));
  float bg = 0.0;

  float skyHue = 0.0;
  if (phiE > 0.0 && uStars > 0.0) {
    // the bend of the background is strongest right next to the ring and dies out quickly, so the field stays calm
    float wl = BG_LENSING * exp(-pow(max(b - 5.2, 0.0) / 8.0, 2.0));
    vec2 sky = vec2(ex, ey) * (b / 150.0 - wl * (phiE - PI));
    // three depths: nearer layers slide further when the camera orbits (parallax)
    vec2 sFar = rot2(sky, uYaw * 0.04), sMid = rot2(sky, uYaw * 0.09), sNear = rot2(sky, uYaw * 0.16);
    float W = 0.0, Hs = 0.0;
    gCluster = 0.25 + 1.5 * fbm(sFar * 5.0 + 3.7);
    colorNebula(sFar, W, Hs);
    if (uLite < 1.5) galaxyLayer(sFar, 0.009, 0.10, 0.0007, 0.0011, 31.0, pixM, W, Hs);   // faint specks
    galaxyLayer(sMid, 0.016, 0.13, 0.0009, 0.0020, 7.0, pixM, W, Hs);    // the galaxies
    bigGalaxyLayer(sMid, 61.0, W, Hs);
    vec2 cl = vec2(-0.15, -0.055);                                        // lensing cluster whose arcs we see
    float arcs = 0.6 * (0.9 * arcAt(sMid, cl, 0.045, 0.9, 0.55, 0.0011) + 0.8 * arcAt(sMid, cl, 0.075, 3.4, 0.45, 0.0012)
                      + 0.7 * arcAt(sMid, cl, 0.030, 5.2, 0.40, 0.0010) + 0.6 * arcAt(sMid, cl, 0.058, 2.1, 0.30, 0.0009));
    if (uLite < 1.5) addSky(arcs, 0.9, W, Hs);
    if (uLite < 0.5) starLayer2(sFar, 0.0045, 0.05, 0.0009, 0.45, 19.0, pixM, 0.0, W, Hs);   // faint stars
    starLayer2(sMid, 0.0065, 0.04, 0.0011, 0.9, 53.0, pixM, 0.0, W, Hs);
    starLayer2(sNear, 0.025, 0.22, 0.0014, 1.5, 77.0, pixM, 0.0, W, Hs);
    starLayer2(sNear, 0.12, 0.5, 0.0013, 2.0, 91.0, pixM, 1.0, W, Hs);   // bright stars with diffraction spikes
    heroStar(sNear, pixM, W, Hs);
    addSky(1.3 * (meteor(sky, pixM, 0.0) + meteor(sky, pixM, 1.0) + meteor(sky, pixM, 2.0)), 0.02, W, Hs);   // three streams of shooting stars
    bg = min(W * T * uStars, 1.0);
    skyHue = Hs / max(W, 1e-4);
  }
  return vec3(hole, bg, skyHue);   // R = black hole, G = sky brightness, B = sky colour index
}

void main() {
  vec2 q = (gl_FragCoord.xy - 0.5 * uRes) * (REF / (0.5 * min(uRes.x, uRes.y)));
  float pixM = (REF / (0.5 * min(uRes.x, uRes.y))) / uZoom;   // size of one canvas pixel in M
  vec3 col = uBase > 0.5 ? blackHole(q, pixM) : vec3(0.0);
  if (uBoom >= 0.0) {
    vec2 cl = caustic(q, uBoom);
    float cover = clamp(cl.y, 0.0, 1.0);
    col.r = col.r * (1.0 - cover) + cl.x;   // the caustic is part of the black hole channel
    col.g *= 1.0 - cover;
    col *= 1.0 - ss(0.93, 1.0, uBoom);
  }
  // vignette: the corners fall into darkness, like a film frame
  vec2 vu = gl_FragCoord.xy / uRes - 0.5;
  col.rg *= 1.0 - VIGNETTE * smoothstep(0.25, 0.85, length(vu * vec2(1.25, 1.0)));
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;
