// The orb disk of the black hole (design/blackhole.blend, exported to public/models/black-hole-orbs.glb).
// Every orb is one point; its position, size and brightness are worked out here from its stored attributes with the same
// formulas as the Geometry Nodes in Blender (design/build_orb_model.py), so the model moves the same way.
// Output follows the channel layout of the lensing shader (R = the black hole), premultiplied, so it composites over that pass.
// The lensing pass draws the shadow, the photon ring, the bent arch and the sky; this pass adds the flat disk and hands the far
// side over to the lensing pass with a smooth cross-fade (the lensing pass uses the mirror weights).

const COMMON = `
const float PI2 = 6.2831853;
const float REF = 270.0;          // half-height of the 960x540 reference frame, in reference pixels
const float UNIT_M = 5.2;         // one Blender unit is 5.2 M (the photon ring is radius 1)
const float SHADOW = 0.97;        // radius of the black sphere

uniform vec2 uRes;
uniform float uElev;              // camera elevation above the disk plane (radians)
uniform float uYaw;               // camera azimuth
uniform float uRoll;              // screen roll (radians)
uniform float uZoom;              // reference pixels per M

float pxPerUnit() { return UNIT_M * uZoom * 0.5 * min(uRes.x, uRes.y) / REF; }
// screen position (reference-sized units, before the roll) -> back to view space, and the reverse
vec2 unroll(vec2 p) { float c = cos(uRoll), s = sin(uRoll); return vec2(c * p.x + s * p.y, -s * p.x + c * p.y); }
vec2 roll(vec2 p) { float c = cos(uRoll), s = sin(uRoll); return vec2(c * p.x - s * p.y, s * p.x + c * p.y); }
vec2 rotZ(vec2 p, float a) { float c = cos(a), s = sin(a); return vec2(c * p.x - s * p.y, s * p.x + c * p.y); }
`;

export const ORB_VERTEX = `
precision highp float;
${COMMON}
attribute float aX0;     // start position along the flow, 0..1
attribute float aTh0;    // which stream it rides, 0..1 of a full turn
attribute float aRad;    // radius in cells
attribute float aRnk;    // is it alive here (compared with the local density)
attribute float aBri;    // personal brightness
attribute float aZ0;     // -1..1: place in the disk's thickness
attribute float aKk;     // bobs per loop
attribute float aPh;     // phase of the bob

uniform float uTime;
uniform float uLoop;
uniform float uCols, uRIn, uROut, uTwist, uFlare, uBob;
uniform float uDensIn, uDensOut, uBrIn, uBrOut, uHot;
uniform float uArms, uArmC, uArmS, uDoppler;
uniform float uShare;             // share of orbs drawn (quality)
uniform float uFade;              // overall visibility (the orbs fade out in the fall-in)
uniform float uArch;              // screen radius (units) inside which the lensing pass draws the far side

varying float vHeat;
varying float vAlpha;

void main() {
  float phase = uTime / uLoop;
  float v = fract(aX0 - phase);                       // 0 = inner edge, 1 = rim; one trip per loop
  float th0 = aTh0 * PI2;
  float wob = aKk * phase + aPh;
  float bob = sin(PI2 * wob);
  float r = uRIn * exp(v * log(uROut / uRIn));
  r *= 1.0 + 0.012 * cos(PI2 * (wob + aPh));
  float psi = th0 - phase * PI2 - v * uTwist;

  vec3 P = vec3(r * cos(psi), r * sin(psi), r * uFlare * (aZ0 + uBob * bob));
  float wave = 0.5 + 0.5 * cos(th0 * uArms);
  float shape = (1.0 - uArmC) + uArmC * pow(max(wave, 0.0), uArmS);
  float dens = uDensIn + (uDensOut - uDensIn) * v;
  float fade = smoothstep(0.0, 0.1, v) * (1.0 - smoothstep(0.9, 1.0, v));
  bool alive = aRnk < dens * shape * uShare && fade >= 0.04;

  // camera: the scene turns by yaw, then is seen from the elevation uElev above the disk plane
  vec3 Pr = vec3(rotZ(P.xy, uYaw), P.z);
  float sE = sin(uElev), cE = cos(uElev);
  vec3 toCam = vec3(0.0, -cE, sE);
  vec2 view = vec2(Pr.x, dot(Pr, vec3(0.0, sE, cE)));
  float depth = dot(Pr, toCam);                       // > 0: nearer the camera than the hole's centre
  if (length(view) < SHADOW && depth < 0.0) alive = false;   // behind the black sphere

  float cool = uBrIn + (uBrOut - uBrIn) * v;
  float hot = max(cool, 0.95 * step(v, uHot));
  float tw = 0.78 + 0.22 * sin(PI2 * ((aKk + 1.0) * phase + 3.0 * aPh));
  float heat = aBri * hot * tw;
  vec2 vd = rotZ(vec2(sin(psi), -cos(psi)), uYaw);
  float d = dot(vec3(vd, 0.0), normalize(toCam * 50.0 - Pr));
  heat *= pow(clamp(1.0 - uDoppler * d, 0.25, 2.0), 1.5);   // brighter on the side moving toward us

  float ppu = pxPerUnit();
  float worldR = aRad * r * PI2 / uCols * fade;
  float px = 2.0 * worldR * ppu;
  float size = max(px, 1.7);                          // an orb smaller than a pixel would flicker: grow it and dim it
  // cross-fade with the lensing pass, which draws the far side bent over the shadow (mirror of its weights)
  float far = smoothstep(-0.3, 0.3, Pr.y / r);
  float handOver = 1.0 - far * (1.0 - smoothstep(0.7 * uArch, uArch, length(view)));
  vAlpha = handOver * uFade * min(1.0, (px * px) / (size * size) * 3.0);
  vHeat = heat;
  gl_PointSize = alive ? min(size, 48.0) : 0.0;
  vec2 screen = roll(view) * ppu;
  gl_Position = alive && vAlpha > 0.01 ? vec4(screen / (0.5 * uRes), 0.0, 1.0) : vec4(2.0, 2.0, 2.0, 1.0);
}
`;

export const ORB_FRAGMENT = `
precision mediump float;
varying float vHeat;
varying float vAlpha;
uniform float uGain;
void main() {
  float d = length(gl_PointCoord * 2.0 - 1.0);
  float a = (1.0 - smoothstep(0.55, 1.0, d)) * vAlpha;
  gl_FragColor = vec4(vHeat * uGain * a, 0.0, 0.0, a);   // premultiplied
}
`;

// full-screen pass: the soft glow under the disk (denser inside the spiral arms), where the lensing pass does not draw the disk
export const ORB_GLOW_FRAGMENT = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
${COMMON}
uniform float uTime, uLoop;
uniform float uRIn, uROut, uTwist, uArms, uGlow;
uniform float uArch;              // screen radius (units) of the hand-over to the lensing pass

void main() {
  vec2 q = (gl_FragCoord.xy - 0.5 * uRes) * (REF / (0.5 * min(uRes.x, uRes.y)));
  vec2 p = unroll(q / (uZoom * UNIT_M));               // view-space position in Blender units
  float d = length(p);
  vec4 outc = vec4(0.0);
  float sE = sin(uElev), cE = cos(uElev);
  if (abs(sE) > 0.03) {
    vec2 w1 = vec2(p.x, p.y / sE);                     // where this pixel's ray crosses the disk plane (camera-rotated frame)
    float depth = -p.y * cE / sE;
    bool hidden = d < SHADOW && depth < 0.0;
    float r = length(w1);
    if (!hidden && r > uRIn && r < uROut) {
      float v = clamp(log(r / uRIn) / log(uROut / uRIn), 0.0, 1.0);
      float th0 = atan(w1.y, w1.x) - uYaw + uTime / uLoop * PI2 + v * uTwist;
      float arm = pow(max(0.5 + 0.5 * cos(uArms * th0), 0.0), 1.5);
      float edge = clamp(10.0 * v, 0.0, 1.0) * clamp(10.0 * (1.0 - v), 0.0, 1.0);
      float a = min(pow(1.0 - v, 1.4) * edge * (0.35 + 0.65 * arm) * uGlow * 1.4, 0.7);
      a *= 1.0 - smoothstep(-0.3, 0.3, w1.y / r) * (1.0 - smoothstep(0.7 * uArch, uArch, d));
      float lum = 0.15 + 0.55 * (1.0 - v);
      outc = vec4(lum * a, 0.0, 0.0, a);
    }
  }
  gl_FragColor = outc;
}
`;
