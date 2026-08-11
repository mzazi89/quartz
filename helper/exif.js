// ─────────────────────────────────────────────────────────────────────────
// Sticker EXIF helpers — converted to CommonJS to match the rest of the
// project (was written with ESM import/export, which crashes under
// `require()` since package.json has no "type": "module").
//
// Uses ffmpeg for image/video → webp conversion and node-webpmux to stamp
// sticker-pack EXIF metadata, avoiding the unmaintained `stickers-formatter`
// package that was imported but never added correctly.
// ─────────────────────────────────────────────────────────────────────────
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const ffmpeg = require("fluent-ffmpeg");

function randomFileName(ext = "webp") {
  return path.join(os.tmpdir(), `${crypto.randomBytes(6).toString("hex")}.${ext}`);
}

function convertToWebp(inputPath, isVideo) {
  return new Promise((resolve, reject) => {
    const tmpOut = randomFileName();
    const command = ffmpeg(inputPath).outputOptions([
      "-vcodec", "libwebp",
      "-vf", "scale=512:512:force_original_aspect_ratio=decrease,fps=15,pad=512:512:-1:-1:color=white@0.0",
      "-loop", "0",
      "-preset", "default",
      "-an",
      "-vsync", "0",
    ]);
    if (!isVideo) command.outputOptions(["-frames:v", "1"]);

    command
      .toFormat("webp")
      .on("error", reject)
      .on("end", () => resolve(tmpOut))
      .save(tmpOut);
  });
}

async function bufferToWebp(buffer, isVideo) {
  const tmpIn = randomFileName(isVideo ? "mp4" : "png");
  fs.writeFileSync(tmpIn, buffer);
  try {
    const tmpOut = await convertToWebp(tmpIn, isVideo);
    return tmpOut;
  } finally {
    fs.unlinkSync(tmpIn);
  }
}

async function stampExif(webpPath, metadata = {}) {
  try {
    const { Image } = require("node-webpmux");
    const img = new Image();
    await img.load(webpPath);

    const json = {
      "sticker-pack-id": crypto.randomUUID(),
      "sticker-pack-name": metadata.packname || "",
      "sticker-pack-publisher": metadata.author || "",
      emojis: metadata.categories && metadata.categories.length ? metadata.categories : ["🤖"],
    };

    const exifAttr = Buffer.from([
      0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57,
      0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00,
    ]);
    const jsonBuffer = Buffer.from(JSON.stringify(json), "utf8");
    exifAttr.writeUIntLE(jsonBuffer.length, 14, 4);
    img.exif = Buffer.concat([exifAttr, jsonBuffer]);

    await img.save(webpPath);
  } catch (err) {
    // node-webpmux missing / EXIF write failed — ship the sticker without
    // pack metadata rather than failing the whole command.
  }
  return webpPath;
}

async function imageToWebp(media) {
  return fs.readFileSync(await bufferToWebp(media, false));
}

async function videoToWebp(media) {
  return fs.readFileSync(await bufferToWebp(media, true));
}

async function writeExifImg(media, metadata) {
  const webpPath = await bufferToWebp(media, false);
  return stampExif(webpPath, metadata);
}

async function writeExifVid(media, metadata) {
  const webpPath = await bufferToWebp(media, true);
  return stampExif(webpPath, metadata);
}

async function writeExif(media, metadata) {
  const isVideo = /video/.test(media?.mimetype || "");
  const input = media?.data || media;
  if (!input) return null;
  return isVideo ? writeExifVid(input, metadata) : writeExifImg(input, metadata);
}

module.exports = { imageToWebp, videoToWebp, writeExifImg, writeExifVid, writeExif };
