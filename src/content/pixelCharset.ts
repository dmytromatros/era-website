/**
 * The characters the arcade's pixel font draws (E3, world/arcade/pixelFont.ts). The content
 * schema accepts only these in the arcade's screen texts, so a text in content/site.yaml can never
 * show up as gaps on the screen; a test checks every one of them has a glyph.
 */
export const PIXEL_CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,!?:'%/()+#-*=<>"

const escaped = PIXEL_CHARSET.replace(/[\\\]\-^]/g, '\\$&')
export const PIXEL_TEXT = new RegExp(`^[${escaped}]+$`)
