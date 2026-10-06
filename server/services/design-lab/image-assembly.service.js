const sharp = require("sharp");

async function assembleChapters(buffers, sizes, overlapPx = 0) {
  if (buffers.length === 1) return buffers[0];
  const width = sizes[0].width;
  const height = sizes.reduce((sum, size) => sum + size.height, 0)
    - overlapPx * (sizes.length - 1);
  let top = 0;
  const overlays = [];
  for (const [index, original] of buffers.entries()) {
    let input = original;
    if (index && overlapPx) {
      const { data, info } = await sharp(original).ensureAlpha().raw()
        .toBuffer({ resolveWithObject: true });
      for (let y = 0; y < overlapPx; y += 1) {
        const opacity = y / (overlapPx - 1);
        for (let x = 0; x < info.width; x += 1) {
          const alpha = (y * info.width + x) * info.channels + 3;
          data[alpha] = Math.round(data[alpha] * opacity);
        }
      }
      input = await sharp(data, { raw: {
        width: info.width, height: info.height, channels: info.channels,
      } }).png().toBuffer();
      top -= overlapPx;
    }
    overlays.push({ input, left: 0, top });
    top += sizes[index].height;
  }
  return sharp({ create: { width, height, channels: 4, background: "#ffffff" } })
    .composite(overlays).png().toBuffer();
}

module.exports = { assembleChapters };
