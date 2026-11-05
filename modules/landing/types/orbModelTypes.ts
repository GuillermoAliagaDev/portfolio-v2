/** Settings of one orb swarm, written by design/build_orb_model.py into the .glb (mesh extras). */
export type OrbSwarmSettings = {
  kind: "disk";
  rows: number;
  cols: number;
  rIn: number;
  rOut: number;
  twist: number;
  flare: number;
  loopSeconds: number;
  bob: number;
  densityInner: number;
  densityOuter: number;
  brightInner: number;
  brightOuter: number;
  hotEdge: number;
  arms: number;
  armContrast: number;
  armSharpness: number;
  doppler: number;
  glow: number;
};

/** Per-orb data, one entry per orb (quantised exactly as stored in the file). */
export type OrbSwarm = {
  count: number;
  settings: OrbSwarmSettings;
  x0: Uint16Array;
  th0: Uint16Array;
  rad: Uint8Array;
  rnk: Uint8Array;
  bri: Uint8Array;
  z0: Int8Array;
  kk: Uint8Array;
  ph: Uint8Array;
};

export type OrbModel = { disk: OrbSwarm };
