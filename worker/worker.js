// Cloudflare Worker: hello-page-api
// Endpoints:
//   POST /upload   multipart: file (image), nickname (optional, max 20)
//   GET  /list     -> {items:[{key,url,nickname,ts}]}
//   GET  /img/<k>  -> binary image
//
// Bindings required (wrangler.toml):
//   [[r2_buckets]] binding = "MEMES" bucket_name = "hello-page-memes"
//   [[kv_namespaces]] binding = "RATE" id = "<your-kv-id>"   (optional, for rate limit)

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const RATE_LIMIT_SECONDS = 30; // 1 upload / 30s per IP

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
    const url = new URL(request.url);

    if (url.pathname === "/upload" && request.method === "POST") return handleUpload(request, env);
    if (url.pathname === "/list" && request.method === "GET") return handleList(env);
    if (url.pathname.startsWith("/img/") && request.method === "GET") {
      return handleImage(decodeURIComponent(url.pathname.slice(5)), env);
    }
    return json({ error: "not found" }, 404);
  },
};

async function handleUpload(request, env) {
  try {
    const ip = request.headers.get("cf-connecting-ip") || "unknown";
    if (env.RATE) {
      const last = await env.RATE.get("ip:" + ip);
      if (last) return json({ error: "你的速度太快啦，30 秒后再试" }, 429);
      await env.RATE.put("ip:" + ip, "1", { expirationTtl: RATE_LIMIT_SECONDS });
    }

    const form = await request.formData();
    const file = form.get("file");
    const nicknameRaw = (form.get("nickname") || "").toString().trim();
    const nickname = nicknameRaw.slice(0, 20) || "匿名";

    if (!file || typeof file === "string") return json({ error: "未选择图片" }, 400);
    if (!ALLOWED.includes(file.type)) return json({ error: "仅支持 jpg/png/gif/webp" }, 400);
    if (file.size > MAX_BYTES) return json({ error: "图片不能超过 5MB" }, 400);

    const ext = file.type.split("/")[1].replace("jpeg", "jpg");
    const id = crypto.randomUUID().slice(0, 12);
    const key = `${Date.now()}-${id}.${ext}`;

    await env.MEMES.put(key, file.stream(), {
      httpMetadata: { contentType: file.type },
      customMetadata: { nickname, ts: String(Date.now()), ip },
    });

    return json({ ok: true, key });
  } catch (e) {
    return json({ error: "服务出错：" + (e.message || String(e)) }, 500);
  }
}

async function handleList(env) {
  const list = await env.MEMES.list({ limit: 1000 });
  const items = list.objects
    .map(o => ({
      key: o.key,
      url: "/img/" + encodeURIComponent(o.key),
      nickname: (o.customMetadata && o.customMetadata.nickname) || "匿名",
      ts: parseInt((o.customMetadata && o.customMetadata.ts) || "0", 10),
    }))
    .sort((a, b) => b.ts - a.ts);
  return json({ items });
}

async function handleImage(key, env) {
  const obj = await env.MEMES.get(key);
  if (!obj) return new Response("not found", { status: 404, headers: CORS });
  return new Response(obj.body, {
    headers: {
      ...CORS,
      "Content-Type": (obj.httpMetadata && obj.httpMetadata.contentType) || "image/jpeg",
      "Cache-Control": "public, max-age=86400",
    },
  });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" },
  });
}
