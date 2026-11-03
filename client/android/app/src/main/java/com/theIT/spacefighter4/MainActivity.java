package com.theIT.spacefighter4;

import android.os.Bundle;
import android.os.Build;
import android.view.Display;
import android.view.WindowManager;
import androidx.activity.EdgeToEdge;

// 👇 1. IMPORT THÊM 3 THƯ VIỆN NÀY ĐỂ ĐIỀU KHIỂN HỆ THỐNG GIAO DIỆN ANDROID
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;
import android.content.Intent;
import android.util.Log;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginHandle;
import ee.forgr.capacitor.social.login.GoogleProvider;
import ee.forgr.capacitor.social.login.ModifiedMainActivityForSocialLoginPlugin;
import ee.forgr.capacitor.social.login.SocialLoginPlugin;

public class MainActivity extends BridgeActivity implements ModifiedMainActivityForSocialLoginPlugin {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SpaceFighterAssetStorePlugin.class);
        super.onCreate(savedInstanceState);
        EdgeToEdge.enable(this);
        applyGameDisplayPolicy();

        // 👇 2. CƠ CHẾ ẨN THANH ĐIỀU HƯỚNG & TRẠNG THÁI (IMMERSIVE MODE)
        WindowInsetsControllerCompat windowInsetsController =
                WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());

        if (windowInsetsController != null) {
            // Cài đặt hành vi: Vuốt mép để hiện tạm thời (sẽ tự động ẩn lại sau vài giây)
            windowInsetsController.setSystemBarsBehavior(
                    WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            );
            // Ra lệnh ẨN toàn bộ các thanh hệ thống (systemBars = Navigation Bar + Status Bar)
            windowInsetsController.hide(WindowInsetsCompat.Type.systemBars());
        }
    }

    private Display resolveGameDisplay() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            return getDisplay();
        }
        return getWindowManager().getDefaultDisplay();
    }

    private float selectGameRefreshRate() {
        Display display = resolveGameDisplay();
        if (display == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            return 60.0f;
        }
        Display.Mode current = display.getMode();
        Display.Mode best = null;
        for (Display.Mode candidate : display.getSupportedModes()) {
            boolean sameResolution = candidate.getPhysicalWidth() == current.getPhysicalWidth()
                    && candidate.getPhysicalHeight() == current.getPhysicalHeight();
            boolean supportedGameRate = candidate.getRefreshRate() >= 59.0f
                    && candidate.getRefreshRate() <= 144.5f;
            if (sameResolution && supportedGameRate
                    && (best == null || candidate.getRefreshRate() > best.getRefreshRate())) {
                best = candidate;
            }
        }
        return best == null ? current.getRefreshRate() : best.getRefreshRate();
    }

    private void applyGameDisplayPolicy() {
        WindowManager.LayoutParams attributes = getWindow().getAttributes();
        float targetRefreshRate = selectGameRefreshRate();
        attributes.preferredRefreshRate = targetRefreshRate;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            attributes.preferMinimalPostProcessing = true;
        }
        if (Build.VERSION.SDK_INT >= 35) {
            attributes.setFrameRateBoostOnTouchEnabled(true);
        }
        getWindow().setAttributes(attributes);
        Log.i("SpaceFighterDisplay", "Requested game refresh rate: " + targetRefreshRate + "Hz");
    }

    @Override
    public void onResume() {
        super.onResume();
        applyGameDisplayPolicy();
    }

    @Override
    public void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode >= GoogleProvider.REQUEST_AUTHORIZE_GOOGLE_MIN
                && requestCode < GoogleProvider.REQUEST_AUTHORIZE_GOOGLE_MAX) {
            PluginHandle handle = getBridge().getPlugin("SocialLogin");
            if (handle == null) {
                Log.w("SocialLogin", "Google activity result received without plugin handle");
                return;
            }
            Plugin plugin = handle.getInstance();
            if (!(plugin instanceof SocialLoginPlugin)) {
                Log.w("SocialLogin", "Google activity result received for wrong plugin type");
                return;
            }
            ((SocialLoginPlugin) plugin).handleGoogleLoginIntent(requestCode, data);
        }
    }

    @Override
    public void IHaveModifiedTheMainActivityForTheUseWithSocialLoginPlugin() {
        // Marker required by the SocialLogin Android plugin.
    }
}
