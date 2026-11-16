package com.plumbnote.plumbcheck;

import java.net.URI;
import java.net.URL;

/** Native enforcement, independent of the renderer's URL validation. */
final class OllamaAddress {
    static URL validate(String value, boolean allowHttp) throws Exception {
        URI uri = new URI(value);
        String scheme = uri.getScheme(), host = uri.getHost();
        if (host == null || uri.getUserInfo() != null || uri.getRawQuery() != null || uri.getRawFragment() != null || (uri.getPath() != null && !uri.getPath().isEmpty() && !uri.getPath().equals("/"))) throw new IllegalArgumentException("Enter a server address without credentials or an API path.");
        if (!"https".equals(scheme) && !"http".equals(scheme)) throw new IllegalArgumentException("Use HTTP or HTTPS.");
        if ("http".equals(scheme)) {
            if (!allowHttp) throw new IllegalArgumentException("Authorize unencrypted access on a trusted local network first.");
            String[] parts = host.split("\\.");
            if (parts.length != 4) throw new IllegalArgumentException("HTTP requires a private IPv4 address.");
            int[] ip = new int[4];
            for (int i = 0; i < 4; i++) { if (!parts[i].matches("[0-9]{1,3}")) throw new IllegalArgumentException("Invalid IPv4 address."); ip[i] = Integer.parseInt(parts[i]); if (ip[i] > 255) throw new IllegalArgumentException("Invalid IPv4 address."); }
            if (!(ip[0] == 10 || ip[0] == 127 || (ip[0] == 172 && ip[1] >= 16 && ip[1] <= 31) || (ip[0] == 192 && ip[1] == 168))) throw new IllegalArgumentException("Use HTTPS for servers outside private IPv4 networks.");
        }
        if (uri.getPort() == 0 || uri.getPort() > 65535) throw new IllegalArgumentException("Invalid server port.");
        return new URL(scheme, host, uri.getPort(), "");
    }
    static boolean sameServer(URL base, URL request) { return base.getProtocol().equals(request.getProtocol()) && base.getHost().equalsIgnoreCase(request.getHost()) && effectivePort(base) == effectivePort(request); }
    private static int effectivePort(URL url) { return url.getPort() < 0 ? url.getDefaultPort() : url.getPort(); }
}
