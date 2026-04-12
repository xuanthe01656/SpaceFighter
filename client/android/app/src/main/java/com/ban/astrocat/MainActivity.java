package com.ban.astrocat;

import android.os.Bundle;
import androidx.activity.EdgeToEdge;

// 👇 1. IMPORT THÊM 3 THƯ VIỆN NÀY ĐỂ ĐIỀU KHIỂN HỆ THỐNG GIAO DIỆN ANDROID
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;
import com.codetrixstudio.capacitor.GoogleAuth.GoogleAuth;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Đăng ký Google Auth
        registerPlugin(GoogleAuth.class);
        
        super.onCreate(savedInstanceState); 
        EdgeToEdge.enable(this); 

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
}