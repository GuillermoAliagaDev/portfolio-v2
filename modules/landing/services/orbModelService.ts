/** Downloads the black hole orb model (public/models/black-hole-orbs.glb). Returns the raw bytes; the mapper decodes them. */
export const ORB_MODEL_URL = "/models/black-hole-orbs.glb";

export async function fetchOrbModel(signal?: AbortSignal): Promise<ArrayBuffer> {
  const response = await fetch(ORB_MODEL_URL, { signal });
  if (!response.ok) throw new Error(`Orb model: ${response.status}`);
  return response.arrayBuffer();
}
