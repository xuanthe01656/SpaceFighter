package com.theIT.spacefighter4;

import android.os.Bundle;
import android.os.Build;
import android.graphics.Rect;
import android.view.Display;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebView;
import androidx.activity.EdgeToEdge;

// 👇 1. IMPORT THÊM 3 THƯ VIỆN NÀY ĐỂ ĐIỀU KHIỂN HỆ THỐNG GIAO DIỆN ANDROID
import androidx.core.view.DisplayCutoutCompat;
import androidx.core.view.ViewCompat;
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
import java.util.List;

public class MainActivity extends BridgeActivity implements ModifiedMainActivityForSocialLoginPlugin {
    private static final String BATTLE_HUD_TOP_CSS_VAR = "--sf-native-battle-hud-top";
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SpaceFighterAssetStorePlugin.class);
        super.onCreate(savedInstanceState);
        EdgeToEdge.enable(this);
        applyGameDisplayPolicy();
        applyImmersiveMode();
        installNativeBattleHudInsetBridge();
    }

    private void applyImmersiveMode() {
        // Keep the WebView edge-to-edge. Android may restore status/navigation
        // bars after resume, focus changes, keyboard/login activities or a
        // transient edge swipe, so this policy is deliberately idempotent.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        WindowInsetsControllerCompat controller =
                WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        if (controller != null) {
            controller.setSystemBarsBehavior(
                    WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            );
            controller.hide(WindowInsetsCompat.Type.systemBars());
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            getWindow().setStatusBarContrastEnforced(false);
            getWindow().setNavigationBarContrastEnforced(false);
        }
        refreshNativeBattleHudInset();
    }

    private void installNativeBattleHudInsetBridge() {
        View decor = getWindow().getDecorView();
        ViewCompat.setOnApplyWindowInsetsListener(decor, (view, insets) -> {
            publishNativeBattleHudInset(insets);
            return insets;
        });
        ViewCompat.requestApplyInsets(decor);
        decor.post(this::refreshNativeBattleHudInset);
    }

    private void refreshNativeBattleHudInset() {
        View decor = getWindow().getDecorView();
        publishNativeBattleHudInset(ViewCompat.getRootWindowInsets(decor));
    }

    private int resolveBattleHudTopInsetDevicePx(WindowInsetsCompat insets) {
        if (insets == null) return 0;
        DisplayCutoutCompat cutout = insets.getDisplayCutout();
        if (cutout == null || cutout.getSafeInsetTop() <= 0) return 0;

        View decor = getWindow().getDecorView();
        int viewportWidth = decor.getWidth();
        if (viewportWidth <= 0) viewportWidth = getResources().getDisplayMetrics().widthPixels;
        if (viewportWidth <= 0) return cutout.getSafeInsetTop();

        // The HUD has a physical centre void. A centred notch can occupy it
        // without moving the whole cluster; side cutouts still need protection.
        float centreVoidLeft = viewportWidth * 0.34f;
        float centreVoidRight = viewportWidth * 0.66f;
        List<Rect> bounds = cutout.getBoundingRects();
        if (bounds == null || bounds.isEmpty()) return cutout.getSafeInsetTop();
        for (Rect bound : bounds) {
            if (bound == null || bound.height() <= 0) continue;
            boolean insideCentreVoid = bound.left >= centreVoidLeft && bound.right <= centreVoidRight;
            if (!insideCentreVoid) return cutout.getSafeInsetTop();
        }
        return 0;
    }

    private void publishNativeBattleHudInset(WindowInsetsCompat insets) {
        float density = Math.max(1.0f, getResources().getDisplayMetrics().density);
        int devicePx = resolveBattleHudTopInsetDevicePx(insets);
        int cssPx = Math.max(0, Math.round(devicePx / density));
        if (getBridge() == null) return;
        WebView webView = getBridge().getWebView();
        if (webView == null) return;
        String script = "(function(){var px=" + cssPx
                + ";document.documentElement.style.setProperty('" + BATTLE_HUD_TOP_CSS_VAR
                + "',px+'px');window.dispatchEvent(new CustomEvent('sf-native-battle-hud-inset',"
                + "{detail:{top:px}}));})();";
        webView.post(() -> webView.evaluateJavascript(script, null));
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
        applyImmersiveMode();
        // Some OEM WebViews restore bars one frame after resume. Re-assert once
        // after the window is attached without blocking startup.
        getWindow().getDecorView().postDelayed(() -> {
            applyImmersiveMode();
            refreshNativeBattleHudInset();
        }, 250);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            applyImmersiveMode();
            getWindow().getDecorView().post(this::refreshNativeBattleHudInset);
        }
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
