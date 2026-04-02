# elyfn – 轻量级 JavaScript 函数托管服务

**elyfn** 是一个极简的、自包含的服务器，让你可以通过 HTTP 上传、测试和执行 JavaScript 函数。每个函数独立存放在一个 `.js` 文件中，必须自带测试用例，上传前会自动验证。适用于教学、原型开发或作为轻量级 FaaS（函数即服务）平台。

---

## ✨ 特性

- **一个文件一个函数** – 简单、清晰。
- **测试驱动上传** – 上传的 JS 文件会在沙箱中执行，只有所有自带测试用例通过才会保存。
- **HTTP API** – 通过 `PUT`（上传）、`GET`（下载）和 `POST`（执行）操作函数。
- **隔离执行** – 使用 Node.js 的 `vm` 模块，并带有超时保护。
- **随处运行** – 支持 Node.js ≥18（包括 Termux、树莓派等）。
- **依赖极少** – 仅需 Node.js 核心模块 + Elysia（一个小巧的 Web 框架）。

---

## 📦 安装

```bash
git clone https://github.com/yourusername/elyfn.git
cd elyfn
npm install elysia
```

---

## 🚀 使用

### 1. 启动服务

```bash
node index.js
```

默认监听 `http://0.0.0.0:3000`，可在 `config.js` 中修改端口和主机。

### 2. 编写函数文件

创建一个 `.js` 文件（例如 `square.js`），文件中必须包含：

- `testCases` 数组：每个元素包含 `input` 和 `expected` 字段。
- `main` 函数：接收一个对象，返回一个对象。

**示例 `square.js`**：
```javascript
const testCases = [
  { input: { x: 2 }, expected: { result: 4 } },
  { input: { x: 3 }, expected: { result: 9 } }
];

function main(obj) {
  return { result: obj.x * obj.x };
}
```

### 3. 上传函数

```bash
curl -X PUT -F "file=@square.js" http://localhost:3000/functions/square.js
```

如果所有测试用例通过，文件会被保存到 `./functions/square.js`。

### 4. 执行函数

```bash
curl -X POST -H "Content-Type: application/json" -d '{"x":5}' http://localhost:3000/functions/square.js
```

响应：`{"result":25}`

### 5. 下载源码

```bash
curl -O http://localhost:3000/functions/square.js
```

---

## 📡 API 端点

| 方法 | 端点                       | 描述                       |
|------|----------------------------|----------------------------|
| PUT  | `/:folder/:filename.js`    | 上传函数文件（必须通过测试） |
| GET  | `/:folder/:filename.js`    | 下载函数源码               |
| POST | `/:folder/:filename.js`    | 执行函数（请求体作为参数）  |

- `folder` 必须是单层目录（不能包含 `/` 或 `..`）。
- `filename` 必须以 `.js` 结尾。
- `PUT` 时，文件必须包含 `testCases` 数组和 `main` 函数。
- `POST` 时，请求体（JSON）会作为 `main` 的唯一参数传入。

---

## ⚙️ 配置

编辑 `config.js` 调整以下选项：

```javascript
module.exports = {
  PORT: 3000,                     // 监听端口
  HOST: '0.0.0.0',               // 监听所有网络接口
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 最大文件大小 10MB
  EXECUTION_TIMEOUT_MS: 30000,    // 执行超时 30 秒
  BASE_DIR: process.cwd(),        // 函数文件存储根目录
};
```

---

## 🛡️ 安全说明

- 所有用户代码在 Node.js `vm` 沙箱中执行，**无法访问文件系统或网络**。
- 路径经过净化，防止目录遍历（例如 `../`）。
- 上传文件大小受限。
- 本项目未针对高流量生产环境做额外加固（如限流、认证等），如需生产使用请自行添加。

---

## 📁 项目结构

```
elyfn/
├── index.js            # 入口
├── server.js           # 启动 HTTP 服务器
├── app.js              # 路由定义
├── adapter.js          # Node.js ↔ Web 标准请求适配
├── config.js           # 配置
├── handlers/
│   ├── upload.js       # PUT 上传 + 测试验证
│   ├── download.js     # GET 下载
│   └── execute.js      # POST 执行
├── utils/
│   ├── deepEqual.js    # 深度比较
│   ├── extractFromCode.js # 提取 main 和 testCases
│   └── runTests.js     # 运行测试用例
└── functions/          # 上传的函数存放目录（自动创建）
```

---

## 🧪 完整示例

1. **本地创建 `double.js`**：
   ```javascript
   const testCases = [
     { input: { n: 2 }, expected: { value: 4 } },
     { input: { n: 3 }, expected: { value: 6 } } // 这个用例会失败
   ];
   function main(obj) {
     return { value: obj.n * 2 };
   }
   ```
2. **上传**：
   ```bash
   curl -X PUT -F "file=@double.js" http://localhost:3000/math/double.js
   ```
   上传失败，因为第二个测试用例期望 6 但实际得到 4。
3. **修正测试**（将期望值改为 6），再次上传 → 成功。
4. **执行**：
   ```bash
   curl -X POST -H "Content-Type: application/json" -d '{"n":10}' http://localhost:3000/math/double.js
   ```
   返回 `{"value":20}`。

---

## 📄 许可证

MIT

---

## 🙌 贡献

欢迎提交 Issue 和 Pull Request。请保持项目简单轻量。