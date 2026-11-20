// examples/hash.js
const crypto = require("crypto");

const testCases = [
  {
    input: { text: "elyfn", algo: "sha256" },
    expected: {
      algo: "sha256",
      digest: "831041e7bd5d6b553503c264e4b9be67674cfae9bd82bdc36cfd983a7ebf5ee2",
    },
  },
  {
    input: { text: "" },
    expected: { error: "text is required" },
  },
];

async function main(input) {
  const text = input?.text;
  if (!text) return { error: "text is required" };

  const algo = input?.algo || "sha256";
  const digest = crypto.createHash(algo).update(String(text)).digest("hex");
  return { algo, digest };
}

module.exports = { main, testCases };
