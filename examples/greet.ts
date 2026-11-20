// examples/greet.ts
// TypeScript 函数示例：上传时由 esbuild / esbuild-cli / esbuild-wasm 编译为 CJS 并执行 testCases
// 注意：若仅依赖第 4 级 Node 原生 stripTypeScriptTypes 兜底，请改用 `module.exports = { main, testCases }`

interface GreetInput {
  name?: string;
}

interface GreetOutput {
  message: string;
}

export const testCases: Array<{ input: GreetInput; expected: GreetOutput }> = [
  { input: { name: 'elyfn' }, expected: { message: 'Hello, elyfn!' } },
  { input: {}, expected: { message: 'Hello, world!' } },
];

export async function main(input: GreetInput): Promise<GreetOutput> {
  const who = input?.name?.trim() || 'world';
  return { message: `Hello, ${who}!` };
}
