package com.theIT.spacefighter4;

import android.content.ClipData;
import android.content.Intent;
import android.net.Uri;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

/**
 * Debug-only, user-initiated QA JSON share. No network, app-data uploads,
 * wallet, Firestore, trusted replay, or reward settlement. Not registered in
 * release builds. The source snapshot is always untrusted evidence.
 */
@CapacitorPlugin(name = "SpaceFighterQaTraceExport")
public class SpaceFighterQaTraceExportPlugin extends Plugin {
    private static final int MAX_JSON_BYTES = 4 * 1024 * 1024;
    private static final String EXPECTED_VERSION = "c15-dungeon-apk-trace-v2c11";
    private static final String NAME_REGEX = "^dungeon_taurus_v2c11_[0-9]{8}_[0-9]{6}\\.json$";

    @PluginMethod
    public void shareJson(PluginCall call) {
        if (!BuildConfig.DEBUG) {
            call.reject("QA_ONLY_DEBUG_APK");
            return;
        }
        try {
            String name = call.getString("fileName");
            String json = call.getString("json");
            if (name == null || !name.matches(NAME_REGEX) || json == null) {
                call.reject("INVALID_QA_FILENAME_OR_JSON");
                return;
            }
            byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
            if (bytes.length == 0 || bytes.length > MAX_JSON_BYTES) {
                call.reject("QA_TRACE_FILE_TOO_LARGE_OR_EMPTY");
                return;
            }
            JSONObject payload = new JSONObject(json);
            if (!EXPECTED_VERSION.equals(payload.optString("version"))
                    || !"qa-babylon-observer-untrusted".equals(payload.optString("source"))
                    || !"dung_taurus".equals(payload.optString("dungeonId"))
                    || !"taurus_entry".equals(payload.optString("roomId"))
                    || payload.optBoolean("safeForSettlement", true)
                    || payload.optBoolean("rewardSettlementEnabled", true)
                    || payload.optBoolean("cloudRewards", true)
                    || payload.optBoolean("liveApkParityVerified", true)
                    || payload.optJSONArray("frames") == null) {
                call.reject("NON_QA_OR_UNSAFE_TRACE");
                return;
            }
            File dir = new File(getContext().getCacheDir(), "dungeon-qa-evidence");
            if ((!dir.isDirectory() && !dir.mkdirs()) || !dir.isDirectory()) {
                call.reject("QA_CACHE_DIRECTORY_UNAVAILABLE");
                return;
            }
            File file = new File(dir, name);
            try (FileOutputStream out = new FileOutputStream(file, false)) {
                out.write(bytes);
                out.getFD().sync();
            }
            Uri uri = FileProvider.getUriForFile(
                getContext(), getContext().getPackageName() + ".fileprovider", file);
            Intent intent = new Intent(Intent.ACTION_SEND);
            intent.setType("application/json");
            intent.putExtra(Intent.EXTRA_STREAM, uri);
            intent.setClipData(ClipData.newRawUri("Dungeon QA trace JSON", uri));
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            Intent chooser = Intent.createChooser(intent, "Chia sẻ Dungeon QA JSON");
            chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getActivity().runOnUiThread(() -> {
                try {
                    getActivity().startActivity(chooser);
                    JSObject result = new JSObject();
                    result.put("status", "chooser_opened");
                    result.put("fileName", name);
                    result.put("byteCount", bytes.length);
                    call.resolve(result);
                } catch (Exception error) {
                    call.reject("QA_SHARE_CHOOSER_FAILED", error);
                }
            });
        } catch (Exception error) {
            call.reject("QA_JSON_EXPORT_FAILED", error);
        }
    }
}
