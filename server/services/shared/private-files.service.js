const { Readable } = require("node:stream");
const axios = require("axios");
const cloudinary = require("cloudinary").v2;
const { buildEmployeeDocumentDownloadUrl } = require("../employees/employee-documents.service");

function uploadPrivateFile(buffer, folder, publicId, format) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream({
      folder, public_id: `${publicId}.${format}`, resource_type: "raw",
      type: "authenticated", overwrite: false,
    }, (error, result) => {
      if (error || !result?.public_id) return reject(error || new Error("Missing asset reference"));
      resolve({ public_id: result.public_id, resource_type: "raw", delivery_type: "authenticated", format });
    });
    stream.once("error", reject);
    Readable.from(buffer).pipe(stream);
  });
}

async function readPrivateFile(file, responseType = "arraybuffer") {
  const url = buildEmployeeDocumentDownloadUrl(file, cloudinary);
  const response = await axios.get(url, { responseType, timeout: 15000 });
  return response.data;
}

async function removePrivateFile(file) {
  if (!file?.public_id) return true;
  try {
    const { result } = await cloudinary.uploader.destroy(file.public_id, { resource_type: "raw", type: "authenticated", invalidate: true });
    if (result === "ok" || result === "not found") return true;
    console.error("[commercial-files] deletion not confirmed");
    return false;
  } catch (error) {
    console.error("[commercial-files] cleanup failed", error?.http_code || error?.code || "unavailable");
    return false;
  }
}

module.exports = { uploadPrivateFile, readPrivateFile, removePrivateFile };
