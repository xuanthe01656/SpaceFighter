/**
 * Product catalog: catalog/progression.js.
 * Stable identifiers are persisted in Firebase profiles and operations.
 * Modify through a reviewed balance version; never mutate catalog objects at runtime.
 */
// ==========================================
// --- ĐƯỜNG CONG KINH NGHIỆM VÀ VIP (CURVES) ---
// ==========================================

// Hàm lấy mốc tính toán dựa trên mảng
const calculateLevelData = (totalPoints, reqArray) => {
  let level = 1;
  let accumulated = 0;
  for (let i = 0; i < reqArray.length; i++) {
    if (totalPoints >= accumulated + reqArray[i]) {
      accumulated += reqArray[i];
      level++;
    } else { break; }
  }
  const isMaxLevel = level > reqArray.length;
  const currentPointsInLevel = isMaxLevel ? reqArray[reqArray.length - 1] : totalPoints - accumulated;
  const pointsNeeded = isMaxLevel ? reqArray[reqArray.length - 1] : reqArray[level - 1];
  const percent = isMaxLevel ? 100 : Math.min((currentPointsInLevel / pointsNeeded) * 100, 100);

  return { level, currentPoints: currentPointsInLevel, maxPointsForNext: pointsNeeded, percent, isMaxLevel };
};

export const calculatePlayerLevel = (exp = 0) => {
  // Điểm cần thiết để LÊN CẤP TIẾP THEO (Càng lên cao càng dốc)
  // Vd: Lv1 lên Lv2 cần 500. Lv2 lên Lv3 cần 1000...
  const EXP_REQUIREMENTS = [500, 1000, 1800, 3000, 5000, 8500, 14000, 22000, 35000, 50000];
  const data = calculateLevelData(exp, EXP_REQUIREMENTS);
  return { level: data.level, currentExp: data.currentPoints, maxExpForNextLevel: data.maxPointsForNext, percent: data.percent, isMax: data.isMaxLevel };
};

export const calculateVIPLevel = (vipPoints = 0) => {
  // Điểm nạp cần thiết để lên VIP tiếp theo
  // Vd: Vip0 lên Vip1 cần 500. Vip1 lên Vip2 cần 1500 (tổng nạp 2000)...
  const VIP_REQUIREMENTS = [500, 1500, 3000, 5000, 10000, 20000, 50000];
  const data = calculateLevelData(vipPoints, VIP_REQUIREMENTS);
  return { level: data.level - 1, currentPoints: data.currentPoints, maxPointsForNext: data.maxPointsForNext, percent: data.percent, isMax: data.isMaxLevel }; // VIP bắt đầu từ 0
};
