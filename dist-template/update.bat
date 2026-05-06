@echo off
REM update.bat — 把 chexian-query 升级到新版
REM 用法:
REM   1. 数据负责人在群里发了新 zip(如 chexian-query-20260520.zip)
REM   2. 把新 zip 下载到 D:\(直接放在 D 盘根目录)
REM   3. 双击此文件
REM
REM 这个脚本做的事:
REM   - 找 D:\ 下最新的 chexian-query-*.zip
REM   - 备份当前 D:\chexian-query 到 D:\chexian-query-backup\
REM   - 解压新版到 D:\chexian-query\
REM   - 完成后请测试无误后手动删除备份目录

setlocal enabledelayedexpansion
set "TARGET=D:\chexian-query"
set "BACKUP=D:\chexian-query-backup"
set "NEW_ZIP="

for /F "delims=" %%F in ('dir /B /O-D "D:\chexian-query-*.zip" 2^>nul') do (
  set "NEW_ZIP=D:\%%F"
  goto :found
)

echo [错误] D:\ 根目录下找不到 chexian-query-*.zip
echo 请把数据负责人发来的新版 zip 放到 D:\(直接根目录,不要放在子文件夹),
echo 然后重新双击此文件。
pause
exit /b 1

:found
echo.
echo [信息] 找到新版: !NEW_ZIP!
echo.

if exist "!BACKUP!" (
  echo [清理] 删除旧备份 !BACKUP!
  rmdir /S /Q "!BACKUP!"
)

if exist "!TARGET!" (
  echo [备份] 移动当前版本 -^> !BACKUP!
  move /Y "!TARGET!" "!BACKUP!" >nul
  if errorlevel 1 (
    echo [错误] 备份失败。请确保 TRAE / Node.js / 其它程序未占用 !TARGET!,然后重试。
    pause
    exit /b 1
  )
)

echo [解压] !NEW_ZIP! -^> !TARGET!
powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -LiteralPath '!NEW_ZIP!' -DestinationPath 'D:\' -Force"
if errorlevel 1 (
  echo [错误] 解压失败,正在还原备份...
  if exist "!BACKUP!" move /Y "!BACKUP!" "!TARGET!" >nul
  pause
  exit /b 1
)

echo.
echo [完成] 升级完毕。
echo   - 新版位置:!TARGET!
echo   - 旧版备份:!BACKUP!(测试无误后可手动删除)
echo   - 新版 zip:!NEW_ZIP!(可手动删除)
echo.
echo 请打开 TRAE 测试新版能否正常查询。
pause
