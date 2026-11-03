package com.theIT.spacefighter4;

import android.net.Uri;
import android.os.SystemClock;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InterruptedIOException;
import java.io.RandomAccessFile;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.Locale;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * App-private immutable asset payload store used by RC7 remote asset delivery.
 *
 * The JavaScript layer owns manifests, active revisions and rollback metadata.
 * This plugin only downloads visual/audio payload bytes into app-private storage,
 * verifies declared size + SHA-256 and exposes a Capacitor file URL. It never
 * handles gameplay authority, credentials, rewards or player data.
 */
@CapacitorPlugin(name = "SpaceFighterAssetStore")
public class SpaceFighterAssetStorePlugin extends Plugin {
    private static final Pattern SAFE_PATH = Pattern.compile("^[A-Za-z0-9][A-Za-z0-9._/-]{1,239}$");
    private static final Pattern SHA256 = Pattern.compile("^[a-fA-F0-9]{64}$");
    private static final Pattern CONTENT_RANGE = Pattern.compile("^bytes (\\d+)-(\\d+)/(\\d+)$");
    private static final long MAX_FILE_BYTES = 2_000_000_000L;
    private static final int CONNECT_TIMEOUT_MS = 20_000;
    private static final int READ_TIMEOUT_MS = 30_000;
    private static final int BUFFER_BYTES = 64 * 1024;
    private static final long PROGRESS_BYTES = 256 * 1024;
    private static final long PROGRESS_MS = 200;

    private final ExecutorService executor = Executors.newFixedThreadPool(2);
    private final ConcurrentHashMap<String, AtomicBoolean> cancellations = new ConcurrentHashMap<>();

    private File assetRoot() throws IOException {
        File root = new File(getContext().getFilesDir(), "spacefighter-assets");
        if ((!root.exists() && !root.mkdirs()) || !root.isDirectory()) {
            throw new IOException("Cannot create app-private asset directory");
        }
        return root;
    }

    private String requirePath(PluginCall call) {
        String relative = call.getString("path");
        if (relative == null || !SAFE_PATH.matcher(relative).matches()
                || relative.startsWith("/") || relative.contains("..")
                || relative.contains("//") || relative.contains("\\")) {
            throw new IllegalArgumentException("Invalid asset relative path");
        }
        return relative;
    }

    private File resolveFile(String relative) throws IOException {
        File root = assetRoot();
        File target = new File(root, relative).getCanonicalFile();
        String rootPath = root.getCanonicalPath() + File.separator;
        if (!target.getPath().startsWith(rootPath)) {
            throw new IllegalArgumentException("Asset path escapes app-private storage");
        }
        return target;
    }

    private static long requireExpectedBytes(PluginCall call) {
        // Capacitor JSON numbers may arrive as Integer, Long or Double.
        // PluginCall.getLong() is not reliable for small JSON integer values.
        Object raw = call.getData().opt("expectedBytes");
        if (!(raw instanceof Number)) {
            throw new IllegalArgumentException("Invalid expected asset byte length");
        }
        double number = ((Number) raw).doubleValue();
        if (!Double.isFinite(number) || number < 1 || number > MAX_FILE_BYTES
                || number != Math.rint(number)) {
            throw new IllegalArgumentException("Invalid expected asset byte length");
        }
        return ((Number) raw).longValue();
    }

    private static String requireSha256(PluginCall call) {
        String value = call.getString("sha256");
        if (value == null || !SHA256.matcher(value).matches()) {
            throw new IllegalArgumentException("Invalid expected asset SHA-256");
        }
        return value.toLowerCase(Locale.ROOT);
    }

    private static String sha256(File file) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        byte[] buffer = new byte[BUFFER_BYTES];
        try (BufferedInputStream input = new BufferedInputStream(new FileInputStream(file))) {
            int read;
            while ((read = input.read(buffer)) != -1) {
                digest.update(buffer, 0, read);
            }
        }
        StringBuilder out = new StringBuilder(64);
        for (byte value : digest.digest()) {
            out.append(String.format(Locale.ROOT, "%02x", value & 0xff));
        }
        return out.toString();
    }

    private JSObject fileResult(File file, String relative, String digest) {
        JSObject result = new JSObject();
        result.put("path", relative);
        result.put("fileUri", Uri.fromFile(file).toString());
        result.put("sizeBytes", file.length());
        result.put("sha256", digest);
        return result;
    }

    private void reject(PluginCall call, String code, Throwable error) {
        String message = error.getMessage();
        call.reject(message == null || message.isBlank() ? code : message, code);
    }

    private void emitProgress(String requestId, String relative, long received, long total) {
        JSObject progress = new JSObject();
        progress.put("requestId", requestId);
        progress.put("path", relative);
        progress.put("receivedBytes", received);
        progress.put("totalBytes", total);
        progress.put("done", received == total);
        notifyListeners("downloadProgress", progress);
    }

    private static void closeQuietly(HttpURLConnection connection) {
        if (connection != null) {
            connection.disconnect();
        }
    }

    @Override
    protected void handleOnDestroy() {
        for (AtomicBoolean cancelled : cancellations.values()) {
            cancelled.set(true);
        }
        cancellations.clear();
        executor.shutdownNow();
        super.handleOnDestroy();
    }

    @PluginMethod
    public void getCapacity(PluginCall call) {
        executor.execute(() -> {
            try {
                File root = assetRoot();
                JSObject result = new JSObject();
                result.put("usableBytes", root.getUsableSpace());
                result.put("totalBytes", root.getTotalSpace());
                call.resolve(result);
            } catch (Throwable error) {
                reject(call, "ASSET_CAPACITY_FAILED", error);
            }
        });
    }

    @PluginMethod
    public void stat(PluginCall call) {
        executor.execute(() -> {
            try {
                String relative = requirePath(call);
                File file = resolveFile(relative);
                JSObject result = new JSObject();
                result.put("path", relative);
                result.put("exists", file.isFile());
                result.put("sizeBytes", file.isFile() ? file.length() : 0L);
                if (file.isFile()) {
                    result.put("fileUri", Uri.fromFile(file).toString());
                }
                call.resolve(result);
            } catch (Throwable error) {
                reject(call, "ASSET_STAT_FAILED", error);
            }
        });
    }

    @PluginMethod
    public void verify(PluginCall call) {
        executor.execute(() -> {
            try {
                String relative = requirePath(call);
                long expectedBytes = requireExpectedBytes(call);
                String expectedSha = requireSha256(call);
                File file = resolveFile(relative);
                boolean valid = file.isFile() && file.length() == expectedBytes
                        && expectedSha.equals(sha256(file));
                JSObject result = new JSObject();
                result.put("path", relative);
                result.put("valid", valid);
                result.put("sizeBytes", file.isFile() ? file.length() : 0L);
                if (valid) {
                    result.put("fileUri", Uri.fromFile(file).toString());
                    result.put("sha256", expectedSha);
                }
                call.resolve(result);
            } catch (Throwable error) {
                reject(call, "ASSET_VERIFY_FAILED", error);
            }
        });
    }

    @PluginMethod
    public void download(PluginCall call) {
        executor.execute(() -> {
            HttpURLConnection connection = null;
            String requestId = call.getString("requestId");
            try {
                if (requestId == null || !requestId.matches("^[A-Za-z0-9._:-]{8,120}$")) {
                    throw new IllegalArgumentException("Invalid asset download request ID");
                }
                AtomicBoolean cancelled = new AtomicBoolean(false);
                AtomicBoolean existing = cancellations.putIfAbsent(requestId, cancelled);
                if (existing != null) {
                    throw new IllegalArgumentException("Duplicate asset download request ID");
                }
                String urlValue = call.getString("url");
                if (urlValue == null || !urlValue.startsWith("https://")) {
                    throw new IllegalArgumentException("HTTPS asset URL required");
                }
                String relative = requirePath(call);
                long expectedBytes = requireExpectedBytes(call);
                String expectedSha = requireSha256(call);
                File finalFile = resolveFile(relative);
                File parent = finalFile.getParentFile();
                if ((!parent.exists() && !parent.mkdirs()) || !parent.isDirectory()) {
                    throw new IOException("Cannot create asset parent directory");
                }

                if (finalFile.isFile() && finalFile.length() == expectedBytes
                        && expectedSha.equals(sha256(finalFile))) {
                    emitProgress(requestId, relative, expectedBytes, expectedBytes);
                    call.resolve(fileResult(finalFile, relative, expectedSha));
                    return;
                }
                if (finalFile.exists() && !finalFile.delete()) {
                    throw new IOException("Cannot remove invalid asset payload");
                }

                File partial = new File(finalFile.getPath() + ".part");
                long start = partial.isFile() ? partial.length() : 0L;
                if (start < 0L || start > expectedBytes) {
                    if (partial.exists() && !partial.delete()) {
                        throw new IOException("Cannot reset invalid partial asset");
                    }
                    start = 0L;
                }

                connection = (HttpURLConnection) new URL(urlValue).openConnection();
                connection.setInstanceFollowRedirects(true);
                connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
                connection.setReadTimeout(READ_TIMEOUT_MS);
                connection.setRequestProperty("Accept-Encoding", "identity");
                if (start > 0L) {
                    connection.setRequestProperty("Range", "bytes=" + start + "-");
                }
                connection.connect();
                int status = connection.getResponseCode();
                if (status != HttpURLConnection.HTTP_OK && status != HttpURLConnection.HTTP_PARTIAL) {
                    throw new IOException("Asset download failed (HTTP " + status + ")");
                }
                if (start > 0L && status == HttpURLConnection.HTTP_OK) {
                    try (FileOutputStream reset = new FileOutputStream(partial, false)) {
                        reset.getChannel().truncate(0L);
                    }
                    start = 0L;
                }
                if (status == HttpURLConnection.HTTP_PARTIAL) {
                    String header = connection.getHeaderField("Content-Range");
                    Matcher matcher = header == null ? null : CONTENT_RANGE.matcher(header);
                    if (matcher == null || !matcher.matches()
                            || Long.parseLong(matcher.group(1)) != start
                            || Long.parseLong(matcher.group(3)) != expectedBytes) {
                        throw new IOException("Asset range response invalid");
                    }
                }

                long received = start;
                long lastProgressBytes = received;
                long lastProgressAt = SystemClock.elapsedRealtime();
                emitProgress(requestId, relative, received, expectedBytes);
                byte[] buffer = new byte[BUFFER_BYTES];
                try (BufferedInputStream input = new BufferedInputStream(connection.getInputStream());
                     RandomAccessFile output = new RandomAccessFile(partial, "rw")) {
                    output.seek(start);
                    int read;
                    while ((read = input.read(buffer)) != -1) {
                        if (cancelled.get()) {
                            throw new InterruptedIOException("Asset download cancelled");
                        }
                        output.write(buffer, 0, read);
                        received += read;
                        if (received > expectedBytes) {
                            throw new IOException("Asset exceeded declared size");
                        }
                        long now = SystemClock.elapsedRealtime();
                        if (received - lastProgressBytes >= PROGRESS_BYTES || now - lastProgressAt >= PROGRESS_MS) {
                            emitProgress(requestId, relative, received, expectedBytes);
                            lastProgressBytes = received;
                            lastProgressAt = now;
                        }
                    }
                    output.getFD().sync();
                }
                closeQuietly(connection);
                connection = null;

                if (received != expectedBytes || partial.length() != expectedBytes) {
                    throw new IOException("Asset download incomplete");
                }
                String actualSha = sha256(partial);
                if (!expectedSha.equals(actualSha)) {
                    if (!partial.delete()) {
                        partial.deleteOnExit();
                    }
                    throw new IOException("Asset SHA-256 mismatch");
                }
                if (finalFile.exists() && !finalFile.delete()) {
                    throw new IOException("Cannot replace asset payload");
                }
                if (!partial.renameTo(finalFile)) {
                    throw new IOException("Cannot atomically activate downloaded asset");
                }
                emitProgress(requestId, relative, expectedBytes, expectedBytes);
                call.resolve(fileResult(finalFile, relative, expectedSha));
                cancellations.remove(requestId);
            } catch (Throwable error) {
                reject(call, "ASSET_DOWNLOAD_FAILED", error);
            } finally {
                closeQuietly(connection);
                if (requestId != null) {
                    cancellations.remove(requestId);
                }
            }
        });
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        String requestId = call.getString("requestId");
        AtomicBoolean flag = requestId == null ? null : cancellations.get(requestId);
        if (flag != null) {
            flag.set(true);
        }
        JSObject result = new JSObject();
        result.put("requestId", requestId == null ? "" : requestId);
        result.put("cancelled", flag != null);
        call.resolve(result);
    }

    private static boolean deleteRecursively(File file) {
        if (file.isDirectory()) {
            File[] children = file.listFiles();
            if (children != null) {
                for (File child : children) {
                    if (!deleteRecursively(child)) return false;
                }
            }
        }
        return !file.exists() || file.delete();
    }

    @PluginMethod
    public void clear(PluginCall call) {
        executor.execute(() -> {
            try {
                if (!"downloaded-assets".equals(call.getString("scope"))) {
                    throw new IllegalArgumentException("Explicit downloaded-assets scope required");
                }
                File root = assetRoot();
                File[] children = root.listFiles();
                boolean cleared = true;
                if (children != null) {
                    for (File child : children) cleared = deleteRecursively(child) && cleared;
                }
                JSObject result = new JSObject();
                result.put("cleared", cleared);
                call.resolve(result);
            } catch (Throwable error) {
                reject(call, "ASSET_CLEAR_FAILED", error);
            }
        });
    }

    @PluginMethod
    public void remove(PluginCall call) {
        executor.execute(() -> {
            try {
                String relative = requirePath(call);
                File file = resolveFile(relative);
                File partial = new File(file.getPath() + ".part");
                boolean removed = (!file.exists() || file.delete()) && (!partial.exists() || partial.delete());
                JSObject result = new JSObject();
                result.put("path", relative);
                result.put("removed", removed);
                call.resolve(result);
            } catch (Throwable error) {
                reject(call, "ASSET_REMOVE_FAILED", error);
            }
        });
    }
}
