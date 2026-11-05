"""The black hole MODEL in Blender: two swarms of tiny orbs, built with Geometry Nodes. It does not touch the website.

Run inside Blender with design/blackhole.blend open (Text Editor > Open > Run Script, or via the MCP). Edit the custom
properties on the empty "BH_OrbParams" (Object Properties > Custom Properties), then run the script again.

WHAT IT BUILDS
  BH_Particles   the horizontal accretion disk: orbs spiral inward in the plane, flared and a little thick.
  BH_LensedOrbs  the lensed, "vertical" disk: the same kind of orbs in a ring that always faces the camera (it hangs under
                 the empty BH_HaloPivot), dense above and below the shadow, so the far side of the disk arches over the hole.
  Both flow inward, are consumed at the inner edge and re-enter at the rim, and every orb bobs gently like dust in space.

THE LOOP
  Everything is a periodic function of t / LOOP_S, so frame LOOP_FRAMES + 1 is identical to frame 1 and the animation
  repeats with no cut: orbs make exactly one trip from the rim to the hole per loop, the spiral turns exactly one full turn,
  the camera makes exactly one orbit, and every bob and twinkle repeats a whole number of times.

PERFORMANCE
  - Orbs that are not alive (outside their spiral arm, or faded at the rim / inner edge) are deleted by the node tree, so
    only live orbs are instanced.
  - In the viewport only `viewport_share` of them are drawn (the render always uses all of them).
  - The orb is a 20-face icosphere.
"""
import math
import os
import random

import bpy

SCENE = "BlackHole 3D"
FPS = 30
LOOP_S = 25.0  # seconds per loop (the website flow takes 25 s from rim to hole too)
LOOP_FRAMES = int(LOOP_S * FPS)
# 1 Blender unit = 5.2 M: the photon ring (5.2 M) is radius 1.0; the disk runs from the ring out to 26 M (5.0). Everything is real 3D now:
# a black sphere, a glowing shell for the ring, a flat disk and two lensed cones, so it looks right from every direction.
R_IN, R_OUT = 1.0, 5.0
LR_IN, LR_OUT = 1.08, 1.95  # lensed halo: radii of the shell (the arcs sit between them)
CAM_ELEV, CAM_ROLL, CAM_LENS = 9.0, -12.0, 135.0  # same as the website: tilt above the disk, screen roll, long lens (little perspective)
SCREEN_UNITS = 8.0  # the frame is 8 units tall (website: 540 px at 13 px per M)
CAM_SWAY_YAW, CAM_SWAY_ELEV = 0.28, 2.2  # gentle periodic camera sway, like the website's idle drift (rad, degrees)

DEFAULTS = {
    "seed": 11,
    "viewport_share": 0.35,  # share of orbs drawn in the viewport (1 = all)
    # horizontal disk
    "cols": 300,  # cells around the disk (more = more, smaller orbs)
    "rows": 100,  # cells from the rim to the hole
    "orb_min": 0.2,  # orb radius in cells
    "orb_max": 0.3,
    "density_inner": 1.0,
    "density_outer": 0.85,
    "twist": 9.0,  # radians the spiral winds from rim to hole
    "arms": 2,
    "arm_contrast": 1.0,
    "arm_sharpness": 1.3,
    "flare": 0.035,  # disk thickness as a share of the radius (the disk gets thicker outward)
    "bob": 0.45,  # how far orbs bob up and down, as a share of the thickness
    "doppler": 0.6,  # brighter on the side that moves toward the camera (0 = even)
    "glow": 0.5,  # soft glow under the orbs, like the website (0 = orbs only)
    "ring_glow": 0.45,  # halo just outside the photon ring
    # lensed ring
    "l_cols": 700,
    "l_rows": 100,
    "l_orb_min": 0.6,
    "l_orb_max": 1.0,
    "l_twist": 3.0,
    "l_bands": 3,  # number of concentric arcs, like the website's three arcs under the shadow
    "l_band_contrast": 1.0,
    "l_band_sharp": 1.1,  # higher = thinner, more separate arcs
    "l_limb_lo": 0.1,  # an orb is shown only when it sits near the edge of the shadow as seen from the camera:
    "l_limb_hi": 0.3,  # fully visible below lo, gone above hi (of cos(angle between its direction and the camera))
    "l_flare": 0.03,
    # look
    "bright_inner": 1.0,
    "bright_outer": 0.65,
    "hot_edge": 0.12,
    "orb_glow": 1.0,  # emission strength of the orbs
}
DESIGN_VERSION = 6


def params():
    scene = bpy.data.scenes[SCENE]
    ob = bpy.data.objects.get("BH_OrbParams")
    if ob is None:
        ob = bpy.data.objects.new("BH_OrbParams", None)
        ob.empty_display_type = "PLAIN_AXES"
        ob.empty_display_size = 0.35
        ob.location = (0.5, 0, 0)
        scene.collection.objects.link(ob)
    reset = ob.get("design_version") != DESIGN_VERSION
    for k, v in DEFAULTS.items():
        if reset or k not in ob:
            ob[k] = v
    ob["design_version"] = DESIGN_VERSION
    return {k: ob[k] for k in DEFAULTS}


def make_cells(p, cols, rows, o_min, o_max, seed, lat=False):
    rng = random.Random(seed)
    out = []
    for k in range(rows):
        for i in range(cols):
            out.append(
                (
                    k + rng.random(),  # x0: where along the flow the orb starts, in rows
                    (i + rng.random()) / cols * 2 * math.pi,  # th0: which stream it rides
                    rng.uniform(o_min, o_max),  # radius in cells
                    rng.random(),  # rank: is it alive here (compared with the local density)
                    min(max(0.8 + 0.2 * (rng.random() * 2 - 1), 0.1), 1.0),  # personal brightness
                    rng.uniform(-1, 1),  # z0: where in the disk's thickness it sits
                    float(rng.randint(1, 3)),  # kk: how many bobs per loop
                    rng.random(),  # ph: phase of its bob
                    0.0,  # (unused)
                )
            )
    return out


def lin(c):
    c = c / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


# the website's dot palette: embers -> orange -> gold -> white-hot (position, r, g, b)
PALETTE = [(0.0, 150, 35, 8), (0.3, 235, 95, 18), (0.6, 255, 170, 70), (0.85, 255, 228, 175), (1.0, 255, 255, 255)]


def orb_material(p):
    mat = bpy.data.materials.get("BH_Orb") or bpy.data.materials.new("BH_Orb")
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    attr = nt.nodes.new("ShaderNodeAttribute")
    attr.attribute_type, attr.attribute_name = "INSTANCER", "heat"
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    stops = [(pos, (lin(r_), lin(g_), lin(b_), 1)) for pos, r_, g_, b_ in PALETTE]
    el = ramp.color_ramp.elements
    while len(el) < len(stops):
        el.new(0.5)
    for e, (pos, col) in zip(el, stops):
        e.position, e.color = pos, col
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs[1].default_value = p["orb_glow"]
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(attr.outputs["Fac"], ramp.inputs[0])
    nt.links.new(ramp.outputs[0], em.inputs[0])
    nt.links.new(em.outputs[0], out.inputs[0])
    return mat


def limb_orb_material(p):
    """Orbs of the lensed halo: they sit on a sphere around the hole and are shown only where they are near the edge of the
    shadow as seen from the viewer (like an Einstein ring), so from ANY direction they make a ring of arcs around the shadow."""
    mat = bpy.data.materials.get("BH_OrbLimb") or bpy.data.materials.new("BH_OrbLimb")
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    L = nt.links
    attr = nt.nodes.new("ShaderNodeAttribute")
    attr.attribute_type, attr.attribute_name = "INSTANCER", "heat"
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    stops = [(pos, (lin(r_), lin(g_), lin(b_), 1)) for pos, r_, g_, b_ in PALETTE]
    el = ramp.color_ramp.elements
    while len(el) < len(stops):
        el.new(0.5)
    for e, (pos, col) in zip(el, stops):
        e.position, e.color = pos, col
    L.new(attr.outputs["Fac"], ramp.inputs[0])
    info = nt.nodes.new("ShaderNodeObjectInfo")
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    n1 = nt.nodes.new("ShaderNodeVectorMath")
    n1.operation = "NORMALIZE"
    L.new(info.outputs["Location"], n1.inputs[0])
    dotn = nt.nodes.new("ShaderNodeVectorMath")
    dotn.operation = "DOT_PRODUCT"
    L.new(n1.outputs[0], dotn.inputs[0])
    L.new(geo.outputs["Incoming"], dotn.inputs[1])
    ab = nt.nodes.new("ShaderNodeMath")
    ab.operation = "ABSOLUTE"
    L.new(dotn.outputs["Value"], ab.inputs[0])
    mr = nt.nodes.new("ShaderNodeMapRange")
    mr.interpolation_type = "SMOOTHSTEP"
    mr.inputs[1].default_value = p["l_limb_lo"]
    mr.inputs[2].default_value = p["l_limb_hi"]
    mr.inputs[3].default_value = 1.0
    mr.inputs[4].default_value = 0.0
    L.new(ab.outputs[0], mr.inputs[0])
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs[1].default_value = p["orb_glow"]
    L.new(ramp.outputs[0], em.inputs[0])
    tr = nt.nodes.new("ShaderNodeBsdfTransparent")
    mix = nt.nodes.new("ShaderNodeMixShader")
    L.new(mr.outputs["Result"], mix.inputs[0])
    L.new(tr.outputs[0], mix.inputs[1])
    L.new(em.outputs[0], mix.inputs[2])
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    L.new(mix.outputs[0], out.inputs[0])
    try:
        mat.surface_render_method = "DITHERED"
    except Exception:
        pass
    return mat


def build_orb_set(name, cells, cols, rows, r_in, r_out, p, twist, flare, vertical, mat):
    scene = bpy.data.scenes[SCENE]
    old = bpy.data.objects.get(name)
    if old:
        bpy.data.objects.remove(old, do_unlink=True)

    me = bpy.data.meshes.new(name)
    me.from_pydata([(0.0, 0.0, 0.0)] * len(cells), [], [])
    for idx, attr in enumerate(["x0", "th0", "rad", "rnk", "bri", "z0", "kk", "ph", "lat"]):
        me.attributes.new(attr, "FLOAT", "POINT").data.foreach_set("value", [c[idx] for c in cells])
    ob = bpy.data.objects.new(name, me)
    scene.collection.objects.link(ob)

    gname = "BH_OrbFlow_" + name
    old_g = bpy.data.node_groups.get(gname)
    if old_g:
        bpy.data.node_groups.remove(old_g)
    ng = bpy.data.node_groups.new(gname, "GeometryNodeTree")
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

    def A(attr):
        n = N.new("GeometryNodeInputNamedAttribute")
        n.data_type = "FLOAT"
        n.inputs["Name"].default_value = attr
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
    TAU = 2 * math.pi
    phase = M("MULTIPLY", t, 1.0 / LOOP_S)  # loop phase: 1.0 after one loop
    lnb = math.log(r_out / r_in)

    # ---- where the orb is: one trip rim -> hole per loop, along a spiral stream, bobbing in the disk's thickness
    xcur = M("WRAP", M("SUBTRACT", A("x0"), M("MULTIPLY", phase, rows)), rows, 0.0)
    v = M("DIVIDE", xcur, rows)  # 0 = inner edge, 1 = rim
    wobble_t = M("ADD", M("MULTIPLY", A("kk"), phase), A("ph"))
    bob = M("SINE", M("MULTIPLY", wobble_t, TAU))  # whole bobs per loop, so it repeats
    r = M("MULTIPLY", M("EXPONENT", M("MULTIPLY", v, lnb)), r_in)
    r = M("MULTIPLY", r, M("ADD", 1.0, M("MULTIPLY", 0.012, M("COSINE", M("MULTIPLY", M("ADD", wobble_t, A("ph")), TAU)))))
    psi = M("SUBTRACT", M("SUBTRACT", A("th0"), M("MULTIPLY", phase, TAU)), M("MULTIPLY", v, twist))  # one full turn per loop
    z = M("MULTIPLY", M("MULTIPLY", r, flare), M("ADD", A("z0"), M("MULTIPLY", p["bob"], bob)))
    pos = N.new("ShaderNodeCombineXYZ")
    if vertical:
        # a spherical shell: the orb's direction is (psi, u) with u uniform in -1..1, so it covers the sphere evenly; the viewer then
        # sees only the orbs near the limb (material), which form a ring of arcs round the shadow from any direction
        u = A("z0")
        sx = M("SQRT", M("SUBTRACT", 1.0, M("MULTIPLY", u, u)))
        L.new(M("MULTIPLY", M("MULTIPLY", r, sx), M("COSINE", psi)), pos.inputs[0])
        L.new(M("MULTIPLY", M("MULTIPLY", r, sx), M("SINE", psi)), pos.inputs[1])
        L.new(M("MULTIPLY", r, u), pos.inputs[2])
    else:
        L.new(M("MULTIPLY", r, M("COSINE", psi)), pos.inputs[0])
        L.new(M("MULTIPLY", r, M("SINE", psi)), pos.inputs[1])
        L.new(z, pos.inputs[2])

    # ---- which orbs are alive: radial density x arm (horizontal) or x "top and bottom of the shadow" (lensed ring)
    dens = M("ADD", p["density_inner"], M("MULTIPLY", p["density_outer"] - p["density_inner"], v))
    if vertical:
        # concentric arcs: density rises and falls with the radius, like the website's separate arcs; fewer orbs far out
        bands = M("ADD", 1.0 - p["l_band_contrast"], M("MULTIPLY", p["l_band_contrast"], M("POWER", M("ADD", 0.5, M("MULTIPLY", 0.5, M("COSINE", M("MULTIPLY", M("ADD", M("MULTIPLY", v, p["l_bands"]), 0.12), TAU)))), p["l_band_sharp"])))
        shape = M("MULTIPLY", bands, smooth(v, 1.0, 0.45, 0.0, 1.0))
    else:
        wave = M("ADD", 0.5, M("MULTIPLY", 0.5, M("COSINE", M("MULTIPLY", A("th0"), p["arms"]))))
        shape = M("ADD", 1.0 - p["arm_contrast"], M("MULTIPLY", p["arm_contrast"], M("POWER", wave, p["arm_sharpness"])))
    share = N.new("GeometryNodeIsViewport")
    sw = N.new("GeometryNodeSwitch")
    sw.input_type = "FLOAT"
    L.new(share.outputs[0], sw.inputs["Switch"])
    sw.inputs["False"].default_value = 1.0
    sw.inputs["True"].default_value = float(p["viewport_share"])  # change it in BH_OrbParams, then run the script again
    exists = M("LESS_THAN", A("rnk"), M("MULTIPLY", M("MULTIPLY", dens, shape), sw.outputs["Output"]))
    fade = M("MULTIPLY", smooth(v, 0.0, 0.1, 0.0, 1.0), smooth(v, 0.9, 1.0, 1.0, 0.0))
    alive = M("MULTIPLY", exists, fade)
    size = M("MULTIPLY", M("MULTIPLY", A("rad"), M("MULTIPLY", r, TAU / cols)), fade)
    scale = N.new("ShaderNodeCombineXYZ")
    for idx in range(3):
        L.new(size, scale.inputs[idx])

    # ---- colour: white-hot at the inner edge, cooler outside, each orb twinkles a little (whole twinkles per loop)
    cool = M("ADD", p["bright_inner"], M("MULTIPLY", (-0.25 if vertical else p["bright_outer"] - p["bright_inner"]), v))   # the lensed arcs stay bright
    hot = M("MAXIMUM", cool, M("MULTIPLY", 0.95, M("LESS_THAN", v, p["hot_edge"])))
    tw = M("ADD", 0.78, M("MULTIPLY", 0.22, M("SINE", M("MULTIPLY", M("ADD", M("MULTIPLY", M("ADD", A("kk"), 1.0), phase), M("MULTIPLY", 3.0, A("ph"))), TAU))))
    heat = M("MULTIPLY", M("MULTIPLY", A("bri"), hot), tw)
    if not vertical:
        # relativistic beaming: orbs moving toward the camera are brighter, those moving away are dimmer
        cam_info = N.new("GeometryNodeObjectInfo")
        cam_info.transform_space = "ORIGINAL"
        cam_info.inputs["Object"].default_value = bpy.data.objects["BH_Camera"]
        to_cam = N.new("ShaderNodeVectorMath")
        to_cam.operation = "SUBTRACT"
        L.new(cam_info.outputs["Location"], to_cam.inputs[0])
        L.new(pos.outputs[0], to_cam.inputs[1])
        norm = N.new("ShaderNodeVectorMath")
        norm.operation = "NORMALIZE"
        L.new(to_cam.outputs[0], norm.inputs[0])
        vdir = N.new("ShaderNodeCombineXYZ")
        L.new(M("SINE", psi), vdir.inputs[0])
        L.new(M("MULTIPLY", M("COSINE", psi), -1.0), vdir.inputs[1])
        dotp = N.new("ShaderNodeVectorMath")
        dotp.operation = "DOT_PRODUCT"
        L.new(vdir.outputs[0], dotp.inputs[0])
        L.new(norm.outputs[0], dotp.inputs[1])
        boost = M("POWER", M("MINIMUM", M("MAXIMUM", M("ADD", 1.0, M("MULTIPLY", -p["doppler"], dotp.outputs["Value"])), 0.25), 2.0), 1.5)
        heat = M("MULTIPLY", heat, boost)

    m2p = N.new("GeometryNodeMeshToPoints")
    setp = N.new("GeometryNodeSetPosition")
    store = N.new("GeometryNodeStoreNamedAttribute")
    store.data_type, store.domain = "FLOAT", "POINT"
    store.inputs["Name"].default_value = "heat"
    dele = N.new("GeometryNodeDeleteGeometry")
    dele.domain = "POINT"
    cmp_ = N.new("FunctionNodeCompare")
    cmp_.data_type, cmp_.operation = "FLOAT", "LESS_THAN"
    L.new(alive, cmp_.inputs[0])
    cmp_.inputs[1].default_value = 0.04  # not alive: removed before it is instanced
    ico = N.new("GeometryNodeMeshIcoSphere")
    ico.inputs["Radius"].default_value = 1.0
    ico.inputs["Subdivisions"].default_value = 1
    iop = N.new("GeometryNodeInstanceOnPoints")
    sm = N.new("GeometryNodeSetMaterial")
    sm.inputs["Material"].default_value = mat
    L.new(gi.outputs["Geometry"], m2p.inputs["Mesh"])
    L.new(m2p.outputs[0], setp.inputs["Geometry"])
    L.new(pos.outputs[0], setp.inputs["Position"])
    L.new(setp.outputs[0], store.inputs["Geometry"])
    L.new(heat, store.inputs["Value"])
    L.new(store.outputs[0], dele.inputs["Geometry"])
    L.new(cmp_.outputs[0], dele.inputs["Selection"])
    L.new(dele.outputs[0], iop.inputs["Points"])
    L.new(ico.outputs[0], iop.inputs["Instance"])
    L.new(scale.outputs[0], iop.inputs["Scale"])
    L.new(iop.outputs[0], sm.inputs["Geometry"])
    L.new(sm.outputs[0], go.inputs["Geometry"])
    mod = ob.modifiers.new("BH_OrbFlow", "NODES")
    mod.node_group = ng
    return ob


def annulus(name, r_in, r_out, seg=128, rings=1):
    import bmesh
    scene = bpy.data.scenes[SCENE]
    old = bpy.data.objects.get(name)
    if old:
        bpy.data.objects.remove(old, do_unlink=True)
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    grid = []
    for j in range(rings + 1):
        rr = r_in + (r_out - r_in) * j / rings
        grid.append([bm.verts.new((rr * math.cos(2 * math.pi * i / seg), rr * math.sin(2 * math.pi * i / seg), 0)) for i in range(seg)])
    for j in range(rings):
        for i in range(seg):
            k = (i + 1) % seg
            bm.faces.new((grid[j][i], grid[j][k], grid[j + 1][k], grid[j + 1][i]))
    if r_in == 0:
        bm.verts.new((0, 0, 0))
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    scene.collection.objects.link(ob)
    return ob


def disc(name, radius, seg=96):
    import bmesh
    scene = bpy.data.scenes[SCENE]
    old = bpy.data.objects.get(name)
    if old:
        bpy.data.objects.remove(old, do_unlink=True)
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    vs = [bm.verts.new((radius * math.cos(2 * math.pi * i / seg), radius * math.sin(2 * math.pi * i / seg), 0)) for i in range(seg)]
    bm.faces.new(vs)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    scene.collection.objects.link(ob)
    return ob


def translucent_material(name, color_stops, alpha_fn, p_glow, driven=False):
    """Emission that fades out by an alpha built from `alpha_fn(nt, helpers)`; used for the glow layers."""
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    L = nt.links

    def math_(op, a, b=None, c=None, clamp=False):
        n = nt.nodes.new("ShaderNodeMath")
        n.operation = op
        n.use_clamp = clamp
        for i, v in enumerate((a, b, c)):
            if v is None:
                continue
            if isinstance(v, (int, float)):
                n.inputs[i].default_value = float(v)
            else:
                L.new(v, n.inputs[i])
        return n.outputs[0]

    alpha, color_in = alpha_fn(nt, math_)
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    el = ramp.color_ramp.elements
    while len(el) < len(color_stops):
        el.new(0.5)
    for e, (pos, c) in zip(el, color_stops):
        e.position, e.color = pos, c
    L.new(color_in, ramp.inputs[0])
    em = nt.nodes.new("ShaderNodeEmission")
    L.new(ramp.outputs[0], em.inputs[0])
    em.inputs[1].default_value = p_glow
    tr = nt.nodes.new("ShaderNodeBsdfTransparent")
    mix = nt.nodes.new("ShaderNodeMixShader")
    L.new(alpha, mix.inputs[0])
    L.new(tr.outputs[0], mix.inputs[1])
    L.new(em.outputs[0], mix.inputs[2])
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    L.new(mix.outputs[0], out.inputs[0])
    try:
        mat.surface_render_method = "DITHERED"
    except Exception:
        pass
    return mat


def build_shadow_and_glow(p):
    """The things the website draws around the orbs: a black shadow, the photon ring with its bloom, and the soft disk glow."""
    scene = bpy.data.scenes[SCENE]
    pivot = bpy.data.objects["BH_HaloPivot"]
    tau = 2 * math.pi

    # old camera-facing pieces are removed: they only looked right from the render camera
    for old in ("BH_Shadow", "BH_RingGlow"):
        ob = bpy.data.objects.get(old)
        if ob:
            bpy.data.objects.remove(ob, do_unlink=True)
    ring_old = bpy.data.objects.get("BH_PhotonRing")
    if ring_old:
        ring_old.hide_viewport = ring_old.hide_render = True
        ring_old.parent = None

    # the shadow is a real black sphere (a little inside the photon ring, so the near strips of the disk still cross it)
    sphere = bpy.data.objects.get("BH_Horizon")
    if sphere is None:
        bpy.ops.mesh.primitive_uv_sphere_add(radius=1.0, segments=96, ring_count=48)
        sphere = bpy.context.active_object
        sphere.name = "BH_Horizon"
        for c in sphere.users_collection:
            c.objects.unlink(sphere)
        scene.collection.objects.link(sphere)
    sphere.hide_viewport = sphere.hide_render = False
    sphere.parent = None
    sphere.location = (0, 0, 0)
    sphere.scale = (0.97, 0.97, 0.97)
    if not sphere.data.materials:
        black = bpy.data.materials.get("BH_ShadowBlack") or bpy.data.materials.new("BH_ShadowBlack")
        black.use_nodes = True
        black.node_tree.nodes.clear()
        em = black.node_tree.nodes.new("ShaderNodeEmission")
        em.inputs[0].default_value = (0, 0, 0, 1)
        out = black.node_tree.nodes.new("ShaderNodeOutputMaterial")
        black.node_tree.links.new(em.outputs[0], out.inputs[0])
        sphere.data.materials.append(black)
    for poly in sphere.data.polygons:
        poly.use_smooth = True

    # the photon ring is a thin glowing shell hugging the sphere: seen from any angle its edge is a bright ring
    old_shell = bpy.data.objects.get("BH_PhotonShell")
    if old_shell:
        bpy.data.objects.remove(old_shell, do_unlink=True)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=1.0, segments=128, ring_count=64)
    shell = bpy.context.active_object
    shell.name = "BH_PhotonShell"
    for c in shell.users_collection:
        c.objects.unlink(shell)
    scene.collection.objects.link(shell)
    for poly in shell.data.polygons:
        poly.use_smooth = True

    def rim_alpha(nt, M):
        geo = nt.nodes.new("ShaderNodeNewGeometry")
        dotn = nt.nodes.new("ShaderNodeVectorMath")
        dotn.operation = "DOT_PRODUCT"
        nt.links.new(geo.outputs["Normal"], dotn.inputs[0])
        nt.links.new(geo.outputs["Incoming"], dotn.inputs[1])
        ndv = M("ABSOLUTE", dotn.outputs["Value"])                        # 1 facing us, 0 at the silhouette
        edge = M("POWER", M("SUBTRACT", 1.0, M("MINIMUM", M("DIVIDE", ndv, 0.3), 1.0)), 1.6)   # only the last bit of the edge
        return M("MINIMUM", M("MULTIPLY", edge, 1.6), 1.0), M("SUBTRACT", 1.0, edge)

    shell.data.materials.append(
        translucent_material("BH_PhotonRim", [(0.0, (lin(255), lin(246), lin(225), 1)), (1.0, (lin(255), lin(205), lin(130), 1))], rim_alpha, 5.0)
    )

    # soft glow under the orbs, denser inside the spiral arms (the website's GLOW)
    glow = annulus("BH_DiskGlow", R_IN, R_OUT, seg=256, rings=40)

    def glow_alpha(nt, M):
        tc = nt.nodes.new("ShaderNodeTexCoord")
        sep = nt.nodes.new("ShaderNodeSeparateXYZ")
        nt.links.new(tc.outputs["Object"], sep.inputs[0])
        x, y = sep.outputs[0], sep.outputs[1]
        r = M("SQRT", M("ADD", M("MULTIPLY", x, x), M("MULTIPLY", y, y)))
        v = M("DIVIDE", M("LOGARITHM", M("DIVIDE", r, R_IN), math.e), math.log(R_OUT / R_IN), clamp=True)  # 0 inner .. 1 rim, like the orbs
        ph = nt.nodes.new("ShaderNodeValue")
        ph.name = "phase"
        fc = nt.driver_add('nodes["phase"].outputs[0].default_value')
        fc.driver.type = "SCRIPTED"
        fc.driver.expression = f"(frame-1)/{LOOP_FRAMES}"
        th0 = M("ADD", M("ADD", M("ARCTAN2", y, x), M("MULTIPLY", ph.outputs[0], tau)), M("MULTIPLY", v, p["twist"]))  # the orbs' stream angle
        wave = M("ADD", 0.5, M("MULTIPLY", 0.5, M("COSINE", M("MULTIPLY", th0, p["arms"]))))
        arm = M("POWER", wave, 1.5)
        radial = M("MULTIPLY", M("POWER", M("SUBTRACT", 1.0, v), 1.4), M("MULTIPLY", smooth_fade(M, v), 1.0))
        a = M("MULTIPLY", M("MULTIPLY", radial, M("ADD", 0.35, M("MULTIPLY", 0.65, arm))), p["glow"] * 1.4)
        return M("MINIMUM", a, 0.7), M("SUBTRACT", 1.0, v)

    glow.data.materials.append(
        translucent_material("BH_DiskGlow", [(pos, (lin(r_), lin(g_), lin(b_), 1)) for pos, r_, g_, b_ in PALETTE], glow_alpha, 0.55)
    )
    glow.location = (0, 0, 0)
    return sphere, shell, glow


def smooth_fade(M, v):
    """inner edge fades in, the rim fades out: the same 'edge' factor the orbs use"""
    up = M("MINIMUM", M("MAXIMUM", M("MULTIPLY", v, 10.0), 0.0), 1.0)
    down = M("MINIMUM", M("MAXIMUM", M("MULTIPLY", M("SUBTRACT", 1.0, v), 10.0), 0.0), 1.0)
    return M("MULTIPLY", up, down)


def setup_scene(p):
    sc = bpy.data.scenes[SCENE]
    sc.render.fps = FPS
    sc.frame_start, sc.frame_end = 1, LOOP_FRAMES
    rig = bpy.data.objects["BH_CamOrbit"]
    cam = bpy.data.objects["BH_Camera"]
    # camera: far away with a long lens so there is almost no perspective, like the website; rolled like the website
    cam.data.lens = CAM_LENS
    cam.data.clip_end = 500
    dist = SCREEN_UNITS / (2 * math.tan(math.atan(0.5 * cam.data.sensor_width * 9 / 16 / CAM_LENS)))
    mount = bpy.data.objects.get("BH_CamMount")
    if mount is None:
        mount = bpy.data.objects.new("BH_CamMount", None)
        mount.empty_display_type = "PLAIN_AXES"
        mount.empty_display_size = 0.5
        sc.collection.objects.link(mount)
    mount.parent = rig
    el = math.radians(CAM_ELEV)
    mount.location = (0, -dist * math.cos(el), dist * math.sin(el))
    for c in list(mount.constraints):
        mount.constraints.remove(c)
    tt = mount.constraints.new("TRACK_TO")
    tt.target = rig
    tt.track_axis = "TRACK_NEGATIVE_Z"
    tt.up_axis = "UP_Y"
    for c in list(cam.constraints):
        cam.constraints.remove(c)
    cam.parent = mount
    cam.matrix_parent_inverse.identity()
    cam.location = (0, 0, 0)
    cam.rotation_euler = (0, 0, math.radians(CAM_ROLL))
    # the camera sways, periodically (whole cycles per loop): a slow yaw and a small up/down tilt of the viewing angle
    rig.animation_data_clear()
    step = 15
    for f in range(1, LOOP_FRAMES + 2, step):
        ph = (f - 1) / LOOP_FRAMES * 2 * math.pi
        rig.rotation_euler = (-math.radians(CAM_SWAY_ELEV) * math.sin(ph + 1.1), 0, CAM_SWAY_YAW * math.sin(ph))
        rig.keyframe_insert("rotation_euler", index=0, frame=f)
        rig.keyframe_insert("rotation_euler", index=2, frame=f)
    n = 0
    for layer in rig.animation_data.action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                for fc in bag.fcurves:
                    for kp in fc.keyframe_points:
                        kp.interpolation = "BEZIER"
                        kp.handle_left_type = kp.handle_right_type = "AUTO_CLAMPED"
                        n += 1
                    fc.modifiers.new("CYCLES")
    # the old textured arch and the solid sphere are replaced (kept in the file, hidden)
    halo = bpy.data.objects.get("BH_LensedHalo")
    if halo:
        halo.hide_viewport = halo.hide_render = True
    return rig


GLB_OUT = os.path.normpath(os.path.join(os.path.dirname(bpy.data.filepath), "..", "public", "models", "black-hole-orbs.glb"))


def export_glb(p, horiz_cells):
    """Write the orbs to public/models/black-hole-orbs.glb, the file the website loads (see modules/landing/mappers/orbModelMapper.ts).

    One POINTS mesh ("disk"), one point per orb, with custom per-orb attributes quantised to 10 bytes per orb. The website runs the
    same flow formulas as the Geometry Nodes above, so the model moves the same way. Parameters travel in the mesh extras. The lensed
    halo orbs (BH_LensedOrbs) are only part of the Blender scene: on the website the lensing shader makes the arcs, so they are not exported.
    """
    import json
    import struct

    chunks, views, accessors, meshes, nodes = [], [], [], [], []
    offset = 0

    def add_view(data):
        nonlocal offset
        pad = (-len(data)) % 4
        chunks.append(data + b"\0" * pad)
        views.append({"buffer": 0, "byteOffset": offset, "byteLength": len(data)})
        offset += len(data) + pad
        return len(views) - 1

    def add_accessor(view, comp, count, normalized):
        accessors.append({"bufferView": view, "componentType": comp, "count": count, "type": "SCALAR", "normalized": normalized})
        return len(accessors) - 1

    def clamp01(x):
        return min(max(x, 0.0), 1.0)

    def make_mesh(name, kind, cells, rows, cols, r_in, r_out, twist, flare):
        n = len(cells)
        x0 = struct.pack(f"<{n}H", *[int(clamp01(c[0] / rows) * 65535 + 0.5) for c in cells])
        th = struct.pack(f"<{n}H", *[int(clamp01(c[1] / (2 * math.pi)) * 65535 + 0.5) for c in cells])
        rad = struct.pack(f"<{n}B", *[int(clamp01(c[2]) * 255 + 0.5) for c in cells])
        rnk = struct.pack(f"<{n}B", *[int(clamp01(c[3]) * 255 + 0.5) for c in cells])
        bri = struct.pack(f"<{n}B", *[int(clamp01(c[4]) * 255 + 0.5) for c in cells])
        z0 = struct.pack(f"<{n}b", *[int(round(min(max(c[5], -1.0), 1.0) * 127)) for c in cells])
        kk = struct.pack(f"<{n}B", *[int(c[6]) for c in cells])
        ph = struct.pack(f"<{n}B", *[int(clamp01(c[7]) * 255 + 0.5) for c in cells])
        attrs = {
            "_X0": add_accessor(add_view(x0), 5123, n, True),
            "_TH0": add_accessor(add_view(th), 5123, n, True),
            "_RAD": add_accessor(add_view(rad), 5121, n, True),
            "_RNK": add_accessor(add_view(rnk), 5121, n, True),
            "_BRI": add_accessor(add_view(bri), 5121, n, True),
            "_Z0": add_accessor(add_view(z0), 5120, n, True),
            "_KK": add_accessor(add_view(kk), 5121, n, False),
            "_PH": add_accessor(add_view(ph), 5121, n, True),
        }
        # POSITION without a buffer view is all zeros (glTF spec); the real positions are computed from the attributes
        accessors.append({"componentType": 5126, "count": n, "type": "VEC3", "min": [0, 0, 0], "max": [0, 0, 0]})
        attrs["POSITION"] = len(accessors) - 1
        extras = {
            "kind": kind, "rows": rows, "cols": cols, "rIn": r_in, "rOut": r_out, "twist": twist, "flare": flare,
            "loopSeconds": LOOP_S, "bob": p["bob"], "densityInner": p["density_inner"], "densityOuter": p["density_outer"],
            "brightInner": p["bright_inner"], "brightOuter": p["bright_outer"], "hotEdge": p["hot_edge"],
            "arms": p["arms"], "armContrast": p["arm_contrast"], "armSharpness": p["arm_sharpness"], "doppler": p["doppler"],
            "glow": p["glow"],
        }
        meshes.append({"name": name, "primitives": [{"attributes": attrs, "mode": 0}], "extras": extras})
        nodes.append({"name": name, "mesh": len(meshes) - 1})

    make_mesh("disk", "disk", horiz_cells, int(p["rows"]), int(p["cols"]), R_IN, R_OUT, p["twist"], p["flare"])
    blob = b"".join(chunks)
    doc = {
        "asset": {"version": "2.0", "generator": "design/build_orb_model.py"},
        "scene": 0,
        "scenes": [{"nodes": list(range(len(nodes)))}],
        "nodes": nodes, "meshes": meshes, "accessors": accessors, "bufferViews": views,
        "buffers": [{"byteLength": len(blob)}],
    }
    js = json.dumps(doc, separators=(",", ":")).encode()
    js += b" " * ((-len(js)) % 4)
    total = 12 + 8 + len(js) + 8 + len(blob)
    os.makedirs(os.path.dirname(GLB_OUT), exist_ok=True)
    with open(GLB_OUT, "wb") as f:
        f.write(struct.pack("<III", 0x46546C67, 2, total))
        f.write(struct.pack("<II", len(js), 0x4E4F534A) + js)
        f.write(struct.pack("<II", len(blob), 0x004E4942) + blob)
    return GLB_OUT, total


def main():
    p = params()
    mat = orb_material(p)
    cells = make_cells(p, int(p["cols"]), int(p["rows"]), p["orb_min"], p["orb_max"], int(p["seed"]))
    horiz = build_orb_set("BH_Particles", cells, int(p["cols"]), int(p["rows"]), R_IN, R_OUT, p, p["twist"], p["flare"], False, mat)
    lcells = make_cells(p, int(p["l_cols"]), int(p["l_rows"]), p["l_orb_min"], p["l_orb_max"], int(p["seed"]) + 100, lat=True)
    lens = build_orb_set("BH_LensedOrbs", lcells, int(p["l_cols"]), int(p["l_rows"]), LR_IN, LR_OUT, p, p["l_twist"], p["l_flare"], True, limb_orb_material(p))
    lens.parent = None
    lens.location = (0, 0, 0)
    lens.rotation_euler = (0, 0, 0)
    build_shadow_and_glow(p)
    setup_scene(p)
    glb, size = export_glb(p, cells)
    print(f"horizontal {len(cells)} cells, lensed {len(lcells)} cells, loop {LOOP_FRAMES} frames ({LOOP_S} s); wrote {glb} ({size / 1e6:.2f} MB)")


main()
