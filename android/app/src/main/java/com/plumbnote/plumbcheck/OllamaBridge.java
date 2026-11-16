package com.plumbnote.plumbcheck;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.NetworkCapabilities;
import android.os.Build;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.*;
import org.json.JSONObject;

/** Fixed endpoint, bounded native networking for the bundled Android UI. */
final class OllamaBridge {
    private final WebView web;
    private final ExecutorService executor = Executors.newFixedThreadPool(2);
    private final ConcurrentHashMap<String, Request> requests = new ConcurrentHashMap<>();
    private volatile URL server;
    private volatile boolean closed;
    private static final class Request { volatile boolean cancelled; volatile HttpURLConnection connection; }
    OllamaBridge(WebView web) { this.web = web; }
    @JavascriptInterface public synchronized String configure(String address, boolean allowHttp) {
        try {
            if (!requests.isEmpty()) throw new IllegalArgumentException("Finish or cancel the current request before changing servers.");
            server = OllamaAddress.validate(address, allowHttp);
            return new JSONObject().put("ok", true).put("server", server.toString()).toString();
        } catch (Exception e) { return "{\"ok\":false,\"error\":\"Use HTTPS, or explicitly authorize a private IPv4 HTTP server without an API path.\"}"; }
    }
    @JavascriptInterface public String diagnostics() {
        try {
            ConnectivityManager manager = (ConnectivityManager)web.getContext().getSystemService(Context.CONNECTIVITY_SERVICE);
            NetworkCapabilities network = manager.getNetworkCapabilities(manager.getActiveNetwork());
            String type = network == null ? "No active network" : network.hasTransport(NetworkCapabilities.TRANSPORT_VPN) ? "VPN" : network.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) ? "Wi-Fi" : network.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) ? "Ethernet" : "Mobile/other";
            return new JSONObject().put("android", Build.VERSION.RELEASE).put("targetSdk", web.getContext().getApplicationInfo().targetSdkVersion).put("network", type).put("permission", "Local networking is implicit for this app's target SDK 36. Browser permissions are separate.").toString();
        } catch (Exception e) { return "{\"network\":\"Unavailable\"}"; }
    }
    @JavascriptInterface public synchronized void requestOllama(String id, String address, String method, String body) {
        if (id == null || !id.matches("[a-f0-9-]{36}")) return;
        if (closed || requests.size() >= 2 || requests.containsKey(id)) { send(id, 0, "", "", "Wait for the current request or reopen the app."); return; }
        final URL destination;
        try {
            URL base = server;
            destination = new URI(address).toURL();
            boolean endpoint = ("GET".equals(method) && "/api/tags".equals(destination.getPath())) || ("POST".equals(method) && "/v1/chat/completions".equals(destination.getPath()));
            if (base == null || !OllamaAddress.sameServer(base, destination) || !endpoint || destination.getUserInfo() != null || destination.getQuery() != null || destination.getRef() != null || body == null || body.getBytes(StandardCharsets.UTF_8).length > 1000000) throw new IllegalArgumentException();
        } catch (Exception e) { send(id, 0, "", "", "Authorize the Ollama server first. Only model discovery and chat completions are allowed."); return; }
        Request request = new Request(); requests.put(id, request);
        executor.execute(() -> {
            try {
                if (request.cancelled) throw new InterruptedIOException();
                HttpURLConnection connection = (HttpURLConnection)destination.openConnection(); request.connection = connection;
                connection.setInstanceFollowRedirects(false); connection.setConnectTimeout(8000); connection.setReadTimeout(180000); connection.setRequestMethod(method);
                connection.setRequestProperty("Accept", "application/json");
                if (request.cancelled) throw new InterruptedIOException();
                if ("POST".equals(method)) { connection.setDoOutput(true); connection.setRequestProperty("Content-Type", "application/json"); byte[] bytes = body.getBytes(StandardCharsets.UTF_8); connection.setFixedLengthStreamingMode(bytes.length); try (OutputStream output = connection.getOutputStream()) { output.write(bytes); } }
                int status = connection.getResponseCode();
                if (status < 200 || status > 599) throw new IOException();
                InputStream source = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
                ByteArrayOutputStream bytes = new ByteArrayOutputStream();
                if (source != null) try (InputStream input = source) { byte[] chunk = new byte[8192]; int read; while ((read = input.read(chunk)) != -1) { if (request.cancelled) throw new InterruptedIOException(); if (bytes.size() + read > 2000000) throw new IOException("RESPONSE_TOO_LARGE"); bytes.write(chunk, 0, read); } }
                if (request.cancelled) throw new InterruptedIOException();
                send(id, status, bytes.toString("UTF-8"), connection.getContentType(), null);
            } catch (Exception e) {
                String reason = request.cancelled ? "Connection cancelled." : e instanceof SocketTimeoutException ? "Ollama timed out. Check the address, server availability, and model size." : e instanceof javax.net.ssl.SSLException ? "The HTTPS certificate could not be verified. Use a trusted certificate." : "Could not reach Ollama. Check the same Wi-Fi, server LAN binding, Windows firewall, and Android local-network permissions.";
                send(id, 0, "", "", reason);
            } finally { if (request.connection != null) request.connection.disconnect(); requests.remove(id, request); }
        });
    }
    @JavascriptInterface public void cancelOllama(String id) { Request request = requests.get(id); if (request != null) { request.cancelled = true; if (request.connection != null) request.connection.disconnect(); } }
    void interrupt() { for (String id : requests.keySet()) cancelOllama(id); }
    void close() { closed = true; interrupt(); executor.shutdownNow(); }
    private void send(String id, int status, String body, String type, String error) {
        if (closed) return;
        try {
            String result = new JSONObject().put("id", id).put("status", status).put("body", body).put("contentType", type == null ? "application/json" : type).put("error", error == null ? JSONObject.NULL : error).toString();
            web.post(() -> { if (!closed) web.evaluateJavascript("window.__plumbcheckModelResponse && window.__plumbcheckModelResponse(" + result + ");", null); });
        } catch (Exception ignored) { }
    }
}
