# elyfn v2 – 轻量级自托管 JS/TS 函数托管服务

重构后的 **elyfn** 面向「**开发者独占上传与调试权限、公网用户仅调用执行接口**」的自托管场景，移除了冗余的 `vm` 沙箱与手写远程模块缓存，新增读写权限分离、独立并发/内存上限、4 级自动降级 TypeScript 编译、串行化原子热更新、优雅停机，并支持 **Docker**、**常规 Linux/macOS/Windows** 与 **Android Termux** 三种部署方式。

## 核心特性

- **读写权限分离**：`ELYFN_ADMIN_KEY` 保护上传、删除、列表与源码下载；`ELYFN_EXEC_KEY` 独立控制 `POST` 执行接口（留空允许公开调用，`ADMIN_KEY` 通用）。
- **双池并发与资源保护**：公网执行（`MAX_CONCURRENCY`，默认 `8`）与管理员测试（`MAX_TEST_CONCURRENCY`，默认 `2`）使用独立并发池，避免公网打满饿死管理员上传；仅在 Worker 真正退出后才释放配额，并具备 V8 内存上限（`64MB`）、超时强杀（`504`）与请求体大小拦截（`413`）。
- **串行化原子热更新与优雅停机**：按函数名加锁防止并发上传/删除竞态；先写同目录 `.tmp-*` 临时文件并跑完 `testCases`（内置 `util.isDeepStrictEqual`）再原子 `rename` 生效；支持 `SIGTERM`/`SIGINT` 优雅停机并在启停时自动清理残留临时文件。
- **4 级 TS 编译降级链**：按 `esbuild (npm)` → `系统 esbuild CLI (Termux pkg)` → `esbuild-wasm` → `Node.js 内置 stripTypeScriptTypes` 自动降级（注：第 4 级仅擦除类型不转译 ESM，需使用 `module.exports`）。
- **基于 `__dirname` 的零依赖 `.env` 读取**：从任意工作目录启动 `node /opt/elyfn/index.js` 都能正确定位 `.env` 与 `functions` 目录。

## 方式一：Docker 部署（推荐，带容器级隔离）

```bash
cp .env.example .env
# 编辑 .env，将 ELYFN_ADMIN_KEY 改为强密码
docker compose up -d --build
```

- 默认使用命名卷 `elyfn_functions` 挂载 `/app/functions`，自动继承镜像内 `node`（UID 1000）权限，避免宿主机 UID 不一致导致的 `EACCES` 权限错误。如需改为宿主机目录挂载，请先执行 `mkdir -p functions && chown 1000:1000 functions` 再修改 `docker-compose.yml`。
- 默认开启**非 root 运行、只读根文件系统、禁用 Linux Capabilities、512MB 内存、1 核 CPU 上限**与 `10s` 优雅停机宽限期，且仅映射 `127.0.0.1:3000:3000` 供本机 Nginx/Caddy 反代。

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
| `ELYFN_MAX_CONCURRENCY` | `8` | 公网执行 Worker 最大并发数（超限返回 429） |
| `ELYFN_MAX_TEST_CONCURRENCY` | `2` | 管理员上传测试 Worker 最大并发数（与公网隔离） |
| `ELYFN_MAX_WORKER_MEM_MB` | `64` | 单个 Worker 老生代内存上限（MB） |
| `ELYFN_TIMEOUT_MS` | `5000` | 单次执行超时时间（毫秒） |
| `ELYFN_MAX_FILE_SIZE` | `2097152` (2MB) | 上传文件大小上限（字节） |
| `ELYFN_MAX_BODY_SIZE` | `1048576` (1MB) | POST 请求体大小上限（字节） |
