import type { AsciiSource } from "./asciiTypes";

/** Same value for everything that runs in one display frame (unlike performance.now(), which moves on while a layer works). */
export const frameStamp = () => (typeof document !== "undefined" ? (document.timeline.currentTime as number | null) : null) ?? performance.now();

/**
 * Shrinks a source (video or canvas) to w x h with object-fit: cover and reads its pixels back. Reading pixels from a
 * GPU canvas stalls the GPU, so layers that look at the same picture share one sampler: the first layer to ask in a
 * frame pays for the readback, the others get the same pixels.
 */
export function createPixelSampler() {
  // made on the first read, so creating a sampler is safe during server rendering too
  let canvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D;
  let at = -1;
  let key = "";
  let data: Uint8ClampedArray | null = null;

  return {
    /** RGBA pixels of the source scaled to w x h, or null while the source is not ready */
    read(source: AsciiSource | null, w: number, h: number): Uint8ClampedArray | null {
      if (!source) return null;
      const isVideo = source instanceof HTMLVideoElement;
      const sw = isVideo ? source.videoWidth : source.width;
      const sh = isVideo ? source.videoHeight : source.height;
      if (sw <= 0 || sh <= 0) return null;
      const now = frameStamp();
      const k = `${w}x${h}`;
      if (data && k === key && now === at) return data;
      if (!canvas) {
        canvas = document.createElement("canvas");
        ctx = canvas.getContext("2d", { willReadFrequently: true })!;
      }
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, w, h);
      const aspect = w / h;
      const srcAspect = sw / sh;
      const cw = srcAspect > aspect ? sh * aspect : sw;
      const ch = srcAspect > aspect ? sh : sw / aspect;
      ctx.drawImage(source, (sw - cw) / 2, (sh - ch) / 2, cw, ch, 0, 0, w, h);
      data = ctx.getImageData(0, 0, w, h).data;
      at = now;
      key = k;
      return data;
    },
  };
}

export type PixelSampler = ReturnType<typeof createPixelSampler>;
