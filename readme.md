```txt
my-app/
├── index.js          # 入口
├── server.js         # HTTP 服务器 + 适配器
├── app.js            # 路由注册
├── config.js         # 配置（端口、主机、测试超时）
├── adapter.js        # Node.js ↔ Web 标准转换
├── handlers/
│   ├── upload.js     # PUT 处理：上传并验证函数文件
│   ├── download.js   # GET 处理：下载函数文件
│   └── execute.js    # POST 处理：执行函数
└── functions/        # 存放用户上传的函数（自动创建）
```