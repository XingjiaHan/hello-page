# 表情包后端部署 (Cloudflare Workers + R2)

整个流程 ~10 分钟，全部免费。

## 1. 注册 + 安装

1. 去 https://dash.cloudflare.com/sign-up 注册账号（免费）
2. 装 wrangler:
   ```bash
   npm install -g wrangler
   wrangler login
   ```

## 2. 建 R2 bucket（存图片）

R2 免费额度：10GB 存储 / 1000万次读 / 100万次写每月。

```bash
wrangler r2 bucket create hello-page-memes
```

如果第一次用 R2，dashboard 会让你绑张卡（不会扣，超额才计费）。
不想绑卡可以跳过 R2，把代码改成用 KV 直接存 base64（容量小，仅适合少量）。

## 3.（可选）建 KV 做限流

不做也行，做的话能防垃圾投稿。

```bash
wrangler kv:namespace create RATE
```

会输出一个 id，例如：
```
id = "abc123def456..."
```

把这个 id 填到 `wrangler.toml` 里 `[[kv_namespaces]]` 那段，并取消注释。

## 4. 部署

在这个 worker 目录下：

```bash
cd worker
wrangler deploy
```

输出最后一行会显示 worker URL，例如：
```
https://hello-page-api.xxxxx.workers.dev
```

## 5. 接进前端

打开 `gallery.html`，找到这行：
```js
const API_BASE = "";
```

改成上面的 URL：
```js
const API_BASE = "https://hello-page-api.xxxxx.workers.dev";
```

提交 + push 后 GitHub Pages 自动部署。

## 后续运维

- **看图 / 删图**: Cloudflare dashboard → R2 → `hello-page-memes` bucket
- **改限流时间**: 编辑 `worker.js` 的 `RATE_LIMIT_SECONDS`，重新 `wrangler deploy`
- **看实时日志**: `wrangler tail`
- **改限制**（图片大小、类型）: `worker.js` 顶部 `MAX_BYTES` / `ALLOWED`

## 删图（命令行）

```bash
wrangler r2 object delete hello-page-memes/<key>
```

key 可以从 `/list` 接口返回值里拿到。
