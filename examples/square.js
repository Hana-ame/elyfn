// examples/square.js
const testCases = [
  { input: { x: 2 }, expected: { result: 4 } },
  { input: { x: -3 }, expected: { result: 9 } },
  { input: {}, expected: { result: 0 } },
];

async function main(obj) {
  const x = Number(obj?.x ?? 0);
  return { result: x * x };
}

module.exports = { main, testCases };
