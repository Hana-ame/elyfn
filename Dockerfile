FROM node:20-alpine

WORKDIR /app

# 先拷贝依赖清单以充分利用构建缓存
COPY package.json ./
RUN npm install --omit=dev && npm cache clean --force

# 拷贝应用源码
COPY index.js server.js app.js adapter.js config.js ./
COPY handlers ./handlers
COPY utils ./utils
COPY examples ./examples

# 创建函数持久化目录并交由内置非 root 用户 node 拥有
RUN mkdir -p /app/functions && chown -R node:node /app

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "index.js"]
