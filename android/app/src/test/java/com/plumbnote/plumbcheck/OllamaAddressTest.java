package com.plumbnote.plumbcheck;
import org.junit.Test;
import static org.junit.Assert.*;
import java.net.URL;
public class OllamaAddressTest {
    @Test public void privateHttpNeedsExplicitConsent() throws Exception {
        assertEquals("192.168.1.138", OllamaAddress.validate("http://192.168.1.138:11434", true).getHost());
        for (String value : new String[] { "http://8.8.8.8:11434", "http://example.com", "http://169.254.169.254", "http://192.168.1.138:0" }) {
            try { OllamaAddress.validate(value, true); fail(value); } catch (IllegalArgumentException expected) { }
        }
        try { OllamaAddress.validate("http://192.168.1.138:11434", false); fail(); } catch (IllegalArgumentException expected) { }
    }
    @Test public void credentialBearingUrlsAndCustomPathsAreRejected() throws Exception {
        for (String value : new String[] { "https://key@example.com", "https://example.com/?key=secret", "https://example.com/#token", "https://example.com/v1/chat/completions", "file:///etc/passwd" }) {
            try { OllamaAddress.validate(value, true); fail(value); } catch (IllegalArgumentException expected) { }
        }
    }
    @Test public void requestsStayOnTheAuthorizedOrigin() throws Exception {
        URL base = OllamaAddress.validate("http://192.168.1.138:11434", true);
        assertTrue(OllamaAddress.sameServer(base, new URL("http://192.168.1.138:11434/api/tags")));
        assertFalse(OllamaAddress.sameServer(base, new URL("http://192.168.1.139:11434/api/tags")));
        assertFalse(OllamaAddress.sameServer(base, new URL("http://192.168.1.138:80/api/tags")));
        assertFalse(OllamaAddress.sameServer(base, new URL("https://192.168.1.138:11434/api/tags")));
    }
}
