# elyfn v2 – 轻量级自托管 JS/TS 函数托管服务

重构后的 **elyfn** 面向「**开发者独占上传与调试权限、公网用户仅调用执行接口**」的自托管场景，移除了冗余的 `vm` 沙箱与手写远程模块缓存，新增读写权限分离、Worker 并发/内存硬上限、4 级自动降级 TypeScript 编译、零停机原子热更新，并完整支持 **Docker**、**常规 Linux/macOS/Windows** 与 **Android Termux** 三种部署方式。

## 核心特性

- **读写权限分离**：`ELYFN_ADMIN_KEY` 保护上传、删除、列表与源码下载；`ELYFN_EXEC_KEY` 独立控制 `POST` 执行接口（留空允许公开调用，`ADMIN_KEY` 通用）。
- **并发与资源保护**：内置 Worker 最大并发限制（默认 `8`，超限返回 `429`）、单 Worker 老生代内存上限（默认 `64MB`）、超时强杀（默认 `5000ms`，返回 `504`）和请求体大小拦截（超限返回 `413`）。
- **免重启原子热更新**：上传时先写入函数同目录 `.tmp-*` 临时文件（不依赖 `/tmp`），Worker 跑完内置 `testCases` 通过后通过 `fs.rename` 原子覆盖生效。
- **4 级 TS 编译降级链**：上传 `.ts` 时按 `esbuild (npm)` → `系统 esbuild CLI (Termux pkg)` → `esbuild-wasm` → `Node.js 内置 stripTypeScriptTypes` 依次自动降级，`esbuild` 设为可选依赖，不卡死安装。
- **内置 `.env` 读取**：`config.js` 零依赖自动读取同目录 `.env`，任意平台直接执行 `npm start` 或 `node index.js` 即可，不依赖 shell 脚本。

## 方式一：Docker 部署（推荐，带容器级隔离）

```bash
cp .env.example .env
# 编辑 .env，将 ELYFN_ADMIN_KEY 改为强密码
mkdir -p functions
docker compose up -d --build
```

- 默认开启**非 root 运行、只读根文件系统、禁用 Linux Capabilities、512MB 内存与 1 核 CPU 上限**，函数目录挂载在 `./functions`。
- 默认仅映射 `127.0.0.1:3000:3000` 供本机 Nginx/Caddy 反代；如需直连可改为 `"3000:3000"`。

## 方式二：非 Docker 部署（Linux / macOS / Windows，Node.js ≥18）

### 直接启动

```bash
cp .env.example .env
# 编辑 .env，设置 ELYFN_ADMIN_KEY
npm install --omit=dev
npm start
```

### Linux 服务器后台常驻（systemd）

1. 将项目部署到 `/opt/elyfn`，执行 `npm install --omit=dev` 并配置 `/opt/elyfn/.env`。
2. 确保函数目录归属运行用户：`sudo mkdir -p /opt/elyfn/functions && sudo chown -R www-data:www-data /opt/elyfn/functions`。
3. 注册并启动服务：
   ```bash
   sudo cp deploy/elyfn.service /etc/systemd/system/elyfn.service
   sudo systemctl daemon-reload
   sudo systemctl enable --now elyfn
   sudo systemctl status elyfn
   ```

## 方式三：Android Termux 部署

1. **安装基础环境**（建议从 F-Droid 或 GitHub Releases 安装 Termux）：
   ```bash
   pkg update && pkg upgrade
   pkg install nodejs-lts esbuild tmux
   ```
   > `esbuild` 在 `package.json` 中为可选依赖；即使 npm 版在部分 ARM 机型跳过安装，程序也会自动调用通过 `pkg install esbuild` 安装的系统二进制（或回退到 `esbuild-wasm` / Node 原生类型擦除）。
2. **安装依赖并配置低内存参数**：
   ```bash
   cp .env.example .env
   nano .env
   ```
   建议在 Termux 的 `.env` 中将并发与单 Worker 内存调低，避免触发 Android 后台杀进程：
   ```ini
   ELYFN_ADMIN_KEY=your-strong-secret
   ELYFN_MAX_CONCURRENCY=2
   ELYFN_MAX_WORKER_MEM_MB=32
   ```
   然后安装依赖：
   ```bash
   npm install --omit=dev
   ```
3. **防休眠并后台启动**（不依赖 `./run.sh` 的 shebang）：
   ```bash
   termux-wake-lock
   tmux new -s elyfn
   npm start
   # 按 Ctrl+B 再按 D 切回后台
   ```

## 使用示例

### 1. 上传函数（需 `ADMIN_KEY`，支持 `.js` 与 `.ts`）

```bash
curl -X PUT \
  -H "Authorization: Bearer your-strong-secret" \
  -F "file=@examples/square.js" \
  http://127.0.0.1:3000/math/square.js

curl -X PUT \
  -H "Authorization: Bearer your-strong-secret" \
  -F "file=@examples/greet.ts" \
  http://127.0.0.1:3000/demo/greet.ts
```

### 2. 调用函数（公开或携带 `EXEC_KEY`）

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{"x": 5}' \
  http://127.0.0.1:3000/math/square

curl -X POST \
  -H "Content-Type: application/json" \
  -d '{"name": "Alice"}' \
  http://127.0.0.1:3000/demo/greet
```

### 3. 管理与下载（需 `ADMIN_KEY`）

```bash
curl -H "Authorization: Bearer your-strong-secret" http://127.0.0.1:3000/manage/list
curl -H "Authorization: Bearer your-strong-secret" -O http://127.0.0.1:3000/demo/greet.ts
curl -X DELETE -H "Authorization: Bearer your-strong-secret" http://127.0.0.1:3000/manage/demo/greet
```

## 环境变量配置（`.env`）

| 变量名 | 默认值 | 说明 |
| :--- | :--- | :--- |
| `ELYFN_PORT` | `3000` | 监听端口 |
| `ELYFN_HOST` | `0.0.0.0` | 监听地址 |
| `ELYFN_ADMIN_KEY` | `change-me-admin-secret` | 写/管理权限密钥（生产必填） |
| `ELYFN_EXEC_KEY` | 空（公开调用） | 执行接口密钥 |
| `ELYFN_MAX_CONCURRENCY` | `8` | Worker 最大并发数（超限返回 429） |
| `ELYFN_MAX_WORKER_MEM_MB` | `64` | 单个 Worker 老生代内存上限（MB） |
| `ELYFN_TIMEOUT_MS` | `5000` | 单次执行超时时间（毫秒） |
| `ELYFN_MAX_FILE_SIZE` | `2097152` (2MB) | 上传文件大小上限（字节） |
| `ELYFN_MAX_BODY_SIZE` | `1048576` (1MB) | POST 请求体大小上限（字节） |
