// examples/greet.ts
// TypeScript 函数示例：上传时由 esbuild 自动编译为 CJS 并执行 testCases

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
