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
    private static final String INPUT_BUNDLE_VERSION = "c15-dungeon-apk-input-bundle-v2c14b";
    private static final String C2C_GRID_VERSION = "c15-dungeon-c2c-input-grid-v1";
    // C2JP only extends the nested GRID in Guest Taurus C2JK debug export.
    private static final String C2JP_GRID_VERSION = "c15-dungeon-c2jp-input-grid-v1";
    private static final String C2JQ_GRID_VERSION = "c15-dungeon-c2jq-room-exit-grid-v1";
    private static final String NAME_REGEX = "^dungeon_taurus_v2c11_[0-9]{8}_[0-9]{6}\\.json$";
    private static final String INPUT_NAME_REGEX = "^dungeon_taurus_v2c14b_[0-9]{8}_[0-9]{6}\\.json$";
    private static final String C2E_WITNESS_VERSION = "c15-dungeon-c2e-combat-witness-v1";
    private static final String C2E_NAME_REGEX = "^dungeon_taurus_c2e_[0-9]{8}_[0-9]{6}\\.json$";
    private static final String C2C_NAME_REGEX = "^dungeon_taurus_c2c_[0-9]{8}_[0-9]{6}\\.json$";
    private static final String C2JK_NAME_REGEX = "^dungeon_taurus_c2jk_[0-9]{8}_[0-9]{6}\\.json$";
    private static final String C2JN_NAME_REGEX = "^dungeon_taurus_c2jn_diag_[0-9]{8}_[0-9]{6}\\.json$";
    private static final String C2JN_VERSION = "c15-c2jn-qa-diagnostic-v1";
    private static final String C2JK_VERSION = "c15-c2jk-live-fixed-ballistic-journal-v1";
    private static final String C2JK_CORE_VERSION = "c15-c2jk-shared-hostile-ballistic-fixed30-v1";

    // C2B: the native plugin is only registered for BuildConfig.DEBUG in MainActivity.
    // This check is QA UX gating, not remote attestation or API authorization.
    @PluginMethod
    public void getDebugBuildGate(PluginCall call) {
        if (!BuildConfig.DEBUG) {
            call.reject("QA_ONLY_DEBUG_APK");
            return;
        }
        JSObject result = new JSObject();
        result.put("debug", true);
        result.put("c2bQaPlugin", true);
        call.resolve(result);
    }

    @PluginMethod
    public void shareJson(PluginCall call) {
        if (!BuildConfig.DEBUG) {
            call.reject("QA_ONLY_DEBUG_APK");
            return;
        }
        try {
            String name = call.getString("fileName");
            String json = call.getString("json");
            if (name == null || !(name.matches(NAME_REGEX) || name.matches(INPUT_NAME_REGEX) || name.matches(C2C_NAME_REGEX) || name.matches(C2E_NAME_REGEX) || name.matches(C2JK_NAME_REGEX) || name.matches(C2JN_NAME_REGEX)) || json == null) {
                call.reject("INVALID_QA_FILENAME_OR_JSON");
                return;
            }
            byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
            if (bytes.length == 0 || bytes.length > MAX_JSON_BYTES) {
                call.reject("QA_TRACE_FILE_TOO_LARGE_OR_EMPTY");
                return;
            }
            JSONObject payload = new JSONObject(json);
            boolean isTrace = name.matches(NAME_REGEX);
            boolean isC2C = name.matches(C2C_NAME_REGEX);
            boolean isC2E = name.matches(C2E_NAME_REGEX);
            boolean isC2JK = name.matches(C2JK_NAME_REGEX);
            boolean isC2JN = name.matches(C2JN_NAME_REGEX);
            boolean safeCommon = "dung_taurus".equals(payload.optString("dungeonId"))
                    && "taurus_entry".equals(payload.optString("roomId"))
                    && !payload.optBoolean("safeForSettlement", true)
                    && !payload.optBoolean("rewardSettlementEnabled", true)
                    && !payload.optBoolean("cloudRewards", true)
                    && !payload.optBoolean("liveApkParityVerified", !(isC2C || isC2E || isC2JK || isC2JN));
            boolean valid;
            if (isTrace) {
                valid = EXPECTED_VERSION.equals(payload.optString("version"))
                        && "qa-babylon-observer-untrusted".equals(payload.optString("source"))
                        && payload.optJSONArray("frames") != null;
            } else if (isC2C) {
                valid = C2C_GRID_VERSION.equals(payload.optString("version"))
                        && "accepted-controller-plus-babylon-observer-untrusted".equals(payload.optString("source"))
                        && payload.optBoolean("qaOnly", false)
                        && "30".equals(payload.optString("tickHz"))
                        && "accumulated-babylon-delta-not-fixed-combat-simulation".equals(payload.optString("tickBasis"))
                        && !payload.optBoolean("fixedTickSimulationVerified", true)
                        && !payload.optBoolean("independentCombatReplayVerified", true)
                        && "fnv1a32-accidental-corruption-only".equals(payload.optString("checksumAlgorithm"))
                        && payload.optJSONArray("pointerEvents") != null
                        && payload.optJSONArray("ticks") != null;
            } else if (isC2E) {
                JSONObject grid = payload.optJSONObject("grid");
                valid = C2E_WITNESS_VERSION.equals(payload.optString("version"))
                        && "real-babylon-causal-events-untrusted".equals(payload.optString("source"))
                        && payload.optBoolean("qaOnly", false)
                        && !payload.optBoolean("fixedTickSimulationVerified", true)
                        && !payload.optBoolean("fullCombatReplayVerified", true)
                        && "fnv1a32-accidental-corruption-only".equals(payload.optString("checksumAlgorithm"))
                        && payload.optJSONArray("events") != null
                        && grid != null
                        && C2C_GRID_VERSION.equals(grid.optString("version"))
                        && !grid.optBoolean("safeForSettlement", true)
                        && !grid.optBoolean("rewardSettlementEnabled", true)
                        && !grid.optBoolean("cloudRewards", true)
                        && grid.optJSONArray("pointerEvents") != null
                        && grid.optJSONArray("ticks") != null;
            } else if (isC2JN) {
                // A diagnostic is exportable even when a normal replay was
                // rejected. It can NEVER be mistaken for a settlement receipt.
                valid = C2JN_VERSION.equals(payload.optString("version"))
                        && "guest-taurus-export-blocker-untrusted".equals(payload.optString("source"))
                        && payload.optBoolean("qaOnly", false)
                        && payload.optBoolean("diagnosticOnly", false)
                        && !payload.optBoolean("recordValid", true)
                        && !payload.optBoolean("fullCombatReplayVerified", true)
                        && "NOT_VERIFIED".equals(payload.optString("trueApkServerParity"))
                        && !payload.optBoolean("liveApkParityVerified", true)
                        && payload.optString("reasonCode").matches("[A-Za-z0-9_:-]{1,96}")
                        && payload.optJSONObject("status") != null;
            } else if (isC2JK) {
                JSONObject grid = payload.optJSONObject("grid");
                valid = C2JK_VERSION.equals(payload.optString("version"))
                        && C2JK_CORE_VERSION.equals(payload.optString("coreVersion"))
                        && "live-taurus-fixed30-hostile-projectiles-untrusted".equals(payload.optString("source"))
                        && payload.optBoolean("qaOnly", false)
                        && payload.isNull("battleId")
                        && "local-client-seed".equals(payload.optString("seedSource"))
                        && "30".equals(payload.optString("tickHz"))
                        && "client-fixed-ballistics-not-full-combat".equals(payload.optString("tickBasis"))
                        && payload.isNull("captureError")
                        && payload.optBoolean("clientFixedBallisticStepObserved", false)
                        && !payload.optBoolean("independentEnemyAiVerified", true)
                        && !payload.optBoolean("independentDamageVerified", true)
                        && !payload.optBoolean("fullCombatReplayVerified", true)
                        && "NOT_VERIFIED".equals(payload.optString("trueApkServerParity"))
                        && "fnv1a32-accidental-corruption-only".equals(payload.optString("checksumAlgorithm"))
                        && payload.optJSONArray("shots") != null
                        && payload.optJSONArray("ticks") != null
                        && grid != null
                        && (C2C_GRID_VERSION.equals(grid.optString("version")) ||
                            ((C2JP_GRID_VERSION.equals(grid.optString("version")) ||
                              C2JQ_GRID_VERSION.equals(grid.optString("version")))
                             && "accepted-controller-plus-babylon-observer-high-rate-untrusted"
                                 .equals(grid.optString("source"))
                             && grid.optJSONArray("pointerEvents") != null
                             && grid.optJSONArray("pointerEvents").length() <= 4096
                             && grid.optJSONArray("ticks") != null
                             && grid.optJSONArray("ticks").length() <= 270))
                        && grid.optJSONArray("pointerEvents") != null
                        && grid.optJSONArray("ticks") != null
                        && !grid.optBoolean("safeForSettlement", true)
                        && !grid.optBoolean("rewardSettlementEnabled", true)
                        && !grid.optBoolean("cloudRewards", true);
            } else {
                JSONObject trace = payload.optJSONObject("trace");
                JSONObject input = payload.optJSONObject("inputJournal");
                valid = INPUT_BUNDLE_VERSION.equals(payload.optString("version"))
                        && "qa-local-apk-input-bundle-untrusted".equals(payload.optString("source"))
                        && payload.optBoolean("qaOnly", false)
                        && !payload.optBoolean("serverReportLinked", true)
                        && "fnv1a32-accidental-corruption-only".equals(payload.optString("checksumAlgorithm"))
                        && trace != null && input != null
                        && EXPECTED_VERSION.equals(trace.optString("version"))
                        && "qa-babylon-observer-untrusted".equals(trace.optString("source"))
                        && !trace.optBoolean("safeForSettlement", true)
                        && !trace.optBoolean("rewardSettlementEnabled", true)
                        && !trace.optBoolean("cloudRewards", true)
                        && !trace.optBoolean("liveApkParityVerified", true)
                        && trace.optJSONArray("frames") != null
                        && "c15-dungeon-apk-accepted-input-v2c14b".equals(input.optString("version"))
                        && "accepted-ship-input-controller-untrusted".equals(input.optString("source"))
                        && !input.optBoolean("serverTicketVerified", true)
                        && !input.optBoolean("serverReadLoadoutVerified", true)
                        && !input.optBoolean("independentReplayVerified", true)
                        && !input.optBoolean("fullTickJournalVerified", true)
                        && !input.optBoolean("safeForSettlement", true)
                        && !input.optBoolean("rewardSettlementEnabled", true)
                        && !input.optBoolean("cloudRewards", true)
                        && input.optJSONArray("pointerEvents") != null
                        && input.optJSONArray("frameMarkers") != null;
            }
            if (!safeCommon || !valid) {
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
