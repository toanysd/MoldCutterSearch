@echo off
cd /d %~dp0
cd Data
git add .
git commit -m "Cập nhật dữ liệu CSV tự động"
git push origin main
echo ==================================
echo ✅ Dữ liệu đã được cập nhật lên GitHub!
echo ==================================
pause
