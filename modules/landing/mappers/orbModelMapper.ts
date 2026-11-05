import type { OrbModel, OrbSwarm, OrbSwarmSettings } from "../types/orbModelTypes";

const GLB_MAGIC = 0x46546c67; // "glTF"
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;

type Accessor = { bufferView: number; componentType: number; count: number };
type Gltf = {
  meshes: { name: string; primitives: { attributes: Record<string, number> }[]; extras: OrbSwarmSettings }[];
  accessors: Accessor[];
  bufferViews: { byteOffset: number; byteLength: number }[];
};

/** Reads a .glb written by design/build_orb_model.py into typed arrays (no three.js needed for point data). */
export function mapOrbModel(buffer: ArrayBuffer): OrbModel {
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== GLB_MAGIC) throw new Error("Orb model: not a GLB file");
  let json: Gltf | null = null;
  let binOffset = 0;
  for (let at = 12; at < buffer.byteLength; ) {
    const length = view.getUint32(at, true);
    const type = view.getUint32(at + 4, true);
    if (type === CHUNK_JSON) json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, at + 8, length)));
    else if (type === CHUNK_BIN) binOffset = at + 8;
    at += 8 + length + ((4 - (length % 4)) % 4);
  }
  if (!json || !binOffset) throw new Error("Orb model: missing chunks");
  const doc = json;

  const read = <T extends Uint8Array | Uint16Array | Int8Array>(Ctor: new (b: ArrayBuffer, o: number, n: number) => T, accessor: number): T => {
    const a = doc.accessors[accessor];
    const v = doc.bufferViews[a.bufferView];
    // copy so each array owns an aligned buffer
    return new Ctor(buffer.slice(binOffset + v.byteOffset, binOffset + v.byteOffset + v.byteLength), 0, a.count);
  };

  const swarm = (name: "disk"): OrbSwarm => {
    const mesh = doc.meshes.find((m) => m.name === name);
    if (!mesh) throw new Error(`Orb model: no "${name}" mesh`);
    const at = mesh.primitives[0].attributes;
    return {
      count: doc.accessors[at._X0].count,
      settings: mesh.extras,
      x0: read(Uint16Array, at._X0),
      th0: read(Uint16Array, at._TH0),
      rad: read(Uint8Array, at._RAD),
      rnk: read(Uint8Array, at._RNK),
      bri: read(Uint8Array, at._BRI),
      z0: read(Int8Array, at._Z0),
      kk: read(Uint8Array, at._KK),
      ph: read(Uint8Array, at._PH),
    };
  };
  return { disk: swarm("disk") };
}
