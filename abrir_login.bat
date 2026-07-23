@echo off
echo ===================================================
echo 🔑 Abrindo Navegador para Login no Mercado Livre
echo ===================================================
echo.

set "CHROME_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe"
set "CHROME_PATH2=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
set "EDGE_PATH=C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"

:: Usa o mesmo perfil configurado no servidor/Coolify.
if defined MELI_PROFILE_DIR (
    set "USER_DATA_DIR=%MELI_PROFILE_DIR%"
) else if defined APP_DATA_DIR (
    set "USER_DATA_DIR=%APP_DATA_DIR%\ml_user_data"
) else (
    set "USER_DATA_DIR=%~dp0.tmp\ml_user_data"
)

if not exist "%USER_DATA_DIR%" mkdir "%USER_DATA_DIR%"
echo Perfil persistente: %USER_DATA_DIR%

if exist "%CHROME_PATH%" (
    echo Abrindo Google Chrome...
    start "" "%CHROME_PATH%" --user-data-dir="%USER_DATA_DIR%" --disable-blink-features=AutomationControlled "https://www.mercadolivre.com.br/l/afiliados-home"
    goto end
)

if exist "%CHROME_PATH2%" (
    echo Abrindo Google Chrome (x86)...
    start "" "%CHROME_PATH2%" --user-data-dir="%USER_DATA_DIR%" --disable-blink-features=AutomationControlled "https://www.mercadolivre.com.br/l/afiliados-home"
    goto end
)

if exist "%EDGE_PATH%" (
    echo Abrindo Microsoft Edge...
    start "" "%EDGE_PATH%" --user-data-dir="%USER_DATA_DIR%" --disable-blink-features=AutomationControlled "https://www.mercadolivre.com.br/l/afiliados-home"
    goto end
)

echo ❌ Erro: Nao foi possivel encontrar o Chrome ou o Edge no computador.
pause

:end
exit
