/** Uploads the disk texture baked from Blender (public/textures/bh-particles.png, see design/build_particle_disk.py). */
export const DISK_TEXTURE = "/textures/bh-particles.png";

export function loadDiskTexture(gl: WebGLRenderingContext, onLoad: () => void, onError: () => void) {
  const img = new Image();
  img.decoding = "async";
  img.onload = () => {
    const tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); // image bottom row = inner edge = v 0
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE); // the channels are data, not colours
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
    // non-power-of-two and cell data: no wrapping or filtering (the shader wraps the column itself)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    onLoad();
  };
  img.onerror = onError;
  img.src = DISK_TEXTURE;
}
