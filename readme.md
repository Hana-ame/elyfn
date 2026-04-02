# elyfn – Lightweight JavaScript Function Hosting

**elyfn** is a minimal, self-contained server that lets you upload, test, and execute JavaScript functions via HTTP. Each function lives in its own `.js` file, must include its own test cases, and is validated before storage. Perfect for teaching, prototyping, or as a lightweight FaaS (Function as a Service) platform.

---

## ✨ Features

- **One function per file** – simple and predictable.
- **Test‑driven upload** – every uploaded file is executed in a sandbox; it’s only saved if all its own test cases pass.
- **HTTP API** – upload (`PUT`), download (`GET`), and execute (`POST`) functions over HTTP.
- **Isolated execution** – uses Node.js `vm` module with timeout protection.
- **Runs anywhere** – works on Node.js ≥18 (including Termux, Raspberry Pi, etc.).
- **Zero dependencies** – only uses Node.js core plus Elysia (a tiny web framework).

---

## 📦 Installation

```bash
git clone https://github.com/yourusername/elyfn.git
cd elyfn
npm install elysia
```

---

## 🚀 Usage

### 1. Start the server

```bash
node index.js
```

The server listens on `http://0.0.0.0:3000` by default. You can change the port and host in `config.js`.

### 2. Write a function file

Create a `.js` file (e.g., `square.js`) that exports two things:

- `testCases` – an array of objects with `input` and `expected`.
- `main` – a function that receives an object and returns an object.

**Example `square.js`**:
```javascript
const testCases = [
  { input: { x: 2 }, expected: { result: 4 } },
  { input: { x: 3 }, expected: { result: 9 } }
];

function main(obj) {
  return { result: obj.x * obj.x };
}
```

### 3. Upload the function

```bash
curl -X PUT -F "file=@square.js" http://localhost:3000/functions/square.js
```

If all test cases pass, the file is saved under `./functions/square.js`.

### 4. Execute the function

```bash
curl -X POST -H "Content-Type: application/json" -d '{"x":5}' http://localhost:3000/functions/square.js
```

Response: `{"result":25}`

### 5. Download the source

```bash
curl -O http://localhost:3000/functions/square.js
```

---

## 📡 API Endpoints

| Method | Endpoint                  | Description                                   |
|--------|---------------------------|-----------------------------------------------|
| PUT    | `/:folder/:filename.js`   | Upload a function file (must pass tests).     |
| GET    | `/:folder/:filename.js`   | Download the source code of a function.       |
| POST   | `/:folder/:filename.js`   | Execute the function with a JSON request body.|

- `folder` must be a single‑level directory (no `/` or `..`).
- `filename` must end with `.js`.
- For `PUT`, the file must contain a `testCases` array and a `main` function.
- For `POST`, the request body is passed as the single argument to `main`.

---

## ⚙️ Configuration

Edit `config.js` to adjust:

```javascript
module.exports = {
  PORT: 3000,                     // port to listen on
  HOST: '0.0.0.0',               // listen on all interfaces
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10 MB
  EXECUTION_TIMEOUT_MS: 30000,    // 30 seconds
  BASE_DIR: process.cwd(),        // root directory for functions
};
```

---

## 🛡️ Security

- All user code runs inside Node.js `vm` with a timeout, **no access to filesystem or network**.
- Paths are sanitised to prevent directory traversal (e.g., `../`).
- File uploads are limited in size.
- The server is not designed for high‑traffic production use without additional hardening (rate limiting, authentication, etc.).

---

## 📁 Project Structure

```
elyfn/
├── index.js            # entry point
├── server.js           # starts the HTTP server
├── app.js              # Elysia route definitions
├── adapter.js          # converts Node.js requests to Web standard
├── config.js           # configuration
├── handlers/
│   ├── upload.js       # PUT logic + test validation
│   ├── download.js     # GET logic
│   └── execute.js      # POST logic
├── utils/
│   ├── deepEqual.js    # deep equality for test comparison
│   ├── extractFromCode.js # extracts main & testCases from code
│   └── runTests.js     # runs test cases against main
└── functions/          # uploaded functions (created automatically)
```

---

## 🧪 Example Walkthrough

1. **Save the function** locally as `double.js`:
   ```javascript
   const testCases = [
     { input: { n: 2 }, expected: { value: 4 } },
     { input: { n: 3 }, expected: { value: 6 } } // this will fail!
   ];
   function main(obj) {
     return { value: obj.n * 2 };
   }
   ```
2. **Upload**:
   ```bash
   curl -X PUT -F "file=@double.js" http://localhost:3000/math/double.js
   ```
   Upload fails because the second test case expects 6 but gets 4.
3. **Fix the test** (change expected to 6), upload again → success.
4. **Execute**:
   ```bash
   curl -X POST -H "Content-Type: application/json" -d '{"n":10}' http://localhost:3000/math/double.js
   ```
   Returns `{"value":20}`.

---

## 📄 License

MIT

---

## 🙌 Contributing

Issues and pull requests are welcome. Keep it simple and lightweight.