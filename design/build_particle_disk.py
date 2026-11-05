"""Particle accretion disk: BAKES THE WEBSITE TEXTURE (public/textures/bh-particles.png). The Blender model itself is built by
design/build_orb_model.py. Earlier versions of this script also built the Blender scene; that part is switched off.

Original notes:

Run inside Blender with design/blackhole.blend open (Text Editor > Open > Run Script, or via the MCP).
Edit the custom properties on the empty "BH_ParticleParams" (Object Properties > Custom Properties),
then run the script again: it rebuilds the orbs in the "BlackHole 3D" scene AND rewrites
public/textures/bh-particles.png, which the website samples.

HOW THE DISK MOVES
  The disk is a swarm of orbs that spiral INTO the black hole. Every orb rides a spiral stream: its angle is
      angle = th0 - spin*t - twist*v          (v = 0 at the inner edge, 1 at the outer edge, log-spaced radius)
  and it drifts inward at `inflow` rows per second (100 rows span the whole disk). Orbs fade in at the outer edge and
  are consumed at the inner edge, then re-enter at the outside, so the flow never ends. Because every stream follows
  the same spiral, the disk shows spiral arms; `arms` / `arm_contrast` make some streams denser than others, and
  `stretch` smears each orb along its stream.

TEXTURE (RGB, NEAREST filtered, width 2*COLS texels, height ROWS+1)
  rows 0..ROWS-1, x = 2*col      : R = orb centre across the stream (0..1), G = along the stream (0..1), B = radius*2
  rows 0..ROWS-1, x = 2*col + 1  : R = brightness, G = twinkle phase, B = rank (orb is drawn when rank < density)
  row ROWS, x = 0..127           : radial profile, R = density, G = brightness (v = x / 127)
  row ROWS, x = PARAM_X + 0..2    : parameters (see PARAM0..2 in bake())
Keep COLS / ROWS in sync with PCOLS / PROWS in modules/landing/constants/blackHoleShader.ts.
"""
import math
import os
import random

import bpy

COLS, ROWS = 300, 100  # same grid as the Blender orb model (design/build_orb_model.py), so both disks have orbs of the same size
PARAM_X = 250  # texel column of the parameter block in the last row
R_IN, R_OUT = 1.5, 6.5  # disk radii in Blender units (the shader maps these to 3.8 M .. 26 M)
PROFILE_N = 128
DESIGN_VERSION = 5  # bump when DEFAULTS change meaning, so the empty's old values are replaced

DEFAULTS = {
    "seed": 7,
    # flow
    "inflow": 4.0,  # rows per second the orbs drift inward (100 rows in 25 s, the Blender loop)
    "twist": 9.0,  # radians the spiral winds between the outer and the inner edge
    "spin": 0.2513,  # 2*pi / 25 s: the same turn per loop as the Blender orbs  # rad/s the whole spiral pattern turns (negative = other way)
    # arms and streaks
    "arms": 2,  # number of spiral arms
    "arm_contrast": 1.0,  # 0 = no arms, 1 = orbs only exist inside the arms
    "arm_sharpness": 1.3,  # higher = thinner arms
    "stretch": 1.0,  # orb length along its stream, in times its width (1 = round)
    # population
    "density_inner": 1.0,
    "density_outer": 0.85,
    "density_curve": 1.0,
    "radius_min": 0.2,  # orb half-width, in cells (max 0.45)
    "radius_max": 0.3,
    "bright_inner": 1.0,
    "bright_outer": 0.65,
    "bright_curve": 0.9,
    "bright_random": 0.2,
    "hot_edge": 0.12,  # fraction of the disk, from the inside, pushed to white-hot
}

HERE = os.path.dirname(bpy.data.filepath)
OUT = os.path.normpath(os.path.join(HERE, "..", "public", "textures", "bh-particles.png"))


def params():
    scene = bpy.data.scenes["BlackHole 3D"]
    ob = bpy.data.objects.get("BH_ParticleParams")
    if ob is None:
        ob = bpy.data.objects.new("BH_ParticleParams", None)
        ob.empty_display_type = "PLAIN_AXES"
        ob.empty_display_size = 0.3
        scene.collection.objects.link(ob)
    reset = ob.get("design_version") != DESIGN_VERSION  # new disk design: old values no longer apply
    for k, v in DEFAULTS.items():
        if reset or k not in ob:
            ob[k] = v
    ob["design_version"] = DESIGN_VERSION
    return {k: ob[k] for k in DEFAULTS}


def dens_at(p, v):
    return p["density_inner"] + (p["density_outer"] - p["density_inner"]) * v ** p["density_curve"]


def bright_at(p, v):
    b = p["bright_inner"] + (p["bright_outer"] - p["bright_inner"]) * (1 - (1 - v) ** (1 / max(p["bright_curve"], 0.05)))
    return max(b, 0.95) if v < p["hot_edge"] else b


def generate(p):
    rng = random.Random(int(p["seed"]))
    cells = []
    for k in range(ROWS):
        for i in range(COLS):
            rad = rng.uniform(p["radius_min"], min(p["radius_max"], 0.45))
            ru = min(rad, 0.5)  # half-width across the stream
            rv = min(rad * p["stretch"], 0.5)  # half-length along the stream; keeps the streak inside its cell
            cells.append(
                dict(
                    i=i, k=k,
                    ou=rng.uniform(ru, 1 - ru), ov=rng.uniform(rv, 1 - rv),
                    rad=rad,
                    bright=min(max(1 - p["bright_random"] + p["bright_random"] * 1.6 * rng.random(), 0.1), 1.0),
                    phase=rng.random(), rank=rng.random(),
                )
            )
    return cells


def bake(p, cells):
    w, h = COLS * 2, ROWS + 1
    px = [0.0] * (w * h * 4)
    for n in range(w * h):
        px[n * 4 + 3] = 1.0

    def put(x, y, r, g, b):
        n = (y * w + x) * 4
        px[n : n + 3] = (min(max(r, 0.0), 1.0), min(max(g, 0.0), 1.0), min(max(b, 0.0), 1.0))

    for c in cells:
        put(2 * c["i"], c["k"], c["ou"], c["ov"], c["rad"] * 2)
        put(2 * c["i"] + 1, c["k"], c["bright"], c["phase"], c["rank"])
    for x in range(PROFILE_N):
        v = x / (PROFILE_N - 1)
        put(x, ROWS, dens_at(p, v), bright_at(p, v), 0.0)
    put(PARAM_X, ROWS, p["twist"] / 8, p["arms"] / 8, p["arm_contrast"])  # PARAM0
    put(PARAM_X + 1, ROWS, p["inflow"] / 8, (p["spin"] + 1) / 2, (p["stretch"] - 1) / 4)  # PARAM1
    put(PARAM_X + 2, ROWS, p["arm_sharpness"] / 4, 0.0, 0.0)  # PARAM2

    img = bpy.data.images.get("bh-particles")
    if img is not None and (img.size[0], img.size[1]) != (w, h):
        bpy.data.images.remove(img)  # grid size changed: start from a fresh image
        img = None
    img = img or bpy.data.images.new("bh-particles", w, h, alpha=False)
    img.colorspace_settings.name = "Non-Color"
    img.pixels = px
    img.file_format = "PNG"
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    img.filepath_raw = OUT
    img.save()
    return OUT


def build_scene(p, cells):
    scene = bpy.data.scenes["BlackHole 3D"]
    old = bpy.data.objects.get("BH_Disk")
    if old:
        old.hide_viewport = old.hide_render = True  # the first flat disk, kept in the file but hidden
    old = bpy.data.objects.get("BH_Particles")
    if old:
        bpy.data.objects.remove(old, do_unlink=True)

    # one point per cell; every attribute below drives the Geometry Nodes motion (positions are computed there)
    me = bpy.data.meshes.new("BH_Particles")
    me.from_pydata([(0.0, 0.0, 0.0)] * len(cells), [], [])
    series = {
        "x0": [c["k"] + c["ov"] for c in cells],  # start position along the flow, in rows
        "th0": [(c["i"] + c["ou"]) / COLS * 2 * math.pi for c in cells],  # which stream the orb rides
        "rad": [c["rad"] for c in cells],
        "rnk": [c["rank"] for c in cells],
        "bri": [c["bright"] for c in cells],
    }
    for name, vals in series.items():
        me.attributes.new(name, "FLOAT", "POINT").data.foreach_set("value", vals)
    ob = bpy.data.objects.new("BH_Particles", me)
    scene.collection.objects.link(ob)

    mat = bpy.data.materials.get("BH_Orb") or bpy.data.materials.new("BH_Orb")
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    attr = nt.nodes.new("ShaderNodeAttribute")
    attr.attribute_type, attr.attribute_name = "INSTANCER", "heat"
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    stops = [(0.0, (0.25, 0.02, 0.0, 1)), (0.35, (0.95, 0.25, 0.02, 1)), (0.7, (1.0, 0.7, 0.25, 1)), (1.0, (1, 1, 1, 1))]
    el = ramp.color_ramp.elements
    while len(el) < len(stops):
        el.new(0.5)
    for e, (pos, col) in zip(el, stops):
        e.position, e.color = pos, col
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs[1].default_value = 1.6
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(attr.outputs["Fac"], ramp.inputs[0])
    nt.links.new(ramp.outputs[0], em.inputs[0])
    nt.links.new(em.outputs[0], out.inputs[0])

    ng = bpy.data.node_groups.get("BH_OrbDisk")
    if ng:
        bpy.data.node_groups.remove(ng)
    ng = bpy.data.node_groups.new("BH_OrbDisk", "GeometryNodeTree")
    ng.interface.new_socket("Geometry", in_out="INPUT", socket_type="NodeSocketGeometry")
    ng.interface.new_socket("Geometry", in_out="OUTPUT", socket_type="NodeSocketGeometry")
    N, L = ng.nodes, ng.links

    def M(op, a, b=None, c=None):
        n = N.new("ShaderNodeMath")
        n.operation = op
        for idx, v in enumerate((a, b, c)):
            if v is None:
                continue
            if isinstance(v, (int, float)):
                n.inputs[idx].default_value = float(v)
            else:
                L.new(v, n.inputs[idx])
        return n.outputs[0]

    def A(name):
        n = N.new("GeometryNodeInputNamedAttribute")
        n.data_type = "FLOAT"
        n.inputs["Name"].default_value = name
        return n.outputs["Attribute"]

    def smooth(v, a, b, lo, hi):
        n = N.new("ShaderNodeMapRange")
        n.interpolation_type = "SMOOTHSTEP"
        for idx, val in enumerate((v, a, b, lo, hi)):
            if isinstance(val, (int, float)):
                n.inputs[idx].default_value = float(val)
            else:
                L.new(val, n.inputs[idx])
        return n.outputs["Result"]

    gi, go = N.new("NodeGroupInput"), N.new("NodeGroupOutput")
    t = N.new("GeometryNodeInputSceneTime").outputs["Seconds"]
    lnb = math.log(R_OUT / R_IN)

    # position: drift inward along the spiral stream
    xcur = M("WRAP", M("SUBTRACT", A("x0"), M("MULTIPLY", t, p["inflow"])), ROWS, 0.0)
    v = M("DIVIDE", xcur, ROWS)
    r = M("MULTIPLY", M("EXPONENT", M("MULTIPLY", v, lnb)), R_IN)
    psi = M("SUBTRACT", M("SUBTRACT", A("th0"), M("MULTIPLY", t, p["spin"])), M("MULTIPLY", v, p["twist"]))
    pos = N.new("ShaderNodeCombineXYZ")
    L.new(M("MULTIPLY", r, M("COSINE", psi)), pos.inputs[0])
    L.new(M("MULTIPLY", r, M("SINE", psi)), pos.inputs[1])

    # which orbs exist: radial density x spiral-arm wave, then fade in at the rim and out at the inner edge
    dens = M("ADD", p["density_inner"], M("MULTIPLY", p["density_outer"] - p["density_inner"], M("POWER", v, p["density_curve"])))
    wave = M("ADD", 0.5, M("MULTIPLY", 0.5, M("COSINE", M("MULTIPLY", A("th0"), p["arms"]))))
    arm = M("ADD", 1.0 - p["arm_contrast"], M("MULTIPLY", p["arm_contrast"], M("POWER", wave, p["arm_sharpness"])))
    exists = M("LESS_THAN", A("rnk"), M("MULTIPLY", dens, arm))
    fade = M("MULTIPLY", smooth(v, 0.0, 0.1, 0.0, 1.0), smooth(v, 0.9, 1.0, 1.0, 0.0))
    size = M("MULTIPLY", M("MULTIPLY", A("rad"), M("MULTIPLY", r, 2 * math.pi / COLS)), M("MULTIPLY", exists, fade))
    scale = N.new("ShaderNodeCombineXYZ")
    for idx in range(3):
        L.new(size, scale.inputs[idx])

    # brightness along the radius (cooler outside, white-hot at the inner edge)
    cool = M("ADD", p["bright_inner"], M("MULTIPLY", p["bright_outer"] - p["bright_inner"], M("SUBTRACT", 1.0, M("POWER", M("SUBTRACT", 1.0, v), 1.0 / max(p["bright_curve"], 0.05)))))
    hot = M("MAXIMUM", cool, M("MULTIPLY", 0.95, M("LESS_THAN", v, p["hot_edge"])))
    heat = M("MULTIPLY", A("bri"), hot)

    m2p = N.new("GeometryNodeMeshToPoints")
    setp = N.new("GeometryNodeSetPosition")
    store = N.new("GeometryNodeStoreNamedAttribute")
    store.data_type, store.domain = "FLOAT", "POINT"
    store.inputs["Name"].default_value = "heat"
    ico = N.new("GeometryNodeMeshIcoSphere")
    ico.inputs["Radius"].default_value = 1.0
    ico.inputs["Subdivisions"].default_value = 1
    iop = N.new("GeometryNodeInstanceOnPoints")
    sm = N.new("GeometryNodeSetMaterial")
    sm.inputs["Material"].default_value = mat
    L.new(gi.outputs[0], m2p.inputs["Mesh"])
    L.new(m2p.outputs[0], setp.inputs["Geometry"])
    L.new(pos.outputs[0], setp.inputs["Position"])
    L.new(setp.outputs[0], store.inputs["Geometry"])
    L.new(heat, store.inputs["Value"])
    L.new(store.outputs[0], iop.inputs["Points"])
    L.new(ico.outputs[0], iop.inputs["Instance"])
    L.new(scale.outputs[0], iop.inputs["Scale"])
    L.new(iop.outputs[0], sm.inputs["Geometry"])
    L.new(sm.outputs[0], go.inputs[0])
    mod = ob.modifiers.new("BH_OrbDisk", "NODES")
    mod.node_group = ng
    return ob


def main():
    p = params()
    cells = generate(p)
    png = bake(p, cells)
    # build_scene(p, cells)  # the Blender model is now built by design/build_orb_model.py; this script only bakes the website texture
    shown = sum(1 for c in cells if c["rank"] < dens_at(p, 0.5))
    print(f"{len(cells)} cells (about {shown} orbs visible at mid-radius) -> {png}")


main()
