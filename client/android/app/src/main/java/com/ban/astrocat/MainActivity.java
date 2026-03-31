package com.ban.astrocat; // Giữ nguyên package của bạn

import android.os.Bundle;
import android.view.View;
import androidx.activity.EdgeToEdge;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState); 
        // 1. Kích hoạt chế độ tràn viền theo chuẩn Android 15
        EdgeToEdge.enable(this); 
        // 2. Lấy khung nhìn gốc của ứng dụng Capacitor
        View contentView = findViewById(android.R.id.content);
        // 3. Tự động lắng nghe và tính toán kích thước các thanh hệ thống
        ViewCompat.setOnApplyWindowInsetsListener(contentView, (v, windowInsets) -> {
            Insets insets = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars());
            // Ép nội dung game thụt lùi vào trong, chừa khoảng trống cho Status Bar và Navigation Bar
            v.setPadding(insets.left, insets.top, insets.right, insets.bottom);
            return windowInsets;
        });
    }
}