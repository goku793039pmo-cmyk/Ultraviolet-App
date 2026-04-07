"use strict";
const form = document.getElementById("uv-form");
const address = document.getElementById("uv-address");
const searchEngine = document.getElementById("uv-search-engine");
const error = document.getElementById("uv-error");
const errorCode = document.getElementById("uv-error-code");
const connection = new BareMux.BareMuxConnection("/baremux/worker.js");
form.addEventListener("submit", async (event) => {
    event.preventDefault();
    try { await registerSW(); } catch (err) {
        error.textContent = "Failed to register service worker.";
        errorCode.textContent = err.toString();
        throw err;
    }
    const url = search(address.value, searchEngine.value);
    const frame = document.getElementById("uv-frame");
    const toolbar = document.getElementById("toolbar");
    const home = document.getElementById("home");
    frame.style.display = "block";
    toolbar.style.display = "flex";
    home.style.display = "none";
    document.getElementById("tb-address").value = address.value;
    let wispUrl = (location.protocol === "https:" ? "wss" : "ws") + "://" + location.host + "/wisp/";
    if ((await connection.getTransport()) !== "/epoxy/index.mjs") {
        await connection.setTransport("/epoxy/index.mjs", [{ wisp: wispUrl }]);
    }
    frame.src = __uv$config.prefix + __uv$config.encodeUrl(url);
});
