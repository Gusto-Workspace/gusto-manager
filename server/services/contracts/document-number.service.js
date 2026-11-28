const { randomBytes } = require("node:crypto");

function getDocNumber(type, attempt = 0) {
  const prefix = { QUOTE: "D", INVOICE: "F", CONTRACT: "C" }[type] || "X";
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  const day = [now.getFullYear(), pad(now.getMonth() + 1), pad(now.getDate())].join("-");
  const time = [now.getHours(), now.getMinutes(), now.getSeconds()].map(pad).join("");
  return `WD-${prefix}-${day}-${time}${attempt ? `-${randomBytes(4).toString("hex")}` : ""}`;
}

module.exports = { getDocNumber };
