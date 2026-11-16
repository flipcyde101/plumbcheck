package com.plumbnote.plumbcheck;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Build;
import android.graphics.Color;
import android.graphics.Insets;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.webkit.*;
import android.widget.FrameLayout;
import android.widget.Toast;
import java.io.*;
import java.nio.charset.StandardCharsets;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import java.security.KeyStore;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import org.json.JSONObject;

/** Offline app: fixed bundled origin, no remote navigation or file privileges. */
public final class MainActivity extends Activity {
    private WebView web;
    private ValueCallback<Uri[]> chooser;
    private String pendingExport;
    private OllamaBridge ollama;
    private static final String ORIGIN = "https://appassets.androidplatform.net";

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        FrameLayout content = new FrameLayout(this);
        content.setBackgroundColor(Color.rgb(244, 241, 233));
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        // Android 15+ enforces edge-to-edge for our target SDK. Keep the WebView
        // inside the safe area, including cutouts and the on-screen keyboard.
        if (Build.VERSION.SDK_INT >= 35) content.setOnApplyWindowInsetsListener((view, insets) -> {
            Insets safe = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
            view.setPadding(safe.left, safe.top, safe.right, safe.bottom);
            return WindowInsets.CONSUMED;
        });
        web = new WebView(this);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true); s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false); s.setAllowContentAccess(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setSupportMultipleWindows(false); s.setJavaScriptCanOpenWindowsAutomatically(false);
        web.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                String file = url.equals(ORIGIN + "/index.html") ? "index.html" : url.equals(ORIGIN + "/app.js") ? "app.js" : url.equals(ORIGIN + "/LICENSE.txt") ? "LICENSE.txt" : url.equals(ORIGIN + "/THIRD_PARTY_NOTICES.txt") ? "THIRD_PARTY_NOTICES.txt" : null;
                try {
                    if (file != null) return new WebResourceResponse(file.endsWith(".js") ? "application/javascript" : file.endsWith(".txt") ? "text/plain" : "text/html", "UTF-8", getAssets().open(file));
                } catch (IOException ignored) { }
                if (!request.isForMainFrame() && "https".equals(request.getUrl().getScheme()) && !"appassets.androidplatform.net".equals(request.getUrl().getHost())) return null;
                return new WebResourceResponse("text/plain", "UTF-8", new ByteArrayInputStream(new byte[0]));
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) { return true; }
            @Override public void onReceivedSslError(WebView view, android.webkit.SslErrorHandler handler, android.net.http.SslError error) { handler.cancel(); }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public void onPermissionRequest(PermissionRequest request) { request.deny(); }
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (chooser != null) chooser.onReceiveValue(null);
                chooser = callback;
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT).setType("application/json").addCategory(Intent.CATEGORY_OPENABLE);
                try { startActivityForResult(intent, 100); } catch (Exception e) { chooser.onReceiveValue(null); chooser = null; }
                return true;
            }
        });
        web.addJavascriptInterface(new ExportBridge(), "AndroidApp");
        ollama = new OllamaBridge(web);
        web.addJavascriptInterface(ollama, "OllamaNative");
        content.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(content); content.requestApplyInsets(); web.loadUrl(ORIGIN + "/index.html");
    }
    private final class ExportBridge {
        private SecretKey credentialKey() throws Exception {
            KeyStore store = KeyStore.getInstance("AndroidKeyStore"); store.load(null);
            if (!store.containsAlias("plumbcheck-sync")) {
                KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
                generator.init(new KeyGenParameterSpec.Builder("plumbcheck-sync", KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build()); generator.generateKey();
            }
            return ((KeyStore.SecretKeyEntry) store.getEntry("plumbcheck-sync", null)).getSecretKey();
        }
        @JavascriptInterface public synchronized boolean saveSyncSettings(String json) {
            try {
                if (json == null || json.length() > 4000) return false;
                JSONObject input = new JSONObject(json);
                if (!"https".equals(Uri.parse(input.getString("url")).getScheme()) || !input.getString("token").matches("[a-f0-9]{64}")) return false;
                Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE, credentialKey());
                String value = Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP) + ":" + Base64.encodeToString(cipher.doFinal(json.getBytes(StandardCharsets.UTF_8)), Base64.NO_WRAP);
                return getSharedPreferences("plumbcheck-private", MODE_PRIVATE).edit().putString("sync", value).commit();
            } catch (Exception e) { return false; }
        }
        @JavascriptInterface public synchronized String getSyncSettings() {
            try {
                String value = getSharedPreferences("plumbcheck-private", MODE_PRIVATE).getString("sync", null); if (value == null) return "null";
                String[] parts = value.split(":", 2); Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
                cipher.init(Cipher.DECRYPT_MODE, credentialKey(), new GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)));
                return new String(cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)), StandardCharsets.UTF_8);
            } catch (Exception e) { return "null"; }
        }
        @JavascriptInterface public void exportJson(String filename, String json) {
            if (json == null || json.getBytes(StandardCharsets.UTF_8).length > 2_000_000) return;
            if (!"plumbcheck-contract.json".equals(filename) && !"plumbcheck-report.json".equals(filename)) return;
            runOnUiThread(() -> {
                if (pendingExport != null || web.getUrl() == null || !web.getUrl().equals(ORIGIN + "/index.html")) return;
                pendingExport = json;
                Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT).setType("application/json").addCategory(Intent.CATEGORY_OPENABLE).putExtra(Intent.EXTRA_TITLE, filename);
                try { startActivityForResult(intent, 101); } catch (Exception e) { pendingExport = null; }
            });
        }
    }
    @Override protected void onActivityResult(int code, int result, Intent data) {
        super.onActivityResult(code, result, data);
        if (code == 100 && chooser != null) { chooser.onReceiveValue(result == RESULT_OK && data != null && data.getData() != null ? new Uri[] { data.getData() } : null); chooser = null; }
        if (code == 101 && pendingExport != null) {
            final String value = pendingExport; pendingExport = null;
            if (result == RESULT_OK && data != null && data.getData() != null) {
                final Uri destination = data.getData();
                new Thread(() -> { try (OutputStream out = getContentResolver().openOutputStream(destination, "wt")) { if (out == null) throw new IOException(); out.write(value.getBytes(StandardCharsets.UTF_8)); runOnUiThread(() -> Toast.makeText(this, "JSON saved", Toast.LENGTH_SHORT).show()); } catch (Exception e) { runOnUiThread(() -> Toast.makeText(this, "Could not save JSON", Toast.LENGTH_LONG).show()); } }).start();
            }
        }
    }
    @Override protected void onStop() { if (web != null) web.evaluateJavascript("window.dispatchEvent(new Event('plumbcheck:model-interrupted'));", null); if (ollama != null) ollama.interrupt(); super.onStop(); }
    @Override protected void onDestroy() { if (chooser != null) chooser.onReceiveValue(null); if (ollama != null) ollama.close(); if (web != null) { web.removeJavascriptInterface("OllamaNative"); web.removeJavascriptInterface("AndroidApp"); web.destroy(); } super.onDestroy(); }
}
