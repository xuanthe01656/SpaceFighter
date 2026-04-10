import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
//import obfuscator from 'vite-plugin-javascript-obfuscator';
export default defineConfig({
  plugins: [react(),
    // obfuscator({
    //   include: ['src/**/*.jsx', 'src/**/*.js'],
    //   exclude: [/node_modules/],
    //   apply: 'build', // Chỉ chạy khi build ra APK/Web bản production
    //   debugger: true,
    //   options: {
    //     compact: true,
    //     controlFlowFlattening: true, // Làm phẳng luồng điều khiển (rất khó đọc)
    //     controlFlowFlatteningThreshold: 0.7,
    //     deadCodeInjection: true, // Bơm code rác
    //     deadCodeInjectionThreshold: 0.4,
    //     stringArray: true,
    //     stringArrayEncoding: ['base64'], // Mã hóa các chuỗi text
    //     disableConsoleOutput: true, // Khóa luôn console.log
    //   }
    // })
  ],
  base: './',
  build: {
    outDir: 'dist', // Thư mục đầu ra để Capacitor copy vào Android
    sourcemap: false, // BẮT BUỘC: Đặt là false để không tạo file ánh xạ code gốc (hacker rất thích file này)
    minify: 'terser', // Sử dụng terser để nén code tối đa
    terserOptions: {
      compress: {
        drop_console: true, // Xóa sạch các lệnh console.log để tăng hiệu năng
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/socket.io': {
        target: 'http://localhost:3000',
        ws: true
      }
    }
  }
});
