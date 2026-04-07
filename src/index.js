import { join } from "node:path";
import { hostname } from "node:os";
import { createServer } from "node:http";
import express from "express";
import wisp from "wisp-server-node";
import { uvPath } from "@titaniumnetwork-dev/ultraviolet";
import { epoxyPath } from "@mercuryworkshop/epoxy-transport";
import { baremuxPath } from "@mercuryworkshop/bare-mux/node";
import rateLimit from "express-rate-limit";
import helmet from "helmet";

const BROWSE_PORT = 8080;
const GAME_PORT = 1080;
const PASSWORD = "herencia2024";

const app = express();

app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: false,
}));

const browseLimit = rateLimit({ windowMs: 60000, max: 200 });
const gameLimit = rateLimit({ windowMs: 60000, max: 500 });

app.use((req, res, next) => {
    const cookieHeader = req.headers.cookie || "";
    req.cookies = {};
    cookieHeader.split(";").forEach(c => {
        const [k, v] = c.trim().split("=");
        if (k) req.cookies[k.trim()] = v?.trim();
    });
    next();
});

function authCheck(req, res, next) {
    // dynamic password check
    const token = req.cookies?.auth || req.query?.auth;
    if (token === PASSWORD) return next();
    if (req.path === "/login" || req.path.startsWith("/baremux") || req.path.startsWith("/uv") || req.path.startsWith("/epoxy")) return next();
    res.redirect("/login?redirect=" + encodeURIComponent(req.url));
}

app.get("/login", (req, res) => {
    const redirect = req.query.redirect || "/";
    res.send(`<!doctype html><html><head><title>Login</title><meta name="viewport" content="width=device-width, initial-scale=1"><style>*{box-sizing:border-box;margin:0;padding:0}body{background:#0a0a0f;display:flex;align-items:center;justify-content:center;min-height:100vh;font-family:sans-serif}.box{background:#141420;border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:40px;width:320px}h2{color:#fff;margin-bottom:24px;font-size:1.3rem}input{width:100%;background:#0a0a0f;border:1px solid rgba(255,255,255,0.1);border-radius:8px;color:#fff;padding:10px 14px;font-size:14px;outline:none;margin-bottom:16px}input:focus{border-color:#7864ff}button{width:100%;background:#7864ff;color:#fff;border:none;border-radius:8px;padding:11px;font-size:14px;font-weight:600;cursor:pointer}.err{color:#ff6666;font-size:13px;margin-top:12px}</style></head><body><div class="box"><h2>🌐 Browse</h2><form method="POST" action="/login"><input type="hidden" name="redirect" value="${redirect}"/><input type="password" name="password" placeholder="Enter password" autofocus/><button type="submit">Enter</button>${req.query.err ? '<p class="err">Wrong password</p>' : ''}</form></div></body></html>`);
});

app.post("/login", express.urlencoded({ extended: false }), (req, res) => {
    const { password, redirect } = req.body;
    if (password === PASSWORD) {
        res.setHeader("Set-Cookie", `auth=${PASSWORD}; Path=/; HttpOnly; Max-Age=86400`);
        res.redirect(redirect || "/");
    } else {
        res.redirect("/login?err=1&redirect=" + encodeURIComponent(redirect || "/"));
    }
});

app.get("/proxy/download", authCheck, async (req, res) => {
    const url = req.query.url;
    if (!url) return res.status(400).send("No URL provided");
    try {
        const fetch = (await import("node-fetch")).default;
        const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
        const filename = url.split("/").pop().split("?")[0] || "download";
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        res.setHeader("Content-Type", response.headers.get("content-type") || "application/octet-stream");
        response.body.pipe(res);
    } catch(e) {
        res.status(500).send("Download failed: " + e.message);
    }
});
let CURRENT_PASSWORD = "herencia2024";

app.get("/settings", authCheck, (req, res) => {
    res.sendFile("public/settings.html", { root: "." });
});

app.post("/settings/password", authCheck, express.json(), (req, res) => {
    const { old, new: nw } = req.body;
    if (old !== CURRENT_PASSWORD) return res.json({ ok: false, error: "Wrong current password" });
    if (!nw || nw.length < 4) return res.json({ ok: false, error: "New password too short" });
    CURRENT_PASSWORD = nw;
    res.json({ ok: true });
});

app.use(authCheck);
app.use(express.static("./public"));
app.use("/uv/", express.static(uvPath));
app.use("/epoxy/", express.static(epoxyPath));
app.use("/baremux/", express.static(baremuxPath));

app.use((req, res) => {
    res.status(404).sendFile("./public/404.html", { root: "." });
});

function makeServer(port, limiter) {
    const server = createServer();
    server.on("request", (req, res) => {
        res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
        res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
        limiter(req, res, () => app(req, res));
    });
    server.on("upgrade", (req, socket, head) => {
        if (req.url.endsWith("/wisp/")) { wisp.routeRequest(req, socket, head); return; }
        socket.end();
    });
    server.listen({ port }, () => {
        console.log(`Listening on http://localhost:${port} (${port === GAME_PORT ? "GAMING" : "BROWSING"})`);
    });
    return server;
}

const browseServer = makeServer(BROWSE_PORT, browseLimit);
const gameServer = makeServer(GAME_PORT, gameLimit);

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
function shutdown() {
    console.log("Shutting down...");
    browseServer.close();
    gameServer.close();
    process.exit(0);
}
