import type { WebGLRenderer } from "three";

export type WebglGpuSupport = Readonly<{
  isSupported: boolean;
  isWebGL2: boolean;
  hasFloatRenderTarget: boolean;
  hasVertexTextures: boolean;
}>;

export const getWebglGpuSupport = (
  renderer: WebGLRenderer,
): WebglGpuSupport => {
  const gl = renderer.getContext();
  const isWebGL2 = renderer.capabilities.isWebGL2;
  const hasFloatRenderTarget = isWebGL2
    ? Boolean(gl.getExtension("EXT_color_buffer_float"))
    : Boolean(gl.getExtension("WEBGL_color_buffer_float"));
  const hasVertexTextures = Boolean(renderer.capabilities.vertexTextures);

  return {
    isSupported: isWebGL2 && hasFloatRenderTarget && hasVertexTextures,
    isWebGL2,
    hasFloatRenderTarget,
    hasVertexTextures,
  };
};
