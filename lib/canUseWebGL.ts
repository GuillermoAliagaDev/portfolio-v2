export function canUseWebGL() {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl");
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    return !!gl;
  } catch {
    return false;
  }
}
